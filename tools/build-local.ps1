param(
    [switch]$Reconfigure,
    [int]$Jobs = [Math]::Min(8, [Environment]::ProcessorCount)
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$msysRoot = 'C:\msys64'
$python = Join-Path $msysRoot 'ucrt64\bin\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    throw "MSYS2 UCRT64 Python was not found at $python"
}

$env:MSYSTEM = 'UCRT64'
$env:PATH = (Join-Path $msysRoot 'ucrt64\bin') + ';' + (Join-Path $msysRoot 'usr\bin') + ';' + $env:PATH
Push-Location $projectRoot
try {
    if ($Reconfigure -or -not (Test-Path -LiteralPath 'build\c4che\_cache.py')) {
        & $python waf configure --with-backends=portaudio,dummy --no-phone-home --no-dr-mingw --dist-target=mingw --optimize --program-name=Phaedra
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & $python waf build "-j$Jobs"
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}