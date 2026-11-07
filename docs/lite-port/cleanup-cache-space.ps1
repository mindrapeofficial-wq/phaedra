$ErrorActionPreference = 'Stop'
$userRoot = 'C:\Users\mindr'
$packageCache = Join-Path $userRoot 'AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local'
$targets = @(
    (Join-Path $userRoot 'Desktop\FLUX\FLUX-Stoat\deploy\source-stage\0.1.6-web-0-1-9\activities\phaedra\.build\target'),
    (Join-Path $userRoot 'Desktop\PHAEDRA LITE\phaedra-instruments\target'),
    (Join-Path $userRoot 'Desktop\rivals-auto-battle\.android-build\gradle\caches'),
    (Join-Path $userRoot '.gradle\wrapper\dists'),
    (Join-Path $userRoot 'Desktop\FLUX\FLUX-Launcher-0.2.0\source\element-web\node_modules'),
    (Join-Path $userRoot 'Desktop\FLUX\element-web-develop\element-web-develop\node_modules')
)
$reportFile = Join-Path $PSScriptRoot ('cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$report = [ordered]@{ StartedUtc=[DateTime]::UtcNow.ToString('o'); FreeBefore=(Get-PSDrive C).Free; Entries=@() }
foreach ($target in $targets) {
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $resolved = (Resolve-Path -LiteralPath $target).ProviderPath
    if ($resolved -ine [IO.Path]::GetFullPath($target) -or
        -not $resolved.StartsWith($userRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Invalid cleanup boundary: $target" }
    $item = Get-Item -LiteralPath $resolved -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked directory: $resolved" }
    if ($item.Name -eq 'target' -and -not (Test-Path -LiteralPath (Join-Path $resolved 'CACHEDIR.TAG'))) { throw "Missing Cargo cache marker: $resolved" }
    $busy = @(Get-CimInstance Win32_Process | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($resolved + '\', [StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.IndexOf($resolved, [StringComparison]::OrdinalIgnoreCase) -ge 0)
    })
    if ($busy.Count) { Write-Output "Skipped active cache: $resolved"; continue }
    $children = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force)
    $links = @($children | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
    if ($links.Count -and $item.Name -ne 'node_modules') { throw "Refusing cache with links: $resolved" }
    if ($item.Name -eq 'node_modules' -and -not (Test-Path -LiteralPath (Join-Path $item.Parent.FullName 'pnpm-lock.yaml'))) { throw 'Dependencies have no reproducible lockfile.' }
    $bytes = ($children | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
    $entry = [ordered]@{ Path=$resolved; Bytes=$bytes; Status='validated' }
    $report.Entries += $entry
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFile -Encoding UTF8
    # pnpm links can point to workspace sources. Remove only the link itself,
    # never recursively traverse its target. Sources and lockfiles stay intact.
    foreach ($link in $links) {
        if (-not $link.FullName.StartsWith($resolved + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Link outside cache boundary.' }
        Remove-Item -LiteralPath $link.FullName -Force
    }
    # Exact validated absolute paths, in the same PowerShell process throughout.
    Remove-Item -LiteralPath $resolved -Recurse -Force
    $entry.Status = 'deleted'
    $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFile -Encoding UTF8
    Write-Output ('Deleted {0:N2} GiB: {1}' -f ($bytes / 1GB), $resolved)
}
$report.FreeAfter = (Get-PSDrive C).Free
$report.RecoveredBytes = $report.FreeAfter - $report.FreeBefore
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportFile -Encoding UTF8
Write-Output ('Recovered {0:N2} GiB; free now {1:N2} GiB. Log: {2}' -f ($report.RecoveredBytes/1GB), ($report.FreeAfter/1GB), $reportFile)
