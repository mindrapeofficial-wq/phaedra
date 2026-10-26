#!/bin/bash
# Phaedra Portable Packager for MSYS2/UCRT64
set -e

cd "$(dirname "$0")"
SRCDIR="$(pwd)"
DESTDIR="$SRCDIR/Phaedra-Portable"
MINGW_PREFIX="/ucrt64"

echo "=== Creating Phaedra Portable ==="

rm -rf "$DESTDIR"
mkdir -p "$DESTDIR/bin"
mkdir -p "$DESTDIR/lib/phaedra8/surfaces"
mkdir -p "$DESTDIR/lib/phaedra8/backends"
mkdir -p "$DESTDIR/lib/phaedra8/panners"
mkdir -p "$DESTDIR/lib/phaedra8/vamp"
mkdir -p "$DESTDIR/lib/phaedra8/suil"
mkdir -p "$DESTDIR/lib/gtk-2.0/engines"
mkdir -p "$DESTDIR/share/phaedra8"
mkdir -p "$DESTDIR/etc/fonts"

echo "--- Copying main executable..."
APP_EXE=$(ls -t build/gtk2_ardour/ardour-*.exe 2>/dev/null | head -n 1)
test -n "$APP_EXE" || { echo "Phaedra executable not found" >&2; exit 1; }
cp "$APP_EXE" "$DESTDIR/bin/Phaedra.exe"

echo "--- Copying Ardour DLLs..."
for dll in \
    build/libs/gtkmm2ext/gtkmm2ext.dll \
    build/libs/midi++2/midipp.dll \
    build/libs/evoral/evoral.dll \
    build/libs/ardour/ardour.dll \
    build/libs/temporal/temporal.dll \
    build/libs/aaf/aaf.dll \
    build/libs/canvas/canvas.dll \
    build/libs/widgets/widgets.dll \
    build/libs/waveview/waveview.dll \
    build/libs/pbd/pbd.dll \
    build/libs/tk/ztk/ztk.dll \
    build/libs/tk/ydk/ydk.dll \
    build/libs/tk/ytk/ytk.dll \
    build/libs/tk/ytkmm/ytkmm.dll \
    build/libs/tk/ydkmm/ydkmm.dll \
    build/libs/tk/ztkmm/ztkmm.dll \
    build/libs/tk/ydk-pixbuf/ydk-pixbuf.dll \
    build/libs/tk/suil/suil.dll \
    build/libs/ctrl-interface/midi_surface/ardour_midisurface.dll \
    build/libs/ctrl-interface/control_protocol/ardourcp.dll \
    build/libs/ptformat/ptformat.dll \
    build/libs/audiographer/audiographer.dll \
    ; do
    if [ -f "$dll" ]; then
        cp "$dll" "$DESTDIR/bin/"
    else
        echo "  WARN: $dll not found"
    fi
done

cp build/libs/fst/ardour-vst-scanner.exe "$DESTDIR/bin/" 2>/dev/null || true
cp build/libs/fst/ardour-vst3-scanner.exe "$DESTDIR/bin/" 2>/dev/null || true

echo "--- Copying surfaces, backends, panners..."
find build/libs/surfaces/ -iname "*.dll" -exec cp {} "$DESTDIR/lib/phaedra8/surfaces/" \;
find build/libs/backends/ -iname "*.dll" -exec cp {} "$DESTDIR/lib/phaedra8/backends/" \;
find build/libs/panners/ -iname "*.dll" -exec cp {} "$DESTDIR/lib/phaedra8/panners/" \;

