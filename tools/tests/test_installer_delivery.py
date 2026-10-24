"""Static delivery-contract tests; Windows CI additionally executes Inno Setup."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class InstallerDeliveryTests(unittest.TestCase):
    def test_installer_is_non_admin_and_keeps_separate_channels(self):
        script = (ROOT / "installer/Phaedra.iss").read_text(encoding="utf-8")
        self.assertIn("PrivilegesRequired=lowest", script)
        self.assertIn("DefaultDirName={localappdata}", script)
        self.assertIn("#if PackageChannel == \"preview\"", script)
        self.assertIn("Phaedra.Galante.Preview.Win64", script)
        self.assertIn("Phaedra.Galante.Win64", script)
        self.assertIn("UninstallLogMode=append", script)
        self.assertIn('Phaedra-Portable\\\\*', script)
        self.assertIn('LicenseFile=..\\\\COPYING', script)

    def test_updater_uses_setup_for_inno_managed_installs(self):
        updater = (ROOT / "phaedra_updater/updater.ps1").read_text(encoding="utf-8")
        detection = updater.index("unins000.exe")
        setup = updater.index("'-Setup-win-x64.exe'", detection)
        portable_zip = updater.index("'-win-x64.zip'", setup)
        install = updater.index("Start-Process -FilePath $download", portable_zip)
        stage = updater.index("$stage = Join-Path $parent", install)
        self.assertLess(detection, setup)
        self.assertLess(setup, portable_zip)
        self.assertLess(install, stage)
        self.assertIn("Get-FileHash -LiteralPath $download -Algorithm SHA256", updater)
        self.assertIn("ZIP symbolic links are not allowed", updater)

    def test_release_writes_installer_and_checksum_after_smoke_test(self):
        workflow = (ROOT / ".github/workflows/build-release.yml").read_text(encoding="utf-8")
        installer = workflow.index("Build and smoke-test per-user Windows installer")
        artifact = workflow.index("name: windows-build", installer)
        stable_publish = workflow.index("name: Release only after successful Windows smoke test", artifact)
        self.assertLess(installer, artifact)
        self.assertLess(artifact, stable_publish)
        self.assertIn("Phaedra-v*-Setup-win-x64.exe.sha256", workflow)
        self.assertIn("unins000.exe", workflow)


if __name__ == "__main__":
    unittest.main()
