#!/usr/bin/env python3
"""Offline portable bundle verification: also run after creating the ZIP."""
import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

from package_windows import SOCIAL_REQUIRED_FILES, validate_social_bundle

REQUIRED = [
    "Phaedra.exe", "bin/Phaedra.exe", "version.txt",
    "README.md", "COPYING", "LICENSES.md", "SOURCE.txt",
    "BUILD-DEPENDENCIES.txt", "MANIFEST.sha256",
    "updater/updater.ps1", "update_config.ini",
    "share/ardour8/ardour.menus", "share/ardour8/default_ui_config",
    "share/ardour8/system_config", "etc/fonts/fonts.conf"
]


def verify(root, require_social=False):
    root = Path(root).resolve()
    for name in REQUIRED:
        if not (root / name).is_file():
            raise RuntimeError("Missing: " + name)
    social_manifest = root / "social-bundle.json"
    if social_manifest.is_file():
        validate_social_bundle(root, installed=True)
    elif require_social:
        raise RuntimeError("Phaedra Social is required but its package manifest is missing")
    elif any((root / name).exists() for name in SOCIAL_REQUIRED_FILES):
        raise RuntimeError("Phaedra Social files are present without their package manifest")
    ver = (root / "version.txt").read_text(encoding="utf-8-sig").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", ver):
        raise RuntimeError("Invalid version in version.txt: " + repr(ver))
    preview_marker = root / "preview-channel.flag"
    if preview_marker.is_file():
        if preview_marker.read_text(encoding="ascii").strip() != "preview":
            raise RuntimeError("Invalid preview channel marker")
        if ver != "0.0.0":
            raise RuntimeError("Preview packages must use version 0.0.0")
        config_lines = (root / "update_config.ini").read_text(encoding="utf-8").splitlines()
        if "check_updates=false" not in config_lines or "check_updates=true" in config_lines:
            raise RuntimeError("Preview must never join the stable update channel")
    files = {}
    for raw in (root / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([a-f0-9]{64})  (.+)", raw)
        if not match:
            raise RuntimeError("Bad manifest record: " + raw)
        digest, name = match.groups()
        if name in files or name.startswith("/") or "\\" in name or ".." in Path(name).parts:
            raise RuntimeError("Unsafe/duplicate manifest path: " + name)
        files[name] = digest
    actual = {path.relative_to(root).as_posix()
              for path in root.rglob("*") if path.is_file() and path.name != "MANIFEST.sha256"}
    if set(files) != actual:
        raise RuntimeError("Manifest mismatch, missing: " + str(set(files) - actual)
                           + "; extra: " + str(actual - set(files)))
    for name, expected in files.items():
        h = hashlib.sha256()
        with (root / name).open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(block)
        if h.hexdigest() != expected:
            raise RuntimeError("Invalid checksum: " + name)
    if not list((root / "lib/ardour8/backends").glob("*.dll")):
        raise RuntimeError("No bundled audio backends")
    print("Verified Phaedra", ver, "with", len(files), "payload files")
    return True


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("root", type=Path, help="Extracted Phaedra portable package")
        parser.add_argument("--require-social", action="store_true",
                            help="Fail unless the complete verified Phaedra Social component is included")
        args = parser.parse_args()
        verify(args.root, require_social=args.require_social)
    except (RuntimeError, OSError) as exc:
        print("VERIFY ERROR:", exc, file=sys.stderr)
        sys.exit(1)
