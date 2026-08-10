import importlib.util
import io
import json
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

    def test_sync_browser_extension_release_version_updates_package_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            browser_package_json = Path(temp_dir) / "package.json"
            browser_package_json.write_text(
                '{"name":"browser-extension","version":"0.1.0"}\n',
                encoding="utf-8",
            )

            with mock.patch.object(pc_release, "BROWSER_EXTENSION_PACKAGE_JSON", browser_package_json):
                pc_release.sync_browser_extension_release_version("1.2.3")

            package = json.loads(browser_package_json.read_text(encoding="utf-8"))
            self.assertEqual(package["version"], "1.2.3")

    def test_normalize_platform_supports_chrome_store(self):
        self.assertEqual(pc_release.normalize_platform("CHROME-STORE"), "chrome-store")
        with self.assertRaises(SystemExit):
            pc_release.normalize_platform("../chrome-store")

    def test_build_browser_extension_uses_release_environment_and_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            expected_package = output_dir / "lockpass-browser-extension-v1.2.3.zip"
            base_env = {
                "VITE_LOCKPASS_OFFICIAL_SERVER_URL": "https://lockpass.example.com",
                "VITE_LOCKPASS_OFFICIAL_API_URL": "https://lockpass.example.com",
            }

            def fake_run(command, env=None):
                self.assertEqual(
                    command,
                    ["npm", "run", "-w", "@lockpass/browser-extension", "package:store"],
                )
                self.assertEqual(env["VITE_LOCKPASS_OFFICIAL_SERVER_URL"], base_env["VITE_LOCKPASS_OFFICIAL_SERVER_URL"])
                self.assertEqual(env["VITE_LOCKPASS_OFFICIAL_API_URL"], base_env["VITE_LOCKPASS_OFFICIAL_API_URL"])
                expected_package.write_bytes(b"extension")

            with mock.patch.object(pc_release, "BROWSER_EXTENSION_OUTPUT_DIR", output_dir), mock.patch.object(
                pc_release, "run", side_effect=fake_run
            ):
                package = pc_release.build_browser_extension("1.2.3", base_env)

            self.assertEqual(package, expected_package)

    def test_collect_desktop_artifact_generates_single_platform_latest_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            nsis_dir = root / "nsis"
            nsis_dir.mkdir()
            installer = nsis_dir / "LockPass_1.2.3_x64-setup.exe"
            installer.write_bytes(b"installer")
            Path(f"{installer}.sig").write_text("signature\n", encoding="utf-8")
            chrome_store_dir = root / "dist" / "chrome-store"
            chrome_store_dir.mkdir(parents=True)
            existing_browser_package = chrome_store_dir / "existing.zip"
            existing_browser_package.write_bytes(b"extension")
            with mock.patch.object(pc_release, "NSIS_DIR", nsis_dir):
                artifact = pc_release.collect_artifact(
                    version="1.2.3",
                    app_id="com.lockpass.next",
                    channel="web",
                    dist_dir=root / "dist",
                    notes="release",
                    platform="windows-x86_64",
                    env={"OSS_PUBLIC_BASE_URL": "https://updates.example.com"},
                    latest_name="latest.json",
                )

            self.assertTrue(artifact.installer_path.exists())
            self.assertTrue(artifact.signature_path.exists())
            self.assertTrue(artifact.latest_json_path.exists())
            self.assertTrue(existing_browser_package.exists())

            latest = json.loads(artifact.latest_json_path.read_text(encoding="utf-8"))
            self.assertEqual(latest["version"], "1.2.3")
            self.assertEqual(latest["channel"], "web")
            self.assertEqual(latest["platform"], "windows-x86_64")
            self.assertEqual(latest["notes"], "release")
            self.assertEqual(latest["signature"], "signature")
            self.assertEqual(
                latest["url"],
                "https://updates.example.com/apps/com.lockpass.next/web/windows-x86_64/LockPass_1.2.3_x64-setup.exe",
            )
            self.assertNotIn("platforms", latest)

    def test_desktop_release_uploads_exclude_browser_extension(self):
        root = Path("dist")
        artifact = pc_release.ReleaseArtifact(
            version="1.2.3",
            installer_path=root / "LockPass-setup.exe",
            signature_path=root / "LockPass-setup.exe.sig",
            latest_json_path=root / "latest.json",
        )

        uploads = pc_release.release_uploads(
            artifact,
            "apps/com.lockpass.next/web/windows-x86_64",
            "latest.json",
        )

        self.assertEqual(
            [source.name for source, _, _ in uploads],
            [
                "LockPass-setup.exe",
                "LockPass-setup.exe.sig",
                "latest.json",
            ],
        )

    def test_collect_and_upload_browser_extension_artifact(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            package = root / "lockpass-browser-extension-v1.2.3.zip"
            package.write_bytes(b"extension")

            artifact = pc_release.collect_browser_extension_artifact(
                "1.2.3",
                package,
                root / "dist",
            )
            uploads = pc_release.browser_extension_uploads(
                artifact,
                "apps/com.lockpass.next/web/chrome-store",
            )

            self.assertEqual(
                artifact.package_path,
                root / "dist" / "chrome-store" / package.name,
            )
            self.assertEqual(artifact.package_path.read_bytes(), b"extension")
            self.assertEqual([source.name for source, _, _ in uploads], [package.name])
            self.assertEqual(
                uploads[0][1],
                "apps/com.lockpass.next/web/chrome-store/lockpass-browser-extension-v1.2.3.zip",
            )

    def test_build_chrome_store_release_uses_release_tag_without_desktop_build(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            package_json = root / "package.json"
            package_json.write_text(
                '{"name":"browser-extension","version":"0.1.0"}\n',
                encoding="utf-8",
            )
            package = root / "lockpass-browser-extension-v1.2.3.zip"
            package.write_bytes(b"extension")

            with mock.patch.object(pc_release, "BROWSER_EXTENSION_PACKAGE_JSON", package_json), mock.patch.object(
                pc_release, "build_browser_extension", return_value=package
            ) as build_extension, mock.patch.object(
                pc_release, "resolve_dist_dir", return_value=root / "dist"
            ), mock.patch.object(pc_release, "build_release") as build_desktop, mock.patch.object(
                pc_release, "upload_browser_extension_to_oss"
            ) as upload_extension:
                result = pc_release.build_chrome_store_release(
                    "com.lockpass.next",
                    "web",
                    "chrome-store",
                    False,
                    {"RELEASE_TAG": "v1.2.3"},
                )

            self.assertEqual(result, 0)
            self.assertEqual(json.loads(package_json.read_text(encoding="utf-8"))["version"], "1.2.3")
            build_extension.assert_called_once_with("1.2.3", {"RELEASE_TAG": "v1.2.3"})
            build_desktop.assert_not_called()
            upload_extension.assert_not_called()

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
