# Installer for Phaedra's freely downloadable plugin replacements.
# Third-party binaries are fetched directly from their publishers on the user's PC.
# The public Phaedra ZIP never contains these binaries.
[CmdletBinding()]
param(
    [ValidateSet('All', 'Effects', 'Sampler')]
    [string] $Group = 'All',
    [string] $ManifestPath = (Join-Path $PSScriptRoot 'phaedra-plugin-replacements.json'),
    [string] $Destination = (Join-Path $PSScriptRoot 'Plugins\VST3'),
    [switch] $Force,
    [switch] $SkipBeta
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Normalize-PluginName([string] $value) {
    return ($value -replace '[^A-Za-z0-9]', '').ToLowerInvariant()
}

function Find-Vst3Bundles([string] $path) {
    $candidates = @(Get-ChildItem -LiteralPath $path -Recurse -Force |
        Where-Object { $_.Name -match '(?i)\.vst3$' })
    $bundles = New-Object System.Collections.ArrayList
    foreach ($candidate in $candidates) {
        $parent = $candidate.Parent
        $nested = $false
        while ($null -ne $parent -and $parent.FullName.StartsWith($path, [StringComparison]::OrdinalIgnoreCase)) {
            if ($parent.Name -match '(?i)\.vst3$') {
                $nested = $true
                break
            }
            $parent = $parent.Parent
        }
        if (-not $nested) {
            [void] $bundles.Add($candidate)
        }
    }
    return @($bundles)
}

if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "No existe el manifiesto de plugins: $ManifestPath"
}
$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) {
    throw "Version de manifiesto no soportada."
}
if (-not (Test-Path -LiteralPath $Destination)) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
}
$Destination = (Resolve-Path -LiteralPath $Destination).Path
$selected = @($manifest.packages | Where-Object {
    ($Group -eq 'All' -or $_.group -eq $Group.ToLowerInvariant()) -and
    (-not $SkipBeta -or -not $_.beta)
})

if ($selected.Count -eq 0) {
    Write-Host 'No hay paquetes para esta seleccion.'
    exit 0
}

Write-Host "Phaedra: instalacion de plugins gratuitos ($Group)" -ForegroundColor Cyan
Write-Host "Directorio de VST3: $Destination"
Write-Host "Origen: publicaciones oficiales de los desarrolladores."
Write-Host "No se instala ni descarga Vital: usa Install-Vital.bat para tu copia oficial." -ForegroundColor DarkYellow
if (@($selected | Where-Object { $_.beta }).Count -gt 0) {
    Write-Warning 'Shortcircuit XT es una beta. Puede generar picos inesperados; usa un limitador y controla el volumen.'
}
Write-Host ''

$temporary = Join-Path ([IO.Path]::GetTempPath()) ("phaedra-plugins-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
$installed = New-Object System.Collections.ArrayList
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    foreach ($pkg in $selected) {
        $id = [string] $pkg.id
        $publisher = [uri] $pkg.url
        if ($publisher.Scheme -ne 'https' -or $publisher.Host -ne 'github.com' -or
            $publisher.AbsolutePath -notmatch '^/(zamaudio/zam-plugins|michaelwillis/dragonfly-reverb|surge-synthesizer/shortcircuit-xt)/releases/download/') {
            throw "URL de distribucion no autorizada para el paquete $id."
        }
        if ([string] $pkg.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
            throw "El paquete $id no tiene un hash SHA256 valido."
        }
        Write-Host "Descargando $id ($($pkg.version))..." -ForegroundColor Yellow
        $zipfile = Join-Path $temporary ($id + '.zip')
        $extract = Join-Path $temporary ($id + '-unpacked')
        Invoke-WebRequest -Uri ([string] $pkg.url) -UseBasicParsing -OutFile $zipfile

        $actual = (Get-FileHash -LiteralPath $zipfile -Algorithm SHA256).Hash.ToLowerInvariant()
        $expected = ([string] $pkg.sha256).ToLowerInvariant()
        if ($actual -ne $expected) {
            throw "SHA256 incorrecto para $id. Descarga rechazada. Esperado: $expected, recibido: $actual"
        }
        Expand-Archive -LiteralPath $zipfile -DestinationPath $extract -Force
        $bundles = @(Find-Vst3Bundles $extract)
        if ($bundles.Count -eq 0) {
            throw "No se han encontrado plugins .vst3 en $id."
        }
        $available = @($bundles | ForEach-Object { Normalize-PluginName $_.BaseName })
        foreach ($required in @($pkg.expectedPlugins)) {
            if ($available -notcontains (Normalize-PluginName ([string] $required))) {
                throw "Paquete $id incompleto: falta $required. Detectados: $($bundles.Name -join ', ')"
            }
        }

        $paths = New-Object System.Collections.ArrayList
        foreach ($bundle in $bundles) {
            $dest = Join-Path $Destination $bundle.Name
            if (Test-Path -LiteralPath $dest) {
                if (-not $Force) {
                    Write-Host "Ya existe: $($bundle.Name). Usa -Force para actualizar." -ForegroundColor DarkYellow
                    continue
                }
                Remove-Item -LiteralPath $dest -Force -Recurse
            }
            Copy-Item -LiteralPath $bundle.FullName -Destination $dest -Force -Recurse
            if (-not (Test-Path -LiteralPath $dest)) {
                throw "Error al instalar $($bundle.Name)"
            }
            [void] $paths.Add($bundle.Name)
        }

        # Preserve upstream attribution and provenance in this local installation.
        $licenses = Join-Path (Split-Path -Parent $Destination) "Licenses\$id"
        New-Item -ItemType Directory -Path $licenses -Force | Out-Null
        $notice = @(
            "Plugin family: $id"
            "Version: $($pkg.version)"
            "License declared upstream: $($pkg.license)"
            "Downloaded directly from: $($pkg.url)"
            "Verified SHA256: $actual"
            "Corresponding upstream source: $($pkg.source)"
            "Copyright and license are retained by each upstream developer."
            "Phaedra does not claim authorship of these external plugins."
        )
        [IO.File]::WriteAllLines((Join-Path $licenses 'PROVENANCE.txt'), $notice, [Text.Encoding]::UTF8)
        [void] $installed.Add([pscustomobject]@{ package=$id; installed=@($paths); available=@($bundles.Name) })
        Write-Host "Integrado en Phaedra: $id ($($bundles.Count) VST3 encontrados)" -ForegroundColor Green
    }
    Write-Host ''
    Write-Host 'Instalacion completada. Reinicia Phaedra y actualiza el escaneo VST3.' -ForegroundColor Green
    Write-Host 'Los ACE originales siguen disponibles para abrir sesiones anteriores.'
    $installed | ConvertTo-Json -Depth 5 | Write-Host
}
finally {
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}
