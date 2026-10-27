#!/usr/bin/env bash
# Confirm a complete Prisma payload before starting Phaedra's long Windows build.
set -euo pipefail

ROOT="${1:?Usage: bash tools/check_prisma_payload.sh /path/to/vendor/prisma}"
required=(
  "Prisma.vst3/Contents/x86_64-win/Prisma.vst3"
  "SurgeXTData/skins/prisma.surge-skin/skin.xml"
  "LICENSE-Surge-XT.txt"
)
for file in "${required[@]}"; do
  if [[ ! -s "$ROOT/$file" ]]; then
    printf 'ERROR: Missing or empty Prisma payload: %s\n' "$ROOT/$file" >&2
    printf 'Build Prisma first with: pwsh ./tools/build_prisma_windows.ps1\n' >&2
    exit 1
  fi
done
printf 'Prisma VST3, skin and license verified in %s\n' "$ROOT"
