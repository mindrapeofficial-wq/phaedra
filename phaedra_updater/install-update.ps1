param([string]$ZipFile, [string]$PhaedraDir, [int]$LauncherPid,
      [long]$ExpectedSize, [string]$ExpectedSha256)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-policy.ps1')
. (Join-Path $PSScriptRoot 'install-package.ps1')
Add-Type -AssemblyName System.Windows.Forms
try {
    if ($LauncherPid -gt 0 -and (Get-Process -Id $LauncherPid -ErrorAction SilentlyContinue)) {
        Wait-Process -Id $LauncherPid -Timeout 3600 -ErrorAction Stop
    }
    Assert-PhaedraClosed -PhaedraDir $PhaedraDir
    Assert-PhaedraDownload -Path $ZipFile -ExpectedSize $ExpectedSize -ExpectedSha256 $ExpectedSha256
    Install-PhaedraPackage $ZipFile $PhaedraDir $ExpectedSize $ExpectedSha256 | Out-Null
    Remove-PhaedraStagedDownload $ZipFile
    Start-Process -FilePath (Join-Path $PhaedraDir 'Phaedra.exe') -WorkingDirectory $PhaedraDir | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show("No se pudo completar la actualizacion: $($_.Exception.Message)", 'Phaedra', 'OK', 'Error') | Out-Null
}
