# Phaedra DAW

Phaedra is a Windows-oriented digital audio workstation derived from the
[Ardour](https://ardour.org/) source tree. The audio engine, much of the
interface, and plugins retain upstream source and licensing. Phaedra adds
its own interface, workflow changes and Windows packaging.

**Licensing:** See [COPYING](COPYING) and [LICENSES.md](LICENSES.md).
The program and its GPL-covered modifications are not proprietary software.
Phaedra is independent as a distributed product name, not as a codebase.

## Windows build

The project uses Waf, MSYS2 UCRT64, and the packages listed in
[.github/workflows/build-release.yml](.github/workflows/build-release.yml).
For a known, audited build, use the workflow on a full checkout of the exact
commit to be released. GitHub Actions records the installed package versions
as BUILD-DEPENDENCIES.txt in the resulting archive.

Inside an MSYS2 UCRT64 shell:

~~~sh
export PHAEDRA_ENGINE_VERSION=8.12.0
export PHAEDRA_PACKAGE_VERSION=0.0.0
python waf configure \
  --with-backends=portaudio,dummy \
  --no-phone-home --dist-target=mingw \
  --optimize --program-name=Phaedra
python waf build -j4
bash make_portable.sh
python tools/verify_portable.py Phaedra-Portable
~~~

The engine build version is intentionally different from the Phaedra
distribution's semantic version. Do not reuse the Phaedra tag (v1.x.x)
to infer Ardour ABI paths: the engine still expects ardour8 directories.

## Packaging and releases

The Windows workflow builds PRs and branch pushes before it may publish
a tag release. Use a new tag vMAJOR.MINOR.PATCH only after passing CI.
The existing v1.0.0 tag points at an early repository state and must
not be moved. Use v1.0.1 or higher for corrected releases.

Release ZIPs are named Phaedra-vX.Y.Z-win-x64.zip and include:
* Phaedra.exe launcher, bin/Phaedra.exe engine, runtime libraries,
  themes, audio backends and assets;
* README.md, COPYING, LICENSES.md, SOURCE.txt;
* BUILD-DEPENDENCIES.txt, MANIFEST.sha256 and version.txt;
* updater/updater.ps1, update_config.ini.

The workflow produces matching SHA256 sidecars and a source archive
from the same commit. Stable tagged releases also include the per-user
`Phaedra-vX.Y.Z-Setup-win-x64.exe` installer and its SHA256. The Inno
Setup 6 script is `installer/Phaedra.iss`; Windows CI actually installs,
self-tests and uninstalls the resulting EXE before releasing anything.
Never publish a release if the build, packaging or smoke tests fail.
Changes to dependencies require renewed testing.

## Standard Windows installation

Use the verified `Phaedra-vX.Y.Z-Setup-win-x64.exe` for an installed
version with Start-menu shortcuts and an uninstaller. This is a per-user
Inno Setup installation, without administrator privileges. The default
location is `%LOCALAPPDATA%\\Programs\\Phaedra`; audio projects and
preferences must remain outside that folder. Stable installations use
`%APPDATA%\\Phaedra8` for preferences.

The update worker distinguishes an Inno-managed installation by its
`unins000.exe`. With explicit user approval, it downloads the matching
GitHub-published Setup EXE, validates its SHA256, makes an adjacent file
backup and runs Inno Setup to preserve its uninstall metadata. A portable
installation instead downloads a verified ZIP and swaps folders with
rollback. The installer-path backup is for manual recovery, not an
automatic restore of installer registry entries.

No installer is released until the full Windows CI pipeline succeeds.
There is no Authenticode signature yet, and SHA256 alone is not proof
of publisher identity or malware-free binaries. Preview installations
use a separate application identity and folder, and preview channels
do not update the stable installation.

## Portable Windows usage

Extract the entire archive into a *writable* folder outside Program Files.
Launch Phaedra.exe. Configuration and normal projects are stored outside
the application bundle. Keep your own projects/backups outside the bundle:
the updater replaces the entire application folder after keeping a backup.
No change should delete user project directories.

The launcher can use --no-update to start without checking for updates
and --self-test to verify the portable layout without opening the GUI.
Updates require HTTPS, a release ZIP with a GitHub-published SHA256 digest,
and validated archive contents. The last installation is retained as an
adjacent backup folder. If no network is available, Phaedra still opens.

For emergency rollback, exit Phaedra, rename the current installation
folder and restore the adjacent .phaedra-backup-* folder. Do not start
multiple updaters or place user files inside the application directory.

## Source and contributors

Phaedra source: https://github.com/mindrapeofficial-wq/phaedra
Ardour upstream: https://github.com/Ardour/ardour
Licensing and component attribution: LICENSES.md and source headers.
