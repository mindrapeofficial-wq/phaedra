"""Exercise optional social artifact import without requiring an audio build."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from package_windows import SOCIAL_REQUIRED_FILES, copy_social_bundle


class PackageSocialAssetTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.bundle = self.root / "social"
        self.destination = self.root / "portable"
        self.bundle.mkdir()
        self.files = {}
        for name in SOCIAL_REQUIRED_FILES | {"licenses/webview2/LICENSE.txt"}:
            content = b"fixture artifact\n"
            if name.endswith("config.json"):
                content = json.dumps({"schemaVersion": 1, "apiUrl": ""}).encode()
            self.put(name, content)
        self.manifest = {
            "schemaVersion": 1,
            "platform": "win-x64",
            "host": "bin/PhaedraSocial.exe",
            "loader": "bin/WebView2Loader.dll",
            "assets": "share/phaedra-social",
            "virtualOrigin": "https://phaedra-social.invalid",
            "webview2Sdk": "1.0.4314.35",
            "files": self.files,
        }
        self.save_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def put(self, name, content):
        path = self.bundle / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        self.files[name] = hashlib.sha256(content).hexdigest()

    def save_manifest(self):
        (self.bundle / "social-bundle.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def test_omitted_component_does_not_create_or_change_package(self):
        self.assertFalse(copy_social_bundle(None, self.destination))
        self.assertFalse(self.destination.exists())

    def test_verified_component_preserves_every_byte_and_license(self):
        self.assertTrue(copy_social_bundle(self.bundle, self.destination))
        for name in self.files:
            with self.subTest(name=name):
                self.assertEqual((self.destination / name).read_bytes(), (self.bundle / name).read_bytes())
        self.assertTrue((self.destination / "social-bundle.json").is_file())

    def test_incomplete_client_is_rejected_before_destination_changes(self):
        name = "share/phaedra-social/src/stoat-client.js"
        (self.bundle / name).unlink()
        del self.files[name]
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "missing required"):
            copy_social_bundle(self.bundle, self.destination)
        self.assertFalse(self.destination.exists())

    def test_modified_binary_does_not_pass_its_old_hash(self):
        (self.bundle / "bin/PhaedraSocial.exe").write_bytes(b"modified binary")
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            copy_social_bundle(self.bundle, self.destination)
        self.assertFalse(self.destination.exists())

    def test_path_traversal_cannot_escape_bundle_or_destination(self):
        self.files["share/phaedra-social/../../../escaped.txt"] = "0" * 64
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "Unsafe"):
            copy_social_bundle(self.bundle, self.destination)
        self.assertFalse(self.destination.exists())

    def test_windows_case_collision_is_rejected_on_all_platforms(self):
        self.files["share/phaedra-social/CONFIG.json"] = "0" * 64
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "duplicate"):
            copy_social_bundle(self.bundle, self.destination)

    def test_unlisted_payload_is_rejected(self):
        (self.bundle / "bin/unlisted.exe").write_bytes(b"unexpected")
        with self.assertRaisesRegex(RuntimeError, "do not match"):
            copy_social_bundle(self.bundle, self.destination)

    def test_invalid_config_with_a_valid_hash_is_rejected(self):
        self.put("share/phaedra-social/config.json", b'{"schemaVersion":1, invalid}')
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "Invalid social bundle JSON"):
            copy_social_bundle(self.bundle, self.destination)

    def test_non_schema_version_one_is_rejected(self):
        self.put("share/phaedra-social/config.json", b'{"schemaVersion":true}')
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "requires schemaVersion 1"):
            copy_social_bundle(self.bundle, self.destination)

    def test_symlink_to_an_external_file_is_rejected(self):
        external = self.root / "outside.txt"
        external.write_text("external", encoding="utf-8")
        link = self.bundle / "share/phaedra-social/external.txt"
        try:
            link.symlink_to(external)
        except (OSError, NotImplementedError):
            self.skipTest("Creating symlinks is unavailable on this test host")
        self.files["share/phaedra-social/external.txt"] = hashlib.sha256(external.read_bytes()).hexdigest()
        self.save_manifest()
        with self.assertRaisesRegex(RuntimeError, "symbolic links"):
            copy_social_bundle(self.bundle, self.destination)


if __name__ == "__main__":
    unittest.main()
