param([string]$Package = (Join-Path $PSScriptRoot '..\Phaedra-Portable'))
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $Package).Path
$exe = Join-Path $packageRoot 'bin\Phaedra.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Missing executable: $exe" }
$qaRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\build\lite-port-qa'))
$profileRoot = Join-Path $qaRoot 'config'
New-Item -ItemType Directory -Path $profileRoot -Force | Out-Null
$names = @('XDG_CONFIG_HOME','XDG_CACHE_HOME','PHAEDRA_DATA_PATH','PHAEDRA_CONFIG_PATH','PHAEDRA_DLL_PATH','PHAEDRA_PULSE_PROFILE_ROOT','GTK_PATH','FONTCONFIG_FILE','PATH')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:XDG_CONFIG_HOME = $profileRoot
    $env:XDG_CACHE_HOME = Join-Path $qaRoot 'cache'
    $env:PHAEDRA_CONFIG_PATH = Join-Path $profileRoot 'Phaedra8'
    $env:PHAEDRA_DATA_PATH = Join-Path $packageRoot 'share\ardour8'
    $env:PHAEDRA_DLL_PATH = Join-Path $packageRoot 'lib\ardour8'
    $env:PHAEDRA_PULSE_PROFILE_ROOT = Join-Path $qaRoot 'pulse-profile'
    $env:GTK_PATH = Join-Path $packageRoot 'lib'
    $env:FONTCONFIG_FILE = Join-Path $packageRoot 'etc\fonts\fonts.conf'
    $env:PATH = (Join-Path $packageRoot 'bin') + ';' + $env:PATH
    # Visible interactive application under test; bypass updater, use isolated settings.
    $process = Start-Process -FilePath $exe -ArgumentList '-n','-a' -WorkingDirectory (Split-Path $exe) -PassThru `
        -RedirectStandardOutput (Join-Path $qaRoot 'stdout.log') -RedirectStandardError (Join-Path $qaRoot 'stderr.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $qaRoot 'pid.txt')
    Write-Output "QA PID: $($process.Id); profile: $profileRoot"
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
