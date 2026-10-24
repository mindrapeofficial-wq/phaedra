"""Regression checks for Phaedra's new-session Bars:Beats ruler defaults.

These source checks catch accidental reintroduction of min/sec/timecode
rulers when modifying the GTK action initialization. A GUI smoke test is
still needed on Windows to confirm the rendered ruler.
"""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
RULERS = {
    "minsec": False,
    "timecode": False,
    "samples": False,
    "bbt": True,
    "meter": False,
    "tempo": False,
    "range": False,
    "marker": False,
    "section": False,
    "video": False,
}


def assert_ruler_states(testcase, block):
    for name, enabled in RULERS.items():
        state = "true" if enabled else "false"
        testcase.assertIn(
            f"ruler_{name}_action->set_active ({state});",
            block,
            f"Unexpected default for ruler {name}",
        )


class RulerStartupTests(unittest.TestCase):
    def test_editor_actions_start_with_only_bars_beats(self):
        source = (ROOT / "gtk2_ardour/editor_actions.cc").read_text(encoding="utf-8")
        start = source.index("/* Phaedra starts with a single musical Bars:Beats ruler.")
        end = source.index("xjadeo_proc_action->set_active (false);", start)
        assert_ruler_states(self, source[start:end])

    def test_new_session_without_saved_visibility_uses_bars_beats(self):
        source = (ROOT / "gtk2_ardour/editor_rulers.cc").read_text(encoding="utf-8")
        match = re.search(
            r"} else \{\s*/\* A new session has no saved RulerVisibility:"
            r"(.*?)\n\s*}\s*\n\s*no_ruler_shown_update = false;",
            source,
            re.DOTALL,
        )
        self.assertIsNotNone(match, "New-session fallback was removed")
        assert_ruler_states(self, match.group(1))

    def test_existing_session_visibility_is_restored(self):
        source = (ROOT / "gtk2_ardour/editor_rulers.cc").read_text(encoding="utf-8")
        start = source.index("Editor::restore_ruler_visibility ()")
        saved = source[start:source.index("/* A new session has no saved RulerVisibility:", start)]
        self.assertIn('if (node)', saved)
        for name in ("timecode", "bbt", "samples", "minsec",
                     "tempo", "meter", "marker", "rangemarker", "arrangement"):
            self.assertIn(f'node->get_property ("{name}", yn)', saved)

    def test_grid_starts_on_quarter_note_beats(self):
        source = (ROOT / "gtk2_ardour/editing_context.cc").read_text(encoding="utf-8")
        start = source.index("EditingContext::set_common_editing_state (")
        self.assertIn("set_grid_type (GridTypeBeat);", source[start:start + 850])


if __name__ == "__main__":
    unittest.main()
