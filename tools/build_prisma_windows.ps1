# Rebuild the Phaedra Prisma VST3 from its pinned upstream source.
# Runs with PowerShell on windows-latest (Visual Studio 2022 + CMake).
# Does not enable ASIO, redistribute external binaries, or touch release assets.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$SourceCommit = 'f7b97c682ade0b87da85ca5968b63d5c7c98e68d'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TempBase = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$Source = Join-Path $TempBase 'phaedra-prisma-source'
$Build = Join-Path $TempBase 'phaedra-prisma-build'
$Output = Join-Path $Root 'vendor/prisma'
$Overlay = Join-Path $Root 'vendor/prisma-source'

function Invoke-Checked([string]$Tool, [string[]]$Arguments) {
    Write-Host ("+ " + $Tool + " " + ($Arguments -join ' '))
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Tool failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path (Join-Path $Overlay 'prisma-surge.patch'))) {
    throw "Missing Phaedra Prisma source overlay"
}
if (Test-Path $Source) { Remove-Item -LiteralPath $Source -Recurse -Force }
if (Test-Path $Build) { Remove-Item -LiteralPath $Build -Recurse -Force }
if (Test-Path $Output) { Remove-Item -LiteralPath $Output -Recurse -Force }

Invoke-Checked 'git' @('init', $Source)
Invoke-Checked 'git' @('-C', $Source, 'remote', 'add', 'origin', 'https://github.com/surge-synthesizer/surge.git')
Invoke-Checked 'git' @('-C', $Source, 'fetch', '--depth=1', 'origin', $SourceCommit)
Invoke-Checked 'git' @('-C', $Source, 'checkout', '--detach', 'FETCH_HEAD')
Invoke-Checked 'git' @('-C', $Source, 'submodule', 'update', '--init', '--recursive', '--jobs', '4')

$Patch = Join-Path $Overlay 'prisma-surge.patch'
Invoke-Checked 'git' @('-C', $Source, 'apply', '--check', $Patch)
Invoke-Checked 'git' @('-C', $Source, 'apply', $Patch)

$LogoDir = Join-Path $Source 'resources/prisma'
New-Item -Path $LogoDir -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $Overlay 'Prisma-logo.png') (Join-Path $LogoDir 'Prisma-logo.png')
Copy-Item (Join-Path $Overlay 'PrismaIcon.png') (Join-Path $LogoDir 'PrismaIcon.png')
Copy-Item (Join-Path $Overlay 'build-prisma-skin.py') (Join-Path $Source 'scripts/build-prisma-skin.py')
Invoke-Checked 'python' @((Join-Path $Source 'scripts/build-prisma-skin.py'))

Invoke-Checked 'cmake' @(
    '-S', $Source, '-B', $Build,
    '-G', 'Visual Studio 17 2022', '-A', 'x64',
    '-DSURGE_BUILD_TESTRUNNER=OFF',
    '-DSURGE_BUILD_FX=OFF',
    '-DSURGE_SKIP_STANDALONE=ON',
    '-DSURGE_COPY_AFTER_BUILD=OFF'
)
Invoke-Checked 'cmake' @('--build', $Build, '--config', 'Release', '--target', 'surge-xt_VST3', '--parallel', '4')

$Plugins = @(Get-ChildItem -Path $Build -Directory -Filter 'Prisma.vst3' -Recurse | Where-Object {
    Test-Path (Join-Path $_.FullName 'Contents/x86_64-win/Prisma.vst3')
})
if ($Plugins.Count -eq 0) { throw "Prisma.vst3 compiled bundle not found in $Build" }
$Plugin = $Plugins | Sort-Object FullName | Select-Object -First 1

$Skin = Join-Path $Source 'resources/data/skins/prisma.surge-skin/skin.xml'
$License = Join-Path $Source 'LICENSE'
if (-not (Test-Path $Skin)) { throw 'Prisma skin was not generated' }
if (-not (Test-Path $License)) { throw 'Surge XT license file is missing' }
New-Item -Path $Output -ItemType Directory -Force | Out-Null
Copy-Item -LiteralPath $Plugin.FullName -Destination (Join-Path $Output 'Prisma.vst3') -Recurse
Copy-Item -LiteralPath (Join-Path $Source 'resources/data') -Destination (Join-Path $Output 'SurgeXTData') -Recurse
Copy-Item -LiteralPath $License -Destination (Join-Path $Output 'LICENSE-Surge-XT.txt')

$Provenance = @(
    'Prisma VST3 built from Surge XT plus Phaedra source patch.'
    "Surge XT source: https://github.com/surge-synthesizer/surge/commit/$SourceCommit"
    'Overlay: vendor/prisma-source/prisma-surge.patch'
    'Surge XT license: GPL-3.0-or-later (see LICENSE-Surge-XT.txt)'
) -join "`n"
Set-Content -Path (Join-Path $Output 'PRISMA-SOURCE.txt') -Value $Provenance -Encoding utf8

$PluginOutput = Join-Path $Output 'Prisma.vst3/Contents/x86_64-win/Prisma.vst3'
$SkinOutput = Join-Path $Output 'SurgeXTData/skins/prisma.surge-skin/skin.xml'
if (-not (Test-Path $PluginOutput) -or -not (Test-Path $SkinOutput)) {
    throw 'The Prisma distribution payload is incomplete'
}
Write-Host "Prisma payload ready: $Output"
