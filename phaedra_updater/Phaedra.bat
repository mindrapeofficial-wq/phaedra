@echo off
set PHAEDRA_DIR=%~dp0
set PATH=%PHAEDRA_DIR%bin;%PATH%
set ARDOUR_DATA_PATH=%PHAEDRA_DIR%share\ardour8
set ARDOUR_CONFIG_PATH=%APPDATA%\Phaedra8
set ARDOUR_DLL_PATH=%PHAEDRA_DIR%lib\ardour8
set GTK_PATH=%PHAEDRA_DIR%lib
set FONTCONFIG_FILE=%PHAEDRA_DIR%etc\fonts\fonts.conf

:: Check for updates before launching
if exist "%PHAEDRA_DIR%updater\updater.ps1" (
    powershell -ExecutionPolicy Bypass -NoProfile -File "%PHAEDRA_DIR%updater\updater.ps1" -PhaedraDir "%PHAEDRA_DIR%"
    if %ERRORLEVEL% EQU 0 (
        :: If updater restarted the app, this instance should exit
        tasklist /FI "IMAGENAME eq Phaedra.exe" 2>NUL | find /I "Phaedra.exe" >NUL
        if not errorlevel 1 exit /b 0
    )
)

start "" "%PHAEDRA_DIR%bin\Phaedra.exe"
