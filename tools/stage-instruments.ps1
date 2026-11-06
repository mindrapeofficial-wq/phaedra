param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path
$destination = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\build\instruments-bundle'))
$hashes = Get-Content -LiteralPath (Join-Path $sourceRoot 'SHA256.json') -Raw | ConvertFrom-Json
$manifest = @()
foreach ($name in @('Phaedra Drums','Phaedra Slice','Phaedra FM6')) {
    $inputFile = Join-Path $sourceRoot "$name.clap"
    $expected = @($hashes | Where-Object File -eq "$name.clap")
    if ($expected.Count -ne 1 -or (Get-FileHash -LiteralPath $inputFile -Algorithm SHA256).Hash -ne $expected[0].Hash) {
        throw "Instrument checksum mismatch: $name"
    }
    # These libraries export both clap_entry and a native VST3 factory.
    # test-instrument-factories.cc verifies native component creation separately.
    $bundle = Join-Path $destination "VST3\$name.vst3\Contents\x86_64-win"
    New-Item -ItemType Directory -Path $bundle -Force | Out-Null
    Copy-Item -LiteralPath $inputFile -Destination (Join-Path $bundle "$name.vst3") -Force
    $manifest += [ordered]@{ Name=$name; Source=$inputFile; SHA256=$expected[0].Hash; Format='native VST3, dual-export library' }
}
foreach ($file in @('LICENSE','THIRD-PARTY-NOTICES.txt','PHAEDRA-INSTRUMENTS.md')) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $destination -Force
}
$archive = Join-Path (Split-Path $sourceRoot -Parent) 'phaedra-instruments-source.tar.gz'
Copy-Item -LiteralPath $archive -Destination (Join-Path $destination 'Phaedra-Instruments-source.tar.gz') -Force
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $destination 'manifest.json') -Encoding UTF8
Write-Output "Staged three native VST3 instruments: $destination"
