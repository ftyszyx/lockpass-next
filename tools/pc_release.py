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
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
DESKTOP_DIR = ROOT / "apps" / "desktop"
TAURI_DIR = DESKTOP_DIR / "src-tauri"
TAURI_CONFIG = TAURI_DIR / "tauri.conf.json5"
NSIS_DIR = TAURI_DIR / "target" / "release" / "bundle" / "nsis"
DEFAULT_DIST_DIR = ROOT / "tools" / "dist" / "pc_release"
DEFAULT_KEY_PATH = Path.home() / ".tauri" / "lockpass.key"
DEFAULT_PLATFORM = "windows-x86_64"
DEFAULT_PUBLIC_BASE_URL = "https://updates.lockpass.example.com"


@dataclass(frozen=True)
class ReleaseArtifact:
    version: str
    installer_path: Path
    signature_path: Path
    latest_json_path: Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Build LockPass Windows NSIS release and optionally upload to OSS.")
    parser.add_argument("--env", default=str(ROOT / "tools" / "pc_release.env"), help="Optional env file path.")
    parser.add_argument("--skip-build", action="store_true", help="Reuse the existing NSIS bundle output.")
    parser.add_argument("--upload", action="store_true", help="Upload installer, signature and latest.json to OSS.")
    parser.add_argument("--dry-run", action="store_true", help="Print upload actions without writing to OSS.")
    parser.add_argument("--overwrite", action="store_true", help="Allow overwriting existing OSS installer/signature objects.")
    parser.add_argument("--notes", default=None, help="Release notes written to latest.json.")
    parser.add_argument("--dist-dir", default=str(DEFAULT_DIST_DIR), help="Directory for copied artifacts and latest.json.")
    parser.add_argument("--signing-key", default=None, help="Updater private key path. Defaults to env or ~/.tauri/lockpass.key.")
    parser.add_argument("--public-base-url", default=None, help="Public base URL for update files.")
    parser.add_argument("--oss-prefix", default=None, help="OSS object prefix, for example desktop.")
    parser.add_argument("--oss-endpoint", default=None, help="OSS endpoint, overrides env.")
    parser.add_argument("--oss-bucket", default=None, help="OSS bucket, overrides env.")
    parser.add_argument("--latest-name", default="latest.json", help="Update manifest file name.")
    parser.add_argument("--platform", default=DEFAULT_PLATFORM, help="Tauri updater platform key.")
    args = parser.parse_args()

    env_file = Path(args.env)
    file_env = load_env_file(env_file) if env_file.exists() else {}
    env = {**os.environ, **file_env}

    signing_key = resolve_signing_key(args.signing_key, env)
    if not args.skip_build:
        build_release(signing_key, env)

    dist_dir = Path(args.dist_dir).resolve()
    version = read_json5_string(TAURI_CONFIG, "version")
    artifact = collect_artifact(version, dist_dir, args.notes, args.platform, args.public_base_url, args.oss_prefix, env, args.latest_name)

    print(f"Release version: {artifact.version}")
    print(f"Installer: {artifact.installer_path}")
    print(f"Signature: {artifact.signature_path}")
    print(f"Latest JSON: {artifact.latest_json_path}")

    if args.upload:
        if args.oss_endpoint:
            env["OSS_ENDPOINT"] = args.oss_endpoint
        if args.oss_bucket:
            env["OSS_BUCKET"] = args.oss_bucket
        upload_to_oss(artifact, args.oss_prefix, args.latest_name, env, args.dry_run, args.overwrite)

    return 0


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


def strip_env_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def resolve_signing_key(argument: str | None, env: dict[str, str]) -> Path | None:
    if env.get("TAURI_SIGNING_PRIVATE_KEY"):
        return None

    key_text = argument or env.get("TAURI_SIGNING_PRIVATE_KEY_PATH") or env.get("LOCKPASS_SIGNING_KEY_PATH")
    key_path = Path(os.path.expandvars(os.path.expanduser(key_text))) if key_text else DEFAULT_KEY_PATH
    if not key_path.exists():
        raise SystemExit(
            f"Updater signing key not found: {key_path}\n"
            "Generate one with:\n"
            "  npm exec -w @lockpass/desktop tauri signer generate -- --write-keys \"%USERPROFILE%\\.tauri\\lockpass.key\" --ci --force"
        )
    return key_path


