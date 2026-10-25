"""Keep the Phaedra Help menu wired to owned docs and a real chat client.

These are source-level regression checks; a manual Windows GUI and browser
smoke test remains necessary after the DAW build succeeds.
"""
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "gtk2_ardour"


class PhaedraHelpMenuTests(unittest.TestCase):
    def setUp(self):
        self.web = (UI / "ardour_ui_access_web.cc").read_text(encoding="utf-8")
        self.menu = (UI / "ardour.menus.in").read_text(encoding="utf-8")
        self.actions = (UI / "ardour_ui_ed.cc").read_text(encoding="utf-8")
        self.about = (UI / "about.cc").read_text(encoding="utf-8")

    def test_chat_uses_autojoin_url_and_no_ardour_chat(self):
        self.assertIn(
            'https://web.libera.chat/?nick=PhaedraGuest?#phaedra-daw',
            self.web
        )
        self.assertIn('open_phaedra_support_url (phaedra_chat_url);', self.web)
        self.assertNotIn('https://ardour.org/chat', self.web)

    def test_web_destinations_are_phaedra_specific(self):
        for path in (
            'docs/phaedra/primeros-pasos.md',
            'docs/phaedra/manual.md',
            'docs/phaedra/reportar-error.md',
        ):
            self.assertTrue((ROOT / path).is_file(), path)
            self.assertIn(path, self.web)
        self.assertNotIn('community.ardour.org', self.web)
        self.assertNotIn('tracker.ardour.org', self.web)
        self.assertIn('https://phaedra-daw.vercel.app/', self.web)

    def test_actions_and_menu_are_wired(self):
        for action in (
            'chat', 'tutorial', 'reference', 'forums', 'howto-report',
            'tracker', 'website', 'website-dev'
        ):
            self.assertIn(f'X_("{action}")', self.actions)
            self.assertIn(f"action='{action}'", self.menu)

    def test_help_uses_new_name_and_has_separators(self):
        self.assertIn('_("Live Community Chat")', self.actions)
        self.assertIn('_("Community Support")', self.actions)
        self.assertGreaterEqual(
            self.menu[self.menu.index('<menu name=\'Help\''):].count('<separator/>'), 3
        )

    def test_about_is_branded_and_preserves_upstream_credit(self):
        self.assertIn('set_name (X_("Phaedra"))', self.about)
        self.assertIn('https://phaedra-daw.vercel.app/', self.about)
        self.assertIn('Paul Davis and contributors', self.about)
        self.assertIn('set_license (gpl)', self.about)


if __name__ == "__main__":
    unittest.main()
