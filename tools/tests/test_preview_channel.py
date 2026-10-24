"""Tests for the isolation of prerelease packaging."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from package_windows import configure_channel


class PreviewChannelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.ini = self.root / "update_config.ini"
        self.ini.write_text("github_repo=mindrapeofficial-wq/phaedra\ncheck_updates=true\n", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_stable_bundle_is_unchanged(self):
        configure_channel(self.root, "stable")
        self.assertFalse((self.root / "preview-channel.flag").exists())
        self.assertIn("check_updates=true", self.ini.read_text(encoding="utf-8"))

    def test_preview_has_marker_and_stable_updater_disabled(self):
        configure_channel(self.root, "preview")
        self.assertEqual((self.root / "preview-channel.flag").read_text(encoding="ascii"), "preview\n")
        self.assertIn("check_updates=false", self.ini.read_text(encoding="utf-8"))
        self.assertNotIn("check_updates=true", self.ini.read_text(encoding="utf-8"))

    def test_unknown_channel_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Unknown PHAEDRA_CHANNEL"):
            configure_channel(self.root, "main")

    def test_damaged_update_settings_are_rejected(self):
        self.ini.write_text("check_updates=false\n", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "Expected one"):
            configure_channel(self.root, "preview")


if __name__ == "__main__":
    unittest.main()
