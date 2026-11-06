$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-policy.ps1')
$script:checks = 0
function Check-Rejected {
    param([scriptblock]$Action)
    $rejected = $false
    try { & $Action } catch { $rejected = $true }
    if (-not $rejected) { throw 'Se acepto una actualizacion no valida.' }
    $script:checks++
}
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('phaedra-policy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $file = Join-Path $testRoot 'download.zip'
    [IO.File]::WriteAllBytes($file, [byte[]](1,2,3,4))
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    $asset = [pscustomobject]@{
        name = 'Phaedra-v1.0.6.zip'; size = 4; digest = 'sha256:' + $hash
        browser_download_url = 'https://github.com/mindrapeofficial-wq/phaedra/releases/download/v1.0.6/Phaedra-v1.0.6.zip'
    }
    Assert-PhaedraReleaseAsset $asset 'v1.0.6'; $script:checks++
    Assert-PhaedraDownload $file 4 $hash; $script:checks++
    foreach ($field in @('name','size','digest','browser_download_url')) {
        $old = $asset.$field
        $asset.$field = ''
        Check-Rejected { Assert-PhaedraReleaseAsset $asset 'v1.0.6' }
        $asset.$field = $old
    }
    foreach ($size in @(-1,0,1073741825,'invalid')) {
        $asset.size = $size
        Check-Rejected { Assert-PhaedraReleaseAsset $asset 'v1.0.6' }
    }
    $asset.size = 4
    $asset.name = '../Phaedra-v1.0.6.zip'
    Check-Rejected { Assert-PhaedraReleaseAsset $asset 'v1.0.6' }
    $asset.name = 'Phaedra-v1.0.6.zip'
    $asset.browser_download_url = 'https://github.com/mindrapeofficial-wq/phaedralite-releases/releases/download/v1.0.6/Phaedra-v1.0.6.zip'
    Check-Rejected { Assert-PhaedraReleaseAsset $asset 'v1.0.6' }
    Check-Rejected { Assert-PhaedraDownload $file 5 $hash }
    Check-Rejected { Assert-PhaedraDownload $file 3 $hash }
    Check-Rejected { Assert-PhaedraDownload $file 4 ('0' * 64) }
    Check-Rejected { Assert-PhaedraDownload $file 4 '' }
    Check-Rejected { Assert-PhaedraDownload (Join-Path $testRoot 'missing.zip') 4 $hash }
    Check-Rejected { Assert-PhaedraDownload $testRoot 4 $hash }
    # Replacing a previously verified download must fail the installer's second check.
    [IO.File]::WriteAllBytes($file, [byte[]](4,3,2,1))
    Check-Rejected { Assert-PhaedraDownload $file 4 $hash }
    # Mock process enumeration without opening or closing the user's application.
    function Get-Process { param($Name, $ErrorAction) return $script:running }
    $script:running = @([pscustomobject]@{ Path = (Join-Path $testRoot 'bin\Phaedra.exe') })
    Check-Rejected { Assert-PhaedraClosed $testRoot }
    $script:running = @([pscustomobject]@{ Path = $null })
    Check-Rejected { Assert-PhaedraClosed $testRoot }
    $script:running = @([pscustomobject]@{ Path = ($testRoot + '-other\Phaedra.exe') })
    Assert-PhaedraClosed $testRoot; $script:checks++
    $script:running = @()
    Assert-PhaedraClosed $testRoot; $script:checks++
    if (Test-PhaedraDevelopmentBuild $testRoot) { throw 'Normal package detected as development' }; $script:checks++
    Set-Content -LiteralPath (Join-Path $testRoot 'development-build.txt') -Value 'local build'
    if (-not (Test-PhaedraDevelopmentBuild $testRoot)) { throw 'Development marker ignored' }; $script:checks++
    $worktree = Join-Path $testRoot 'worktree'
    New-Item -ItemType Directory -Path $worktree | Out-Null
    Set-Content -LiteralPath (Join-Path $worktree '.git') -Value 'gitdir: synthetic'
    if (-not (Test-PhaedraDevelopmentBuild $worktree)) { throw 'Git worktree marker ignored' }; $script:checks++
    $savedLocalData = $env:LOCALAPPDATA
    try {
        $env:LOCALAPPDATA = $testRoot
        $downloadStage = Join-Path (Join-Path $testRoot 'PhaedraUpdater') ([guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $downloadStage -Force | Out-Null
        $download = Join-Path $downloadStage 'Phaedra-v1.0.6.zip'
        Set-Content -LiteralPath $download -Value 'partial download'
        Remove-PhaedraStagedDownload $download
        if (Test-Path -LiteralPath $downloadStage) { throw 'Cancelled download was retained' }; $script:checks++
        Remove-PhaedraStagedDownload $file
        if (-not (Test-Path -LiteralPath $file)) { throw 'Cleanup removed an unrelated file' }; $script:checks++
        New-Item -ItemType Directory -Path $downloadStage -Force | Out-Null
        Set-Content -LiteralPath $download -Value 'partial download'
        $other = Join-Path $downloadStage 'keep.txt'
        Set-Content -LiteralPath $other -Value 'not owned by cleanup'
        Remove-PhaedraStagedDownload $download
        if ((Test-Path -LiteralPath $download) -or -not (Test-Path -LiteralPath $other)) { throw 'Cleanup did not preserve additional files' }; $script:checks++
    } finally { $env:LOCALAPPDATA = $savedLocalData }
    Write-Output "$script:checks checks passed. No installed application or user session was modified."
} finally {
    # Only the exact disposable directory created by this test may be removed.
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempParent, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved) -match '^phaedra-policy-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
