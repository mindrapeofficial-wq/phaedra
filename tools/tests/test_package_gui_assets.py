"""Prevent the Windows packager from requesting non-generated font paths."""
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class PackageGuiAssetTests(unittest.TestCase):
    def test_fonts_are_committed_source_assets(self):
        for name in ("ArdourMono.ttf", "ArdourSans.ttf"):
            with self.subTest(name=name):
                self.assertTrue((ROOT / "gtk2_ardour" / name).is_file())

    def test_packager_reads_fonts_from_source(self):
        package = (ROOT / "tools/package_windows.py").read_text(encoding="utf-8")
        self.assertIn(
            'for name in ("ArdourMono.ttf", "ArdourSans.ttf"):',
            package,
        )
        self.assertIn('cp(ROOT / "gtk2_ardour" / name, DEST / "share/ardour8" / name)', package)
        self.assertNotIn('"default_ui_config", "ardour.menus", "ArdourMono.ttf"', package)

    def test_waf_generates_menus_and_default_ui_config(self):
        wscript = (ROOT / "gtk2_ardour/wscript").read_text(encoding="utf-8")
        self.assertIn("obj.target       = 'default_ui_config'", wscript)
        self.assertIn("obj.stdout = 'ardour.menus'", wscript)


if __name__ == "__main__":
    unittest.main()
