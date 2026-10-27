Prisma source overlay for Phaedra (Windows x64)

Base: Surge XT commit f7b97c682ade0b87da85ca5968b63d5c7c98e68d
Upstream: https://github.com/surge-synthesizer/surge
License: GPL-3.0-or-later (see upstream LICENSE).

Reproducible packaging:
1. On a Windows machine with Visual Studio 2022 and CMake, run:
   pwsh ./tools/build_prisma_windows.ps1
2. The script fetches the pinned Surge XT commit and its submodules.
3. It applies prisma-surge.patch, generates the Phaedra skin and builds Prisma VST3.
4. It stages the binary, SurgeXTData (including the skin), a source
   provenance notice and upstream license at vendor/prisma.
5. Run: bash tools/check_prisma_payload.sh vendor/prisma
6. Run the Phaedra MSYS2/UCRT64 build followed by bash make_portable.sh.
   The portable bundle installs Prisma in lib/phaedra8/vst3.

The release/preview Actions workflows prepare the Prisma payload automatically
before compiling Phaedra. Do not commit binary files from vendor/prisma.
The build does not enable proprietary ASIO support.
If the Prisma source build fails, release packaging must fail rather than
publishing a silently reduced application.
