# Install Vital from the user's own installation into this portable Phaedra copy.
# This script does not download or redistribute any Vital binaries or factory content.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginDir = Join-Path $root 'Plugins\VST3'
$destination = Join-Path $pluginDir 'Vital.vst3'

if (-not (Test-Path -LiteralPath (Join-Path $root 'bin\Phaedra.exe'))) {
    Write-Host 'Ejecuta este instalador desde la carpeta de Phaedra Portable.' -ForegroundColor Red
    exit 2
}

$searchRoots = @()
if ($env:ProgramFiles) {
    $searchRoots += (Join-Path $env:ProgramFiles 'Common Files\VST3')
}
if ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) {
    $searchRoots += (Join-Path ([Environment]::GetEnvironmentVariable('ProgramFiles(x86)')) 'Common Files\VST3')
}
if ($env:LOCALAPPDATA) {
    $searchRoots += (Join-Path $env:LOCALAPPDATA 'Programs\Common\VST3')
}

$source = $null
foreach ($directory in $searchRoots) {
    $candidate = Join-Path $directory 'Vital.vst3'
    if (Test-Path -LiteralPath $candidate) {
        $source = $candidate
        break
    }
}

if (-not $source) {
    Write-Host 'Vital VST3 no esta instalado en las rutas habituales.' -ForegroundColor Yellow
    Write-Host 'Instala Vital Basic desde su sitio oficial: https://vital.audio/'
    Write-Host 'Selecciona VST3 en el instalador oficial y vuelve a ejecutar este script.'
    exit 1
}

if (-not (Test-Path -LiteralPath $pluginDir)) {
    New-Item -Path $pluginDir -ItemType Directory -Force | Out-Null
}
if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
}
Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force

if (-not (Test-Path -LiteralPath $destination)) {
    throw 'La copia de Vital no se ha completado.'
}
Write-Host 'Vital VST3 incorporado a tu copia local de Phaedra.' -ForegroundColor Green
Write-Host ('Origen: ' + $source)
Write-Host ('Destino: ' + $destination)
Write-Host 'Reinicia Phaedra y ejecuta el escaneo VST3 si no aparece como instrumento.'
Write-Host 'Esta operacion es solo para tu instalacion. No redistribuyas el paquete con Vital incluido.'