def build_release(signing_key: Path | None, base_env: dict[str, str]) -> None:
    if NSIS_DIR.exists():
        shutil.rmtree(NSIS_DIR)

    env = os.environ.copy()
    env.update(base_env)
    if signing_key is not None:
        env["TAURI_SIGNING_PRIVATE_KEY"] = signing_key.read_text(encoding="utf-8")
        env.setdefault("TAURI_SIGNING_PRIVATE_KEY_PASSWORD", "")

    run(["npm", "run", "-w", "@lockpass/desktop", "tauri:build"], env=env)


def run(command: list[str], env: dict[str, str] | None = None) -> None:
    print("+ " + " ".join(command))
    executable = shutil.which(command[0], path=(env or os.environ).get("PATH"))
    subprocess.run([executable or command[0], *command[1:]], cwd=ROOT, env=env, check=True)


def read_json5_string(path: Path, key: str) -> str:
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"(?m)^\s*{re.escape(key)}\s*:\s*['\"]([^'\"]+)['\"]", text)
    if not match:
        raise SystemExit(f"Could not find {key!r} in {path}")
    return match.group(1)


def collect_artifact(
    version: str,
    dist_dir: Path,
    notes: str | None,
    platform: str,
    public_base_url: str | None,
    oss_prefix: str | None,
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

    base_url = resolve_public_base_url(public_base_url, env)
    asset_prefix = normalize_prefix(oss_prefix or env.get("OSS_ASSET_PREFIX") or join_key(env.get("OSS_PREFIX") or env.get("OSS_PATH") or "desktop", "windows"))
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


def resolve_public_base_url(argument: str | None, env: dict[str, str]) -> str:
    value = argument or env.get("OSS_PUBLIC_BASE_URL") or env.get("UPDATE_PUBLIC_BASE_URL")
    if value:
        return value.rstrip("/")

    bucket = env.get("OSS_BUCKET")
    endpoint = env.get("OSS_ENDPOINT")
    if bucket and endpoint:
        return f"https://{bucket}.{endpoint.replace('https://', '').replace('http://', '').rstrip('/')}"

    return DEFAULT_PUBLIC_BASE_URL


def upload_to_oss(
    artifact: ReleaseArtifact,
    oss_prefix_arg: str | None,
    latest_name: str,
    env: dict[str, str],
    dry_run: bool,
    overwrite: bool,
) -> None:
    endpoint = required_env(env, "OSS_ENDPOINT")
    bucket_name = required_env(env, "OSS_BUCKET")
    root_prefix = normalize_prefix(env.get("OSS_PREFIX") or env.get("OSS_PATH") or "desktop")
    asset_prefix = normalize_prefix(oss_prefix_arg or env.get("OSS_ASSET_PREFIX") or join_key(root_prefix, "windows"))
    latest_key = normalize_key(env.get("OSS_LATEST_KEY") or join_key(root_prefix, latest_name))
    public_read = parse_bool(env.get("OSS_PUBLIC_READ", "true"))

    uploads = [
        (artifact.installer_path, normalize_key(join_key(asset_prefix, artifact.installer_path.name)), False),
        (artifact.signature_path, normalize_key(join_key(asset_prefix, artifact.signature_path.name)), False),
        (artifact.latest_json_path, latest_key, True),
    ]

    print(f"OSS bucket: {bucket_name}")
    print(f"OSS endpoint: {endpoint}")
    if dry_run:
        for source, key, _allow_overwrite in uploads:
            print(f"Upload {source} -> oss://{bucket_name}/{key}")
        return

    try:
        import oss2  # type: ignore
    except ImportError as error:
        raise SystemExit("Missing Python package 'oss2'. Install it with: python -m pip install -r tools/requirements.txt") from error

    key_id = required_env(env, "OSS_ACCESS_KEY_ID")
    key_secret = required_env(env, "OSS_ACCESS_KEY_SECRET")
    bucket = oss2.Bucket(oss2.Auth(key_id, key_secret), endpoint, bucket_name)

    for source, key, allow_overwrite in uploads:
        print(f"Upload {source} -> oss://{bucket_name}/{key}")
        if bucket.object_exists(key) and not (overwrite or allow_overwrite):
            raise SystemExit(f"OSS object already exists: {key}. Use --overwrite to replace it.")
        bucket.put_object_from_file(key, str(source))
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
