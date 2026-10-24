@echo off
setlocal
echo Instalacion de instrumentos y efectos gratuitos para Phaedra
echo Se descargaran paquetes verificados de ZamAudio, Dragonfly y Shortcircuit XT.
echo Vital se integra mediante Install-Vital.bat despues de instalarlo oficialmente.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Free-Plugins.ps1" -Group All
if errorlevel 1 (
    echo.
    echo Se produjo un error. Revisa los mensajes anteriores.
)
pause
