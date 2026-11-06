param(
    [string]$LiteRoot = 'C:\Users\mindr\Desktop\PHAEDRA LITE',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\docs\lite-port')
)
$ErrorActionPreference = 'Stop'
$copies = @('08-DESARROLLO-PREVIEW6','soundcraft-src','02-CODIGO-INDEPENDIENTE','phaedra-rea-compare')
$maps = @{}
foreach ($copy in $copies) {
    $root = Join-Path $LiteRoot $copy
    $map = @{}
    foreach ($area in @('apps','crates','packaging','assets')) {
        foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root $area) -Recurse -File) {
            $relative = $file.FullName.Substring($root.Length + 1).Replace('\','/')
            $map[$relative] = [pscustomobject]@{
                Hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
                Modified = $file.LastWriteTimeUtc.ToString('o')
            }
        }
    }
    $maps[$copy] = $map
}
$primary = $maps[$copies[0]]
$paths = @($maps.Values | ForEach-Object { $_.Keys } | Sort-Object -Unique)
$rows = foreach ($path in $paths) {
    $entry = $primary[$path]
    $row = [ordered]@{ Path=$path; Preview6SHA256=$entry.Hash; Preview6ModifiedUtc=$entry.Modified }
    foreach ($copy in $copies[1..3]) {
        $other = $maps[$copy][$path]
        $row[$copy] = if (-not $other) { 'absent' } elseif (-not $entry) { 'only-other-copy' } elseif ($entry.Hash -eq $other.Hash) { 'identical' } else { 'different' }
        $row[$copy + '-SHA256'] = $other.Hash
    }
    [pscustomobject]$row
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$rows | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'source-inventory.csv') -NoTypeInformation -Encoding UTF8
$summary = [ordered]@{ CapturedUtc=[DateTime]::UtcNow.ToString('o'); SelectedSource=(Join-Path $LiteRoot $copies[0]); Files=$primary.Count }
foreach ($copy in $copies[1..3]) {
    $summary[$copy] = @($rows | Group-Object -Property $copy | Select-Object Name,Count)
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'source-summary.json') -Encoding UTF8
$summary | ConvertTo-Json -Depth 6
