#!/usr/bin/env python3
"""Build a validated Windows portable layout from an MSYS2/UCRT64 Waf build.

The original Ardour engine ABI path remains ardour8 intentionally.
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "Phaedra-Portable"
PREFIX = (Path(sys.executable).resolve().parent.parent if os.name == "nt"
          else Path(os.environ.get("MINGW_PREFIX", "/ucrt64")))
ENGINE = os.environ.get("PHAEDRA_ENGINE_VERSION", "8.12.0")
VERSION = os.environ.get("PHAEDRA_PACKAGE_VERSION", "0.0.0")
CHANNEL = os.environ.get("PHAEDRA_CHANNEL", "stable")


def need(path):
    path = Path(path)
    if not path.exists():
        raise RuntimeError("Missing required build artifact: " + str(path))
    return path


def cp(source, destination):
    source, destination = need(source), Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, destination, dirs_exist_ok=True)
    else:
        if destination.exists() and source.resolve() != destination.resolve():
            if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(destination.read_bytes()).digest():
                raise RuntimeError("Conflicting DLL or file name: " + str(destination))
        shutil.copy2(source, destination)


def copy_optional(src, dest):
    if Path(src).exists():
        cp(src, dest)


def copy_built_dlls():
    library_root = need(ROOT / "build" / "libs")
    dlls = sorted(library_root.rglob("*.dll"))
    if not dlls:
        raise RuntimeError("No DLLs found under build/libs")
    backend_count = 0
    for dll in dlls:
        rel = dll.relative_to(library_root).as_posix()
        if rel.startswith("surfaces/"):
            target = DEST / "lib/ardour8/surfaces" / dll.name
        elif rel.startswith("backends/"):
            target = DEST / "lib/ardour8/backends" / dll.name
            backend_count += 1
        elif rel.startswith("panners/"):
            target = DEST / "lib/ardour8/panners" / dll.name
        elif rel.startswith("vamp-plugins/") or rel.startswith("vamp-pyin/"):
            target = DEST / "lib/ardour8/vamp" / dll.name
        elif rel.startswith("tk/suil/") and "suil_" in dll.name:
            target = DEST / "lib/ardour8/suil" / dll.name
        elif rel.startswith("clearlooks-newer/"):
            target = DEST / "lib/gtk-2.0/2.10.0/engines" / dll.name
        else:
            target = DEST / "bin" / dll.name
        cp(dll, target)
    if backend_count == 0:
        raise RuntimeError("No audio backend DLLs found; portable package would not play audio")
    print("Packaged", len(dlls), "built DLLs (", backend_count, "backends)")


def copy_runtime_dependencies():
    """Collect the transitive UCRT64 runtime closure for every packaged PE file."""
    bin_dir = DEST / "bin"
    for iteration in range(16):
        before = len(list(bin_dir.glob("*.dll")))
        for binary in sorted(DEST.rglob("*")):
            if binary.suffix.lower() not in (".dll", ".exe") or not binary.is_file():
                continue
            proc = subprocess.run(
                ["ldd", str(binary)], capture_output=True, text=True, errors="replace", check=False
            )
            output = proc.stdout + proc.stderr
            # ldd may print POSIX paths or native C:\... paths on MSYS2.
            for dll_name in re.findall(
                r"[/\\]ucrt64[/\\]bin[/\\]([^/\\\s()]+?\.dll)",
                output, flags=re.IGNORECASE
            ):
                candidate = PREFIX / "bin" / dll_name
                if candidate.is_file():
                    cp(candidate, bin_dir / candidate.name)
        after = len(list(bin_dir.glob("*.dll")))
        if after == before:
            print("Runtime DLL closure complete after", iteration + 1, "passes")
            return
    raise RuntimeError("Runtime DLL dependency resolution did not converge")


def configure_channel(dest, channel):
    """Keep experimental builds separate from the stable auto-updater."""
    if channel not in ("stable", "preview"):
        raise RuntimeError("Unknown PHAEDRA_CHANNEL: " + channel)
    if channel == "stable":
        return
    settings = Path(dest) / "update_config.ini"
    contents = settings.read_text(encoding="utf-8")
    if contents.splitlines().count("check_updates=true") != 1:
        raise RuntimeError("Expected one enabled stable update setting")
    settings.write_text(
        contents.replace("check_updates=true", "check_updates=false"),
        encoding="utf-8",
    )
    (Path(dest) / "preview-channel.flag").write_text("preview\n", encoding="ascii")


def write_manifest():
    manifest = DEST / "MANIFEST.sha256"
    lines = []
    for path in sorted(DEST.rglob("*")):
        if path.is_file() and path != manifest:
            relative = path.relative_to(DEST).as_posix()
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            lines.append(digest + "  " + relative)
    manifest.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    if not re.fullmatch(r"\d+\.\d+\.\d+", ENGINE):
        raise RuntimeError("PHAEDRA_ENGINE_VERSION must be MAJOR.MINOR.PATCH")
    if not re.fullmatch(r"\d+\.\d+\.\d+", VERSION):
        raise RuntimeError("PHAEDRA_PACKAGE_VERSION must be MAJOR.MINOR.PATCH")
    if ENGINE.split(".")[0] != "8":
        raise RuntimeError("This package layout targets libardour ABI 8 only")
    if DEST.exists():
        shutil.rmtree(DEST)
    (DEST / "bin").mkdir(parents=True)
    exe = need(ROOT / "build/gtk2_ardour" / ("ardour-" + ENGINE + ".exe"))
    cp(exe, DEST / "bin/Phaedra.exe")
    copy_built_dlls()

    fst = ROOT / "build/libs/fst"
    for pattern in ("*vst*scanner*.exe", "*vst*scan*.exe"):
        for scanner in sorted(fst.glob(pattern)):
            cp(scanner, DEST / "bin" / scanner.name)

    copy_optional(ROOT / "build/libs/LV2", DEST / "lib/ardour8/LV2")
    # Waf generates GTK config and menus under build/gtk2_ardour.
    for name in ("clearlooks.rc", "clearlooks.ardoursans.rc",
                 "default_ui_config", "ardour.menus"):
        cp(ROOT / "build/gtk2_ardour" / name, DEST / "share/ardour8" / name)
    # Fonts are source assets (wscript installs them directly from the tree);
    # there is no corresponding build/gtk2_ardour/*.ttf output.
    for name in ("ArdourMono.ttf", "ArdourSans.ttf"):
        cp(ROOT / "gtk2_ardour" / name, DEST / "share/ardour8" / name)
    for keys in sorted((ROOT / "build/gtk2_ardour").glob("*.keys")):
        cp(keys, DEST / "share/ardour8" / keys.name)
    cp(ROOT / "system_config", DEST / "share/ardour8/system_config")
    for item in ("themes", "resources", "icons"):
        cp(ROOT / "gtk2_ardour" / item, DEST / "share/ardour8" / item)
    for item in ("patchfiles", "plugin_metadata", "export", "scripts", "templates",
                 "mcp", "midi_maps"):
        copy_optional(ROOT / "share" / item, DEST / "share/ardour8" / item)
    cp(ROOT / "share/chords.txt", DEST / "share/ardour8/chords.txt")
    copy_optional(ROOT / "build/share/ardour8/locale", DEST / "share/locale")

    cp(need(PREFIX / "etc/fonts/fonts.conf"), DEST / "etc/fonts/fonts.conf")
    copy_optional(PREFIX / "etc/fonts/conf.d", DEST / "etc/fonts/conf.d")
    # Keep the license texts shipped by UCRT64 dependencies, not just app license.
    copy_optional(PREFIX / "share/licenses", DEST / "licenses/third-party")
    cp(ROOT / "COPYING", DEST / "COPYING")
    cp(ROOT / "LICENSES.md", DEST / "LICENSES.md")
    cp(ROOT / "README.md", DEST / "README.md")
    cp(ROOT / "phaedra_updater/updater.ps1", DEST / "updater/updater.ps1")
    cp(ROOT / "phaedra_updater/update_config.ini", DEST / "update_config.ini")
    (DEST / "version.txt").write_text(VERSION + "\n", encoding="ascii")

    commit = os.environ.get("GITHUB_SHA")
    if not commit:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    (DEST / "SOURCE.txt").write_text(
        "Phaedra Windows build\n"
        "Source repository: https://github.com/mindrapeofficial-wq/phaedra\n"
        "Exact commit: " + commit + "\n"
        "Source code: https://github.com/mindrapeofficial-wq/phaedra/tree/" + commit + "\n"
        "Build instructions: README.md (Windows build section)\n"
        "Engine compatibility version: " + ENGINE + "\n"
        "Package version: " + VERSION + "\n"
        "License information: COPYING and LICENSES.md\n",
        encoding="utf-8",
    )
    try:
        pacman = subprocess.check_output(["pacman", "-Q"], text=True, errors="replace")
        (DEST / "BUILD-DEPENDENCIES.txt").write_text(pacman, encoding="utf-8")
    except (FileNotFoundError, subprocess.CalledProcessError):
        raise RuntimeError("pacman dependency manifest unavailable")

    # Compile a launcher separate from the DAW executable.
    res = ROOT / "build/phaedra_launcher.res"
    res.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["windres", "-I", str(ROOT / "gtk2_ardour/icons"),
         "-i", str(ROOT / "tools/phaedra_launcher.rc"),
         "-O", "coff", "-o", str(res)], check=True
    )
    subprocess.run(
        ["gcc", "-municode", "-mwindows", str(ROOT / "tools/phaedra_launcher.c"),
         str(res), "-o", str(DEST / "Phaedra.exe")], check=True
    )
    (DEST / "Phaedra.bat").write_text(
        '@echo off\r\n'
        'start "" "%~dp0Phaedra.exe"\r\n',
        encoding="ascii", newline="",
    )
    copy_runtime_dependencies()
    configure_channel(DEST, CHANNEL)
    write_manifest()
    print("Created:", DEST)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print("PACKAGING ERROR:", exc, file=sys.stderr)
        sys.exit(1)
