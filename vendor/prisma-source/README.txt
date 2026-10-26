Prisma source overlay for Phaedra 1.0.10

Base: Surge XT commit f7b97c682ade0b87da85ca5968b63d5c7c98e68d
Upstream: https://github.com/surge-synthesizer/surge
License: GPL-3.0-or-later. See the upstream LICENSE file.

To reproduce the instrument source:
1. Check out the base commit, including its submodules.
2. Apply prisma-surge.patch with git apply.
3. Copy build-prisma-skin.py to scripts/build-prisma-skin.py.
4. Copy Prisma-logo.png and PrismaIcon.png to resources/prisma/.
5. Run python scripts/build-prisma-skin.py.
6. Build surge-xt_VST3 and surge-xt_Standalone with CMake.

The Phaedra packager takes the resulting VST3 and SurgeXTData from
PRISMA_PACKAGE_ROOT and installs them inside lib/ardour8/vst3.
