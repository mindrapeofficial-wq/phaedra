param([string]$ZipFile, [string]$PhaedraDir, [int]$LauncherPid)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    Wait-Process -Id $LauncherPid -Timeout 30 -ErrorAction SilentlyContinue
    Expand-Archive -LiteralPath $ZipFile -DestinationPath $PhaedraDir -Force
    Remove-Item -LiteralPath $ZipFile -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath (Join-Path $PhaedraDir 'Phaedra.exe') -WorkingDirectory $PhaedraDir | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show("No se pudo completar la actualizacion: $($_.Exception.Message)", 'Phaedra', 'OK', 'Error') | Out-Null
}
