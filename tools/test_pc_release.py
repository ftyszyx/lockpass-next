import importlib.util
import io
import sys
import unittest
from contextlib import redirect_stderr
from pathlib import Path


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

    def test_resolve_channel_rejects_invalid_names(self):
        with self.assertRaises(SystemExit):
            pc_release.normalize_channel("../prod")


if __name__ == "__main__":
    unittest.main()
