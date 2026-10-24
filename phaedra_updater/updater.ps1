param(
    [Parameter(Mandatory = $true)][string]$PhaedraDir,
    [int]$ParentPid = 0
)
# Only run from the temporary script copied by the launcher.
# Windows PowerShell 5.1 compatible; keep the previous entire installation.
$ErrorActionPreference = 'Stop'
$repo = 'mindrapeofficial-wq/phaedra'
$root = [IO.Path]::GetFullPath($PhaedraDir).TrimEnd('\', '/')
$parent = Split-Path $root -Parent
$mutex = New-Object System.Threading.Mutex($false, 'Local\PhaedraPortableUpdater')
$hasLock = $false
$backup = $null
$backedUp = $false
$stage = $null
$download = $null
$userApproved = $false

function Run-App {
    $launcher = Join-Path $root 'Phaedra.exe'
    if (Test-Path -LiteralPath $launcher -PathType Leaf) {
        Start-Process -FilePath $launcher -ArgumentList '--no-update' -WorkingDirectory $root
    }
}
function Safe-Relative([string]$name) {
    $relative = $name.Replace('/', '\')
    if (!$relative -or [IO.Path]::IsPathRooted($relative) -or
        $relative -match '(^|\\)\.\.(\\|$)' -or $relative.Contains(':')) {
        throw ('Unsafe archive path: ' + $name)
    }
    return $relative
}
function Check-Stage([string]$folder, [string]$version) {
    foreach ($path in @('Phaedra.exe', 'bin\Phaedra.exe', 'version.txt',
        'COPYING', 'LICENSES.md', 'SOURCE.txt', 'BUILD-DEPENDENCIES.txt',
        'MANIFEST.sha256', 'updater\updater.ps1', 'update_config.ini',
        'share\ardour8\ardour.menus')) {
        if (!(Test-Path -LiteralPath (Join-Path $folder $path) -PathType Leaf)) {
            throw ('Missing payload file: ' + $path)
        }
    }
    if ((Get-Content -LiteralPath (Join-Path $folder 'version.txt') -TotalCount 1).Trim() -ne $version) {
        throw 'Release tag and bundle version differ'
    }
    $manifest = Join-Path $folder 'MANIFEST.sha256'
    $seen = @{}
    foreach ($line in (Get-Content -LiteralPath $manifest -Encoding UTF8)) {
        if ($line -cnotmatch '^([0-9a-f]{64})  (.+)$') { throw 'Bad SHA256 manifest' }
        $digest = $Matches[1].ToUpperInvariant()
        $relative = Safe-Relative $Matches[2]
        if ($seen.ContainsKey($relative)) { throw 'Repeated path in manifest' }
        $full = [IO.Path]::GetFullPath((Join-Path $folder $relative))
        if (!$full.StartsWith(($folder.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Manifest path outside staging folder'
        }
        if (!(Test-Path -LiteralPath $full -PathType Leaf)) { throw ('Missing file: ' + $relative) }
        if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -cne $digest) {
            throw ('Corrupt file: ' + $relative)
        }
        $seen[$relative] = $true
    }
    $actual = @(Get-ChildItem -LiteralPath $folder -File -Recurse |
        Where-Object { $_.FullName -ne $manifest })
    if ($seen.Count -ne $actual.Count) { throw 'Manifest does not cover all files' }
}

try {
    $hasLock = $mutex.WaitOne(0)
    if (!$hasLock) { return }
    if ($ParentPid -gt 0) {
        $old = Get-Process -Id $ParentPid -ErrorAction SilentlyContinue
        if ($old) {
            $old.WaitForExit(30000) | Out-Null
            if (!$old.HasExited) { throw 'Launcher is still in use' }
        }
    }
    $localFile = Join-Path $root 'version.txt'
    $settings = Join-Path $root 'update_config.ini'
    if (!(Test-Path -LiteralPath $localFile) -or !(Test-Path -LiteralPath $settings)) { return }
    $config = @(Get-Content -LiteralPath $settings)
    if ($config -notcontains 'check_updates=true' -or
        $config -notcontains ('github_repo=' + $repo)) { return }
    $local = (Get-Content -LiteralPath $localFile -TotalCount 1).Trim()
    if ($local -notmatch '^\d+\.\d+\.\d+$') { return }

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{ 'User-Agent' = 'PhaedraPortableUpdater/2.0'; 'Accept' = 'application/vnd.github+json' }
    $response = Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $repo + '/releases/latest') -Headers $headers -TimeoutSec 8
    if ($response.draft -or $response.prerelease -or
        $response.tag_name -notmatch '^v(\d+\.\d+\.\d+)$') { return }
    $remote = $Matches[1]
    if ([version]$remote -le [version]$local) { return }

    $name = 'Phaedra-v' + $remote + '-win-x64.zip'
    $assets = @($response.assets | Where-Object { $_.name -ceq $name })
    if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:([0-9a-fA-F]{64})$') { return }
    $digest = $Matches[1].ToUpperInvariant()
    if ([long]$assets[0].size -le 0 -or [long]$assets[0].size -gt 2147483648) { return }

    Add-Type -AssemblyName PresentationFramework
    $choice = [System.Windows.MessageBox]::Show(
        ('Phaedra v' + $remote + ' disponible (actual: v' + $local + ').' +
         [Environment]::NewLine + '¿Actualizar antes de abrir?'),
        'Actualización de Phaedra', 'YesNo', 'Question')
    if ($choice -ne 'Yes') { return }
    $userApproved = $true

    $download = Join-Path $env:TEMP ('Phaedra-' + [Guid]::NewGuid().ToString('N') + '.zip')
    Invoke-WebRequest -Uri $assets[0].browser_download_url -Headers $headers -OutFile $download -UseBasicParsing -TimeoutSec 300
    if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -cne $digest) {
        throw 'Downloaded release failed the GitHub SHA256 check'
    }
    $stage = Join-Path $parent ('.phaedra-stage-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($download)
    try {
        if ($archive.Entries.Count -gt 50000) { throw 'Too many files in release' }
        $unpackedBytes = [int64]0
        foreach ($entry in $archive.Entries) {
            $unpackedBytes += $entry.Length
            if ($unpackedBytes -gt 4294967296) { throw 'Release too large after extraction' }
            $relative = Safe-Relative $entry.FullName
            $absolute = [IO.Path]::GetFullPath((Join-Path $stage $relative))
            if (!$absolute.StartsWith(($stage + '\'), [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Archive entry escapes installation staging area'
            }
        }
    } finally { $archive.Dispose() }

    Expand-Archive -LiteralPath $download -DestinationPath $stage -Force
    Check-Stage $stage $remote

    $binExe = Join-Path $root 'bin\Phaedra.exe'
    foreach ($p in @(Get-Process -Name 'Phaedra' -ErrorAction SilentlyContinue)) {
        try {
            if ($p.Path -ieq $binExe) { throw 'Please close Phaedra before upgrading' }
        } catch [System.ComponentModel.Win32Exception] { }
    }
    $backup = Join-Path $parent ('.phaedra-backup-' + $local + '-' +
                                 [Guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $root -Destination $backup -ErrorAction Stop
    $backedUp = $true
    try {
        Move-Item -LiteralPath $stage -Destination $root -ErrorAction Stop
        $stage = $null
        $backedUp = $false
    } catch {
        if (!(Test-Path -LiteralPath $root)) {
            Move-Item -LiteralPath $backup -Destination $root -ErrorAction Stop
            $backedUp = $false
        }
        throw
    }
} catch {
    if ($userApproved) {
    try {
        Add-Type -AssemblyName PresentationFramework -ErrorAction SilentlyContinue
        [System.Windows.MessageBox]::Show(
            ('La actualización ha fallado. Se ha conservado la versión anterior.' +
             [Environment]::NewLine + $_.Exception.Message),
            'Phaedra', 'OK', 'Warning') | Out-Null
    } catch { }
    }
} finally {
    if ($backedUp -and !(Test-Path -LiteralPath $root) -and $backup) {
        try { Move-Item -LiteralPath $backup -Destination $root -ErrorAction Stop } catch { }
    }
    if ($stage -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($download -and (Test-Path -LiteralPath $download)) {
        Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
    }
    if ($hasLock) {
        try { Run-App } catch { }
        $mutex.ReleaseMutex() | Out-Null
    }
    $mutex.Dispose()
    if ($PSCommandPath -like (Join-Path $env:TEMP 'PhaedraUpdater-*.ps1')) {
        Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue
    }
}