echo "--- Copying vamp plugins..."
cp build/libs/vamp-plugins/*ardourvampplugins*.dll "$DESTDIR/lib/phaedra8/vamp/libardourvampplugins.dll" 2>/dev/null || true
cp build/libs/vamp-pyin/*ardourvamppyin*.dll "$DESTDIR/lib/phaedra8/vamp/libardourvamppyin.dll" 2>/dev/null || true

echo "--- Copying GTK engine..."
cp build/libs/clearlooks-newer/clearlooks.dll "$DESTDIR/lib/gtk-2.0/engines/libclearlooks.la"

echo "--- Copying suil..."
cp build/libs/tk/suil/suil_win_in_gtk2.dll "$DESTDIR/lib/phaedra8/suil/" 2>/dev/null || true

echo "--- Copying LV2 bundles..."
cp -r build/libs/LV2 "$DESTDIR/lib/phaedra8/" 2>/dev/null || true

echo "--- Copying MINGW runtime DLLs..."
# Use ldd to find all needed DLLs
ldd "$DESTDIR/bin/Phaedra.exe" 2>/dev/null | grep "ucrt64" | awk '{print $3}' | while read dll; do
    cp "$dll" "$DESTDIR/bin/" 2>/dev/null || true
done

# Also get DLLs needed by our own DLLs
for libdll in "$DESTDIR/bin/"*.dll; do
    ldd "$libdll" 2>/dev/null | grep "ucrt64" | awk '{print $3}' | while read dll; do
        bn=$(basename "$dll")
        if [ ! -f "$DESTDIR/bin/$bn" ]; then
            cp "$dll" "$DESTDIR/bin/" 2>/dev/null || true
        fi
    done
done

echo "--- Copying share data..."
# RC and config files
cp build/gtk2_ardour/clearlooks.rc "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp build/gtk2_ardour/clearlooks.ardoursans.rc "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp build/gtk2_ardour/default_ui_config "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp build/gtk2_ardour/ardour.menus "$DESTDIR/share/phaedra8/"
cp build/gtk2_ardour/*.keys "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp gtk2_ardour/ArdourMono.ttf "$DESTDIR/share/phaedra8/"
cp gtk2_ardour/ArdourSans.ttf "$DESTDIR/share/phaedra8/"
cp system_config "$DESTDIR/share/phaedra8/" 2>/dev/null || true

# Themes
cp -r gtk2_ardour/themes "$DESTDIR/share/phaedra8/"

# Resources (icons, splash)
cp -r gtk2_ardour/resources "$DESTDIR/share/phaedra8/"

# Icons
cp -r gtk2_ardour/icons "$DESTDIR/share/phaedra8/"

# Share data
cp -r share/patchfiles "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/plugin_metadata "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/export "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/scripts "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/templates "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/mcp "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp -r share/midi_maps "$DESTDIR/share/phaedra8/" 2>/dev/null || true
cp share/chords.txt "$DESTDIR/share/phaedra8/"

# Compile every available application translation into the location used by
# bundle_env_mingw.cc. Waf does not build .mo files during a normal build.
echo "--- Compiling translations..."
command -v msgfmt >/dev/null || { echo "msgfmt is required to package translations" >&2; exit 1; }
for catalog in gtk2_ardour/po/*.po libs/ardour/po/*.po libs/gtkmm2ext/po/*.po libs/tk/ytk/po/*.po; do
    language="$(basename "$catalog" .po)"
    case "$catalog" in
        gtk2_ardour/po/*) domain=gtk2_ardour8 ;;
        libs/ardour/po/*) domain=ardour8 ;;
        libs/gtkmm2ext/po/*) domain=gtkmm2ext3 ;;
        libs/tk/ytk/po/*) domain=ytk8 ;;
    esac
    locale_dir="$DESTDIR/share/phaedra8/locale/$language/LC_MESSAGES"
    mkdir -p "$locale_dir"
    msgfmt -o "$locale_dir/$domain.mo" "$catalog"
done

# Fontconfig
cp "$MINGW_PREFIX/etc/fonts/fonts.conf" "$DESTDIR/etc/fonts/" 2>/dev/null || true

echo "--- Creating launcher..."
windres -I gtk2_ardour/icons -i tools/phaedra_launcher.rc -O coff -o build/phaedra_launcher.res
gcc -municode -mwindows tools/phaedra_launcher.c build/phaedra_launcher.res -o "$DESTDIR/Phaedra.exe"

echo "--- Setting up auto-updater..."
mkdir -p "$DESTDIR/updater"
cp phaedra_updater/updater.ps1 phaedra_updater/install-update.ps1 "$DESTDIR/updater/"
cp phaedra_updater/version.txt "$DESTDIR/"
cp phaedra_updater/update_config.ini "$DESTDIR/"
cp COPYING "$DESTDIR/"

cat > "$DESTDIR/Phaedra.bat" << 'ENDOFBAT'
@echo off
set PHAEDRA_DIR=%~dp0
set PATH=%PHAEDRA_DIR%bin;%PATH%
set PHAEDRA_DATA_PATH=%PHAEDRA_DIR%share\phaedra8
set ARDOUR_DATA_PATH=%PHAEDRA_DATA_PATH%
set PHAEDRA_CONFIG_PATH=%APPDATA%\Phaedra8
set ARDOUR_CONFIG_PATH=%PHAEDRA_CONFIG_PATH%
set PHAEDRA_DLL_PATH=%PHAEDRA_DIR%lib\phaedra8
set ARDOUR_DLL_PATH=%PHAEDRA_DLL_PATH%
set GTK_PATH=%PHAEDRA_DIR%lib
set FONTCONFIG_FILE=%PHAEDRA_DIR%etc\fonts\fonts.conf

start "" "%PHAEDRA_DIR%Phaedra.exe"
ENDOFBAT

echo ""
echo "=== Phaedra Portable created at: $DESTDIR ==="
TOTAL_SIZE=$(du -sh "$DESTDIR" | cut -f1)
echo "=== Total size: $TOTAL_SIZE ==="
echo "=== Run Phaedra.bat to launch ==="
