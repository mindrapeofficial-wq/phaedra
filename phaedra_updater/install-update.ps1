param([string]$Installer, [string]$PhaedraDir, [int]$LauncherPid)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    Wait-Process -Id $LauncherPid -Timeout 30 -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $Installer -ArgumentList '/SILENT','/NORESTART','/CLOSEAPPLICATIONS' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "El instalador termino con codigo $($process.ExitCode)." }
    Start-Process -FilePath (Join-Path $PhaedraDir 'Phaedra.exe') -WorkingDirectory $PhaedraDir | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show("No se pudo completar la actualizacion: $($_.Exception.Message)", 'Phaedra', 'OK', 'Error') | Out-Null
}
