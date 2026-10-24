#!/usr/bin/env bash
# Windows/MSYS2 packaging entry point.
set -euo pipefail
cd "$(dirname "$0")"
python tools/package_windows.py
