#!/usr/bin/env python3
"""Build and optionally publish the LockPass Windows desktop release."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
DESKTOP_DIR = ROOT / "apps" / "desktop"
DESKTOP_PACKAGE_JSON = DESKTOP_DIR / "package.json"
TAURI_DIR = DESKTOP_DIR / "src-tauri"
TAURI_CONFIG = TAURI_DIR / "tauri.conf.json5"
TAURI_CARGO_TOML = TAURI_DIR / "Cargo.toml"
NSIS_DIR = TAURI_DIR / "target" / "release" / "bundle" / "nsis"
DEFAULT_DIST_DIR = ROOT / "tools" / "dist" / "pc_release"
DEFAULT_KEY_PATH = Path.home() / ".tauri" / "lockpass.key"
DEFAULT_PUBLIC_BASE_URL = "https://updates.lockpass.example.com"
DEFAULT_LATEST_NAME = "latest.json"
DEFAULT_OSS_APPS_DIR = "apps"
IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable"
LATEST_JSON_CACHE_CONTROL = "no-cache"
VERSION_TAG_PATTERN = re.compile(
    r"(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)\."
    r"(0|[1-9]\d*)"
    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


@dataclass(frozen=True)
class ReleaseArtifact:
    version: str
    installer_path: Path
    signature_path: Path
    latest_json_path: Path


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    env_file = Path(os.environ.get("LOCKPASS_RELEASE_ENV", ROOT / "tools" / "pc_release.env"))
    file_env = load_env_file(env_file) if env_file.exists() else {}
    env = {**os.environ, **file_env}

    config = read_tauri_config()
    config_version = config_string(config, "version")
    version = release_version_for_build(config_version, env)
    sync_desktop_release_versions(version)
    if version != config_version:
        config = merge_dicts(config, {"version": version})
    app_id = config_string(config, "identifier")
    platform = args.platform
    channel = normalize_channel(args.channel)
    latest_name = DEFAULT_LATEST_NAME

    signing_private_key = resolve_signing_private_key(None, env)
    signing_public_key = resolve_signing_public_key(signing_private_key, env)
    release_config = release_tauri_config(config, app_id, channel, platform, latest_name, env)
    validate_updater_public_key(release_config, signing_public_key)
    build_release(signing_private_key, env, release_config)

    dist_dir = resolve_dist_dir()
    artifact = collect_artifact(version, app_id, channel, dist_dir, args.notes, platform, env, latest_name)

    print(f"Release version: {artifact.version}")
    print(f"App ID: {app_id}")
    print(f"Channel: {channel}")
    print(f"Platform: {platform}")
    print(f"Installer: {artifact.installer_path}")
    print(f"Signature: {artifact.signature_path}")
    print(f"Latest JSON: {artifact.latest_json_path}")

    if args.upload:
        upload_to_oss(artifact, app_id, channel, platform, latest_name, env)

    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build LockPass Windows NSIS release and optionally upload to OSS.")
    parser.add_argument("--channel", required=True, help="Release channel, for example web.")
    parser.add_argument("--platform", required=True, help="Tauri updater platform key, for example windows-x86_64.")
    parser.add_argument("--upload", action="store_true", help="Upload installer, signature and latest.json to OSS.")
    parser.add_argument("--notes", default=None, help="Release notes written to latest.json.")
    return parser


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator:
            continue
        values[key.strip()] = strip_env_quotes(value.strip())
    return values


def resolve_dist_dir() -> Path:
    return DEFAULT_DIST_DIR.resolve()


def normalize_channel(value: str) -> str:
    normalized = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", normalized):
        raise SystemExit(f"Invalid release channel {value!r}. Use lowercase letters, numbers and hyphens.")
    return normalized


def release_version_for_build(config_version: str, env: dict[str, str]) -> str:
    release_tag = env.get("RELEASE_TAG", "").strip()
    if not release_tag:
        return config_version
    return version_from_release_tag(release_tag)


def version_from_release_tag(release_tag: str) -> str:
    tag = release_tag.strip()
    if tag.startswith("refs/tags/"):
        tag = tag.removeprefix("refs/tags/")
    if tag[:1].lower() == "v":
        tag = tag[1:]
    if not VERSION_TAG_PATTERN.fullmatch(tag):
        raise SystemExit(
            f"Invalid release tag {release_tag!r}. Expected a semantic version tag like v1.2.3."
        )
    return tag


def sync_desktop_release_versions(version: str) -> None:
    sync_package_json_version(DESKTOP_PACKAGE_JSON, version)
    sync_cargo_toml_version(TAURI_CARGO_TOML, version)
    sync_tauri_config_version(TAURI_CONFIG, version)


def sync_package_json_version(path: Path, version: str) -> None:
    package = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(package, dict):
        raise SystemExit(f"Invalid JSON object in {path}")
    if package.get("version") == version:
        return
    package["version"] = version
    write_text_utf8_lf(path, json.dumps(package, ensure_ascii=False, indent=2) + "\n")


def sync_cargo_toml_version(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8-sig")
    match = re.search(r'(?m)^(version\s*=\s*)"([^"]+)"', text)
    if match is None:
        raise SystemExit(f"Could not find package version in {path}")
    if match.group(2) == version:
        return
    updated = re.sub(
        r'(?m)^(version\s*=\s*)"[^"]+"',
        rf'\1"{version}"',
        text,
        count=1,
    )
    write_text_utf8_lf(path, updated)


def sync_tauri_config_version(path: Path, version: str) -> None:
    text = path.read_text(encoding="utf-8-sig")
    pattern = re.compile(r"(?m)^(\s*version\s*:\s*)(['\"])([^'\"]+)\2")
    match = pattern.search(text)
    if match is None:
        raise SystemExit(f"Could not find Tauri config version in {path}")
    if match.group(3) == version:
        return
    updated = pattern.sub(
        lambda value: f"{value.group(1)}{value.group(2)}{version}{value.group(2)}",
        text,
        count=1,
    )
    write_text_utf8_lf(path, updated)


def write_text_utf8_lf(path: Path, value: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        file.write(value)


def resolve_latest_name() -> str:
    return DEFAULT_LATEST_NAME


def strip_env_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def expand_config_path(value: str) -> Path:
    path = Path(os.path.expandvars(os.path.expanduser(value)))
    if not path.is_absolute():
        path = ROOT / path
    return path


def resolve_signing_private_key(argument: str | None, env: dict[str, str]) -> Path | None:
    if env.get("TAURI_SIGNING_PRIVATE_KEY"):
        return None

    key_text = (
        argument
        or env.get("TAURI_SIGNING_PRIVATE_KEY_PATH")
        or env.get("LOCKPASS_SIGNING_PRIVATE_KEY_PATH")
    )
    key_path = expand_config_path(key_text) if key_text else DEFAULT_KEY_PATH
    if not key_path.exists():
        raise SystemExit(
            f"Updater signing private key not found: {key_path}\n"
            "Generate one with:\n"
            "  npm exec -w @lockpass/desktop tauri signer generate -- --write-keys \"%USERPROFILE%\\.tauri\\lockpass.key\" --ci --force"
        )
    return key_path


def resolve_signing_public_key(signing_private_key: Path | None, env: dict[str, str]) -> str:
    value = env.get("TAURI_SIGNING_PUBLIC_KEY")
    if value:
        return value.strip()

    public_key_text = env.get("TAURI_SIGNING_PUBLIC_KEY_PATH") or env.get(
        "LOCKPASS_SIGNING_PUBLIC_KEY_PATH"
    )
    if public_key_text:
        public_key_path = expand_config_path(public_key_text)
    else:
        private_key_path = signing_private_key or DEFAULT_KEY_PATH
        public_key_path = Path(f"{private_key_path}.pub")

    if not public_key_path.exists():
        raise SystemExit(
            f"Updater signing public key not found: {public_key_path}\n"
            "Set TAURI_SIGNING_PUBLIC_KEY or LOCKPASS_SIGNING_PUBLIC_KEY_PATH, "
            "or generate a key pair with:\n"
            "  npm exec -w @lockpass/desktop tauri signer generate -- --write-keys \"%USERPROFILE%\\.tauri\\lockpass.key\" --ci --force"
        )

    value = public_key_path.read_text(encoding="utf-8").strip()
    if not value:
        raise SystemExit(f"Updater signing public key is empty: {public_key_path}")
    return value


def validate_updater_public_key(config: dict[str, object], expected_public_key: str) -> None:
    plugins = config.get("plugins")
    updater = plugins.get("updater") if isinstance(plugins, dict) else None
    configured_public_key = updater.get("pubkey") if isinstance(updater, dict) else None
    if not isinstance(configured_public_key, str) or not configured_public_key.strip():
        raise SystemExit(f"plugins.updater.pubkey must be set in {TAURI_CONFIG}")
    if configured_public_key.strip() != expected_public_key:
        raise SystemExit(
            "plugins.updater.pubkey does not match the configured updater signing public key."
        )


def build_release(signing_private_key: Path | None, base_env: dict[str, str], config: dict[str, object]) -> None:
    if NSIS_DIR.exists():
        shutil.rmtree(NSIS_DIR)

    env = os.environ.copy()
    env.update(base_env)
    if signing_private_key is not None:
        env["TAURI_SIGNING_PRIVATE_KEY"] = signing_private_key.read_text(encoding="utf-8")
        env.setdefault("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "")

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as config_file:
        json.dump(config, config_file, ensure_ascii=False, indent=2)
        config_path = Path(config_file.name)
    try:
        run(["npm", "run", "-w", "@lockpass/desktop", "tauri:build", "--", "--config", str(config_path)], env=env)
    finally:
        config_path.unlink(missing_ok=True)


def run(command: list[str], env: dict[str, str] | None = None) -> None:
    print("+ " + " ".join(command))
    executable = shutil.which(command[0], path=(env or os.environ).get("PATH"))
    subprocess.run([executable or command[0], *command[1:]], cwd=ROOT, env=env, check=True)


def read_tauri_config() -> dict[str, object]:
    text = TAURI_CONFIG.read_text(encoding="utf-8-sig")
    try:
        import json5  # type: ignore
    except ImportError as error:
        raise SystemExit(
            "Missing Python package 'json5'. Install release tool dependencies with: "
            "python -m pip install -r tools/requirements.txt"
        ) from error
    return json5.loads(text)


def config_string(config: dict[str, object], key: str) -> str:
    value = config.get(key)
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"Could not find non-empty {key!r} in {TAURI_CONFIG}")
    return value.strip()


def release_tauri_config(
    base_config: dict[str, object],
    app_id: str,
    channel: str,
    platform: str,
    latest_name: str,
    env: dict[str, str],
) -> dict[str, object]:
    return merge_dicts(
        base_config,
        {
            "plugins": {
                "updater": {
                    "endpoints": [manifest_url_for(app_id, channel, platform, latest_name, env)],
                }
            }
        },
    )


def merge_dicts(left: dict[str, object], right: dict[str, object]) -> dict[str, object]:
    merged = dict(left)
    for key, right_value in right.items():
        left_value = merged.get(key)
        if isinstance(left_value, dict) and isinstance(right_value, dict):
            merged[key] = merge_dicts(left_value, right_value)
        else:
            merged[key] = right_value
    return merged


def collect_artifact(
    version: str,
    app_id: str,
    channel: str,
    dist_dir: Path,
    notes: str | None,
    platform: str,
    env: dict[str, str],
    latest_name: str,
) -> ReleaseArtifact:
    installer = newest_file(NSIS_DIR.glob("*-setup.exe"))
    signature = Path(f"{installer}.sig")
    if not signature.exists():
        raise SystemExit(f"Signature file not found: {signature}")

    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True, exist_ok=True)

    installer_copy = dist_dir / installer.name
    signature_copy = dist_dir / signature.name
    shutil.copy2(installer, installer_copy)
    shutil.copy2(signature, signature_copy)

    base_url = resolve_public_base_url(env)
    asset_prefix = release_prefix_for(app_id, channel, platform, env)
    installer_url = join_url(base_url, asset_prefix, installer_copy.name)
    latest = {
        "version": version,
        "notes": notes if notes is not None else env.get("RELEASE_NOTES", ""),
        "pub_date": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "platforms": {
            platform: {
                "signature": signature_copy.read_text(encoding="utf-8").strip(),
                "url": installer_url,
            }
        },
    }

    latest_path = dist_dir / latest_name
    latest_path.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return ReleaseArtifact(version, installer_copy, signature_copy, latest_path)


def newest_file(files: Iterable[Path]) -> Path:
    candidates = [path for path in files if path.is_file()]
    if not candidates:
        raise SystemExit(f"No NSIS installer found in {NSIS_DIR}")
    return max(candidates, key=lambda path: path.stat().st_mtime)


def resolve_public_base_url(env: dict[str, str]) -> str:
    value = env.get("OSS_PUBLIC_BASE_URL") or env.get("UPDATE_PUBLIC_BASE_URL")
    if value:
        return value.rstrip("/")

    bucket = env.get("OSS_BUCKET")
    endpoint = env.get("OSS_ENDPOINT")
    if bucket and endpoint:
        return f"https://{bucket}.{endpoint.replace('https://', '').replace('http://', '').rstrip('/')}"

    return DEFAULT_PUBLIC_BASE_URL


def release_prefix_for(app_id: str, channel: str, platform: str, env: dict[str, str]) -> str:
    apps_dir = normalize_prefix(env.get("OSS_APPS_DIR") or DEFAULT_OSS_APPS_DIR)
    return normalize_prefix(join_key(apps_dir, app_id, channel, platform))


def manifest_url_for(app_id: str, channel: str, platform: str, latest_name: str, env: dict[str, str]) -> str:
    return join_url(resolve_public_base_url(env), release_prefix_for(app_id, channel, platform, env), latest_name)


def upload_to_oss(
    artifact: ReleaseArtifact,
    app_id: str,
    channel: str,
    platform: str,
    latest_name: str,
    env: dict[str, str],
) -> None:
    endpoint = required_env(env, "OSS_ENDPOINT")
    bucket_name = required_env(env, "OSS_BUCKET")
    release_prefix = release_prefix_for(app_id, channel, platform, env)
    latest_key = normalize_key(join_key(release_prefix, latest_name))
    public_read = parse_bool(env.get("OSS_PUBLIC_READ", "true"))

    uploads = [
        (
            artifact.installer_path,
            normalize_key(join_key(release_prefix, artifact.installer_path.name)),
            IMMUTABLE_ASSET_CACHE_CONTROL,
        ),
        (
            artifact.signature_path,
            normalize_key(join_key(release_prefix, artifact.signature_path.name)),
            IMMUTABLE_ASSET_CACHE_CONTROL,
        ),
        (
            artifact.latest_json_path,
            latest_key,
            LATEST_JSON_CACHE_CONTROL,
        ),
    ]

    print(f"OSS bucket: {bucket_name}")
    print(f"OSS endpoint: {endpoint}")

    try:
        import oss2  # type: ignore
    except ImportError as error:
        raise SystemExit("Missing Python package 'oss2'. Install it with: python -m pip install -r tools/requirements.txt") from error

    key_id = required_env(env, "OSS_ACCESS_KEY_ID")
    key_secret = required_env(env, "OSS_ACCESS_KEY_SECRET")
    bucket = oss2.Bucket(oss2.Auth(key_id, key_secret), endpoint, bucket_name)

    for source, key, cache_control in uploads:
        print(f"Upload {source} -> oss://{bucket_name}/{key}")
        bucket.put_object_from_file(key, str(source), headers={"Cache-Control": cache_control})
        if public_read:
            bucket.put_object_acl(key, oss2.OBJECT_ACL_PUBLIC_READ)


def required_env(env: dict[str, str], key: str) -> str:
    value = env.get(key)
    if not value:
        raise SystemExit(f"Missing required environment variable: {key}")
    return value


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def normalize_prefix(value: str) -> str:
    return normalize_key(value).rstrip("/")


def normalize_key(value: str) -> str:
    return value.replace("\\", "/").strip("/")


def join_key(*parts: str) -> str:
    return "/".join(normalize_key(part) for part in parts if part and normalize_key(part))


def join_url(base_url: str, *parts: str) -> str:
    encoded_parts = [quote(part, safe="/") for part in parts if part]
    return "/".join([base_url.rstrip("/"), *[part.strip("/") for part in encoded_parts]])


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode) from error
