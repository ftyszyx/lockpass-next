import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools" / "pc_release.py"
SPEC = importlib.util.spec_from_file_location("pc_release", MODULE_PATH)
pc_release = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = pc_release
SPEC.loader.exec_module(pc_release)


class PcReleaseTests(unittest.TestCase):
    def test_release_prefix_uses_apps_dir_identifier_channel_and_platform(self):
        self.assertEqual(
            pc_release.release_prefix_for(
                "com.lockpass.next",
                "web",
                "windows-x86_64",
                {"OSS_APPS_DIR": "apps"},
            ),
            "apps/com.lockpass.next/web/windows-x86_64",
        )

    def test_manifest_url_uses_release_prefix(self):
        self.assertEqual(
            pc_release.manifest_url_for(
                "com.lockpass.next",
                "web",
                "windows-x86_64",
                "latest.json",
                {"OSS_APPS_DIR": "apps", "OSS_PUBLIC_BASE_URL": "https://updates.example.com"},
            ),
            "https://updates.example.com/apps/com.lockpass.next/web/windows-x86_64/latest.json",
        )

    def test_channel_and_platform_are_required_arguments(self):
        parser = pc_release.build_arg_parser()

        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args([])
            with self.assertRaises(SystemExit):
                parser.parse_args(["--channel", "web"])

        args = parser.parse_args(["--channel", "web", "--platform", "windows-x86_64"])
        self.assertEqual(args.channel, "web")
        self.assertEqual(args.platform, "windows-x86_64")

    def test_release_output_settings_are_hardcoded(self):
        self.assertEqual(pc_release.resolve_dist_dir(), (ROOT / "tools" / "dist" / "pc_release").resolve())
        self.assertEqual(pc_release.resolve_latest_name(), "latest.json")

    def test_release_version_for_build_reads_release_tag(self):
        self.assertEqual(
            pc_release.release_version_for_build("0.1.0", {"RELEASE_TAG": "v1.2.3"}),
            "1.2.3",
        )
        self.assertEqual(
            pc_release.release_version_for_build(
                "0.1.0",
                {"RELEASE_TAG": "refs/tags/v2.0.0-beta.1+build.5"},
            ),
            "2.0.0-beta.1+build.5",
        )
        self.assertEqual(pc_release.release_version_for_build("0.1.0", {}), "0.1.0")

    def test_release_version_for_build_rejects_invalid_release_tag(self):
        with self.assertRaisesRegex(SystemExit, "Invalid release tag"):
            pc_release.release_version_for_build("0.1.0", {"RELEASE_TAG": "release-next"})

    def test_sync_desktop_release_versions_updates_all_version_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            package_json = root / "package.json"
            cargo_toml = root / "Cargo.toml"
            tauri_config = root / "tauri.conf.json5"
            package_json.write_text('{"name":"desktop","version":"0.1.0"}\n', encoding="utf-8")
            cargo_toml.write_text('[package]\nversion = "0.1.0"\n', encoding="utf-8")
            tauri_config.write_text("{\n  version: '0.1.0',\n}\n", encoding="utf-8")

            with mock.patch.object(pc_release, "DESKTOP_PACKAGE_JSON", package_json), mock.patch.object(
                pc_release, "TAURI_CARGO_TOML", cargo_toml
            ), mock.patch.object(pc_release, "TAURI_CONFIG", tauri_config):
                pc_release.sync_desktop_release_versions("1.2.3")

            self.assertIn('"version": "1.2.3"', package_json.read_text(encoding="utf-8"))
            self.assertIn('version = "1.2.3"', cargo_toml.read_text(encoding="utf-8"))
            self.assertIn("version: '1.2.3'", tauri_config.read_text(encoding="utf-8"))

    def test_resolve_channel_rejects_invalid_names(self):
        with self.assertRaises(SystemExit):
            pc_release.normalize_channel("../prod")

    def test_resolve_signing_private_key_reads_project_path(self):
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            pc_release, "ROOT", Path(temp_dir)
        ):
            key_path = Path(temp_dir) / "tools" / "keys" / "lockpass.key"
            key_path.parent.mkdir(parents=True)
            key_path.write_text("private-key", encoding="utf-8")

            self.assertEqual(
                pc_release.resolve_signing_private_key(
                    None,
                    {"LOCKPASS_SIGNING_PRIVATE_KEY_PATH": "tools/keys/lockpass.key"},
                ),
                key_path,
            )

    def test_resolve_signing_public_key_reads_project_path(self):
        with tempfile.TemporaryDirectory() as temp_dir, mock.patch.object(
            pc_release, "ROOT", Path(temp_dir)
        ):
            key_path = Path(temp_dir) / "tools" / "keys" / "lockpass.key.pub"
            key_path.parent.mkdir(parents=True)
            key_path.write_text("public-key\n", encoding="utf-8")

            self.assertEqual(
                pc_release.resolve_signing_public_key(
                    None,
                    {"LOCKPASS_SIGNING_PUBLIC_KEY_PATH": "tools/keys/lockpass.key.pub"},
                ),
                "public-key",
            )

    def test_validate_updater_public_key_rejects_mismatch(self):
        config = {"plugins": {"updater": {"pubkey": "configured-key"}}}

        with self.assertRaisesRegex(SystemExit, "does not match"):
            pc_release.validate_updater_public_key(config, "different-key")


if __name__ == "__main__":
    unittest.main()
