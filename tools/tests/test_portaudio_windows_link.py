"""Guard MSYS2 PortAudio linking against obsolete JACK static dependencies."""
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class PortAudioWindowsLinkTests(unittest.TestCase):
    def test_portaudio_uses_configured_import_library(self):
        source = (ROOT / "libs/backends/portaudio/wscript").read_text(encoding="utf-8")
        self.assertIn("obj.uselib   = 'PORTAUDIO GLIBMM XML'", source)
        self.assertNotIn("obj.stlib = ['portaudio']", source)
        self.assertNotIn("'jack64'", source)

    def test_winmm_link_is_retained_for_midi(self):
        source = (ROOT / "libs/backends/portaudio/wscript").read_text(encoding="utf-8")
        self.assertIn("obj.lib = ['ole32', 'setupapi', 'uuid', 'winmm', 'ksuser']", source)


if __name__ == "__main__":
    unittest.main()
