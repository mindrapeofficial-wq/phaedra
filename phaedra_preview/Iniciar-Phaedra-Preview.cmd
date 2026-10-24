@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0PhaedraPreview.ps1" -Mode Run
if errorlevel 1 pause
