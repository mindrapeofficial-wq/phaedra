@echo off
set PHAEDRA_DIR=%~dp0
set PATH=%PHAEDRA_DIR%bin;%PATH%
set ARDOUR_DATA_PATH=%PHAEDRA_DIR%share\ardour8
set ARDOUR_CONFIG_PATH=%APPDATA%\Phaedra8
set ARDOUR_DLL_PATH=%PHAEDRA_DIR%lib\ardour8
set GTK_PATH=%PHAEDRA_DIR%lib
set FONTCONFIG_FILE=%PHAEDRA_DIR%etc\fonts\fonts.conf

:: The native launcher owns the updater PID handshake and the audio environment.
start "" "%PHAEDRA_DIR%Phaedra.exe"
