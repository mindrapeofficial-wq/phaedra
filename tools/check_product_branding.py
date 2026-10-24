#!/usr/bin/env python3
"""Prevent inherited Ardour *product branding* in Phaedra's visible surfaces.

Copyright, upstream license text, internal ARDOUR:: names, plugin URIs and
on-disk compatibility identifiers are intentionally excluded from this audit.
Do not globally search-and-replace those identifiers.
"""
from pathlib import Path
import re
import sys
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def require(path, expected):
    if expected not in read(path):
        ERRORS.append(f"{path}: missing expected Phaedra branding: {expected!r}")


def forbid(path, patterns):
    contents = read(path)
    for pattern in patterns:
        if re.search(pattern, contents, flags=re.IGNORECASE):
            ERRORS.append(f"{path}: leftover legacy product string matching {pattern!r}")


# GUI, menu help URLs and product metadata.
require("gtk2_ardour/about.cc", 'set_name (X_("Phaedra"));')
require("gtk2_ardour/ardour.desktop.in", "Name=Phaedra")
require("gtk2_ardour/ardour.appdata.xml.in.in", "<name>Phaedra</name>")
require("gtk2_ardour/ardour-mime-info.xml", "<comment>Phaedra session file</comment>")
require("wscript", "default='Phaedra', dest='program_name'")
require("README", "PHAEDRA DAW")
require("phaedra.1", ".TH PHAEDRA")
require("gtk2_ardour/ardour_ui_ed.cc", 'X_("chat"), _("Phaedra Support")')
require("gtk2_ardour/nag.cc", "NagScreen::maybe_nag (std::string /*why*/)")
require("share/web_surfaces/index.html", "<title>Phaedra Web Surfaces</title>")

for path in (
    "gtk2_ardour/ardour_ui_access_web.cc",
    "gtk2_ardour/opts.cc",
    "gtk2_ardour/ardour_ui_engine.cc",
    "gtk2_ardour/startup_fsm.cc",
    "gtk2_ardour/video_server_dialog.cc",
    "gtk2_ardour/transcode_ffmpeg.cc",
    "gtk2_ardour/video_timeline.cc",
):
    forbid(path, (r"https?://(?:manual\.|community\.|tracker\.)?ardour\.org",))

for path in (
    "share/web_surfaces/index.html",
    "share/web_surfaces/builtin/mixer/index.html",
    "share/web_surfaces/builtin/transport/index.html",
    "share/web_surfaces/builtin/protocol/index.html",
    "share/web_surfaces/builtin/protocol/manifest.xml",
):
    forbid(path, (r"\bArdour\b", r"ardour-icon\.svg", r"index/logo\.png"))

for path in ("gtk2_ardour/ardour.desktop.in", "gtk2_ardour/ardour.appdata.xml.in.in"):
    forbid(path, (r"\bName=Ardour\b", r"<name>Ardour</name>", r"<keyword>Ardour</keyword>",
                  r"https?://(?:tracker\.|community\.)?ardour\.org",))

for path in ("gtk2_ardour/ardour.appdata.xml.in.in", "gtk2_ardour/ardour-mime-info.xml"):
    try:
        ET.parse(ROOT / path)
    except ET.ParseError as exc:
        ERRORS.append(f"{path}: XML is invalid: {exc}")


# Only check msgstr entries that can appear to users. Historical msgid keys,
# copyright comments, translator metadata and obsolete entries remain intact.
def check_po(path, check_source=False):
    mode = ""
    first_id = False
    header = False
    for number, line in enumerate(read(path).splitlines(), 1):
        if line.startswith("msgid "):
            mode = "id"
            header = not first_id and line == 'msgid ""'
            first_id = True
        elif re.match(r"^msgstr(?:\[\d+\])? ", line):
            mode = "str"
        elif line.startswith("msgctxt "):
            mode = "context"
        elif not line.strip():
            mode = ""
            header = False
        if header:
            continue
        if mode == "str" or (check_source and mode == "id"):
            if re.match(r'^(?:msgid|msgstr(?:\[\d+\])?|")', line):
                if re.search(r"Ardour|ardour\.org", line):
                    ERRORS.append(f"{path}:{number}: legacy brand in active translation")


for path in sorted((ROOT / "gtk2_ardour/po").glob("*.po")):
    check_po(str(path.relative_to(ROOT)))
for path in sorted((ROOT / "gtk2_ardour/appdata/po").glob("*.po")):
    check_po(str(path.relative_to(ROOT)), check_source=True)

if ERRORS:
    for error in ERRORS:
        print("BRANDING ERROR:", error, file=sys.stderr)
    sys.exit(1)

print("Phaedra product-branding audit passed.")
