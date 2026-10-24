"""Unit tests for portable release integrity."""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verify_portable import REQUIRED, verify


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        names = (set(REQUIRED) - {"MANIFEST.sha256"}) | {"lib/ardour8/backends/portaudio.dll"}
        for name in names:
            dest = self.root / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"test")
        (self.root / "version.txt").write_text("1.0.1\n")
        self.manifest()

    def tearDown(self):
        self.tmp.cleanup()

    def manifest(self):
        entries = []
        for path in sorted(self.root.rglob("*")):
            if path.is_file() and path.name != "MANIFEST.sha256":
                entries.append(hashlib.sha256(path.read_bytes()).hexdigest() +
                               "  " + path.relative_to(self.root).as_posix())
        (self.root / "MANIFEST.sha256").write_text("\n".join(entries) + "\n")

    def test_valid(self):
        self.assertTrue(verify(self.root))

    def test_modified_file(self):
        (self.root / "bin/Phaedra.exe").write_bytes(b"tampered")
        with self.assertRaisesRegex(RuntimeError, "checksum"):
            verify(self.root)

    def test_extra_file(self):
        (self.root / "extra.dat").write_bytes(b"unexpected")
        with self.assertRaisesRegex(RuntimeError, "Manifest"):
            verify(self.root)

    def test_invalid_version(self):
        (self.root / "version.txt").write_text("not-a-version\n")
        self.manifest()
        with self.assertRaisesRegex(RuntimeError, "Invalid version"):
            verify(self.root)
