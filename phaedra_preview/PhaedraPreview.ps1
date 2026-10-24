# Phaedra Preview Bridge for Windows PowerShell 5.1.
# Installs only validated GitHub prereleases from the owner repository.
# Always keeps the stable Phaedra installation separate.
[CmdletBinding()]
param(
    [ValidateSet('Run', 'Check', 'Watch')]
    [string]$Mode = 'Run',
    [ValidateRange(120, 3600)]
    [int]$PollSeconds = 120
)
$ErrorActionPreference = 'Stop'
$repo = 'mindrapeofficial-wq/phaedra'
$assetName = 'Phaedra-v0.0.0-win-x64.zip'
$base = Join-Path $env:LOCALAPPDATA 'Phaedra'
$root = Join-Path $base 'Preview'
$expectedExe = Join-Path $root 'bin\Phaedra.exe'
$mutex = New-Object System.Threading.Mutex($false, 'Local\PhaedraPreviewBridge')
$hasLock = $false

function Get-LatestPreview {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $headers = @{
        'User-Agent' = 'PhaedraPreviewBridge/1.0'
        'Accept' = 'application/vnd.github+json'
    }
    $list = @(Invoke-RestMethod -Uri ('https://api.github.com/repos/' + $repo + '/releases?per_page=40') -Headers $headers -TimeoutSec 15)
    foreach ($release in $list) {
        if (!$release.prerelease -or $release.draft -or
            $release.tag_name -notmatch '^preview-([a-f0-9]{40})$') {
            continue
        }
        $sha = $Matches[1]
        $assets = @($release.assets | Where-Object { $_.name -ceq $assetName })
        if ($assets.Count -ne 1) { continue }
        $asset = $assets[0]
        if ($asset.digest -notmatch '^sha256:([a-fA-F0-9]{64})$') { continue }
        $digest = $Matches[1].ToUpperInvariant()
        if ([long]$asset.size -le 0 -or [long]$asset.size -gt 2147483648) { continue }
        $url = [uri]$asset.browser_download_url
        if ($url.Scheme -cne 'https' -or $url.Host -cne 'github.com' -or
            $url.AbsolutePath -cnotmatch '^/mindrapeofficial-wq/phaedra/releases/download/preview-[a-f0-9]{40}/Phaedra-v0\.0\.0-win-x64\.zip$') {
            continue
        }
        return [pscustomobject]@{ Sha = $sha; Digest = $digest; Url = $url.AbsoluteUri }
    }
    return $null
}

function Get-InstalledSha {
    if (!(Test-Path -LiteralPath $root)) { return '' }
    if (!(Test-Path -LiteralPath (Join-Path $root 'preview-channel.flag') -PathType Leaf)) {
        throw 'La carpeta de destino no pertenece a Phaedra Preview. No se modificara.'
    }
    $file = Join-Path $root 'SOURCE.txt'
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw 'Instalacion Preview incompleta: falta SOURCE.txt.'
    }
    foreach ($line in (Get-Content -LiteralPath $file -Encoding UTF8)) {
        if ($line -match '^Exact commit: ([a-f0-9]{40})$') { return $Matches[1] }
    }
    throw 'No se encuentra el commit de la instalacion Preview.'
}

function Test-PreviewRunning {
    foreach ($process in @(Get-Process -Name 'Phaedra' -ErrorAction SilentlyContinue)) {
        try {
            if ($process.Path -and $process.Path.Equals($expectedExe, [StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        } catch [System.ComponentModel.Win32Exception] { }
    }
    return $false
}

function Assert-SafeRelative([string]$name) {
    $relative = $name.Replace('/', '\')
    if (!$relative -or [IO.Path]::IsPathRooted($relative) -or
        $relative.Contains(':') -or $relative -match '(^|\\)\.\.(\\|$)') {
        throw ('Ruta insegura dentro del ZIP: ' + $name)
    }
    return $relative
}

function Assert-StagedPreview([string]$stage, [string]$sha) {
    $required = @(
        'Phaedra.exe', 'bin\Phaedra.exe', 'version.txt', 'SOURCE.txt',
        'COPYING', 'LICENSES.md', 'MANIFEST.sha256', 'update_config.ini',
        'preview-channel.flag', 'updater\updater.ps1',
        'share\ardour8\ardour.menus'
    )
    foreach ($name in $required) {
        if (!(Test-Path -LiteralPath (Join-Path $stage $name) -PathType Leaf)) {
            throw ('Falta un archivo obligatorio: ' + $name)
        }
    }
    if ((Get-Content -LiteralPath (Join-Path $stage 'preview-channel.flag') -TotalCount 1).Trim() -cne 'preview') {
        throw 'El ZIP no es del canal Preview.'
    }
    if ((Get-Content -LiteralPath (Join-Path $stage 'version.txt') -TotalCount 1).Trim() -cne '0.0.0') {
        throw 'Version de prueba no valida.'
    }
    $settings = @(Get-Content -LiteralPath (Join-Path $stage 'update_config.ini'))
    if ($settings -notcontains 'check_updates=false' -or $settings -contains 'check_updates=true') {
        throw 'El ZIP intenta activar el actualizador estable.'
    }
    $source = @(Get-Content -LiteralPath (Join-Path $stage 'SOURCE.txt'))
    if ($source -notcontains ('Exact commit: ' + $sha)) {
        throw 'El ZIP no corresponde al commit publicado.'
    }

    $manifest = Join-Path $stage 'MANIFEST.sha256'
    $seen = @{}
    foreach ($line in (Get-Content -LiteralPath $manifest -Encoding UTF8)) {
        if ($line -cnotmatch '^([a-f0-9]{64})  (.+)$') { throw 'Manifest SHA256 mal formado.' }
        $expected = $Matches[1].ToUpperInvariant()
        $relative = Assert-SafeRelative $Matches[2]
        if ($seen.ContainsKey($relative)) { throw 'Entrada duplicada en el manifest.' }
        $full = [IO.Path]::GetFullPath((Join-Path $stage $relative))
        if (!$full.StartsWith(($stage.TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Un archivo intenta salir de la carpeta temporal.'
        }
        if (!(Test-Path -LiteralPath $full -PathType Leaf)) {
            throw ('No se encuentra: ' + $relative)
        }
        if ((Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash -cne $expected) {
            throw ('Archivo corrupto: ' + $relative)
        }
        $seen[$relative] = $true
    }
    $allFiles = @(Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.FullName -ne $manifest })
    if ($seen.Count -ne $allFiles.Count) { throw 'El manifest no cubre todos los archivos.' }
    foreach ($file in $allFiles) {
        $relative = $file.FullName.Substring($stage.TrimEnd('\').Length + 1)
        if (!$seen.ContainsKey($relative)) { throw ('Archivo no autorizado: ' + $relative) }
    }
}

function Install-Preview($preview) {
    if (Test-PreviewRunning) {
        Write-Host 'Nueva Preview disponible. Cierra Phaedra Preview para instalarla.'
        return $false
    }
    Add-Type -AssemblyName PresentationFramework
    $answer = [System.Windows.MessageBox]::Show(
        ('Phaedra Preview tiene una version nueva.' + [Environment]::NewLine +
         '¿Descargarla e instalarla en tu carpeta de pruebas? La version estable no se tocara.'),
        'Phaedra Preview', 'YesNo', 'Question'
    )
    if ($answer -ne 'Yes') { return $false }

    New-Item -ItemType Directory -Force -Path $base | Out-Null
    $zip = Join-Path $env:TEMP ('PhaedraPreview-' + [Guid]::NewGuid().ToString('N') + '.zip')
    $stage = Join-Path $base ('stage-' + [Guid]::NewGuid().ToString('N'))
    $backup = $null
    $movedOld = $false
    try {
        Invoke-WebRequest -Uri $preview.Url -OutFile $zip -UseBasicParsing -TimeoutSec 300
        if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -cne $preview.Digest) {
            throw 'La descarga no coincide con el SHA256 publicado por GitHub.'
        }
        New-Item -ItemType Directory -Path $stage | Out-Null
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try {
            if ($archive.Entries.Count -gt 50000) { throw 'Hay demasiados archivos en el ZIP.' }
            $total = [int64]0
            foreach ($entry in $archive.Entries) {
                $total += $entry.Length
                if ($total -gt 4294967296) { throw 'ZIP demasiado grande al descomprimir.' }
                $relative = Assert-SafeRelative $entry.FullName
                $full = [IO.Path]::GetFullPath((Join-Path $stage $relative))
                if (!$full.StartsWith(($stage + '\'), [StringComparison]::OrdinalIgnoreCase)) {
                    throw 'Intento de traversal en ZIP.'
                }
                $unixMode = ($entry.ExternalAttributes -shr 16) -band 0xF000
                if ($unixMode -eq 0xA000) { throw 'ZIP con enlace simbolico no permitido.' }
            }
        } finally { $archive.Dispose() }

        Expand-Archive -LiteralPath $zip -DestinationPath $stage
        Assert-StagedPreview $stage $preview.Sha
        $test = Start-Process -FilePath (Join-Path $stage 'Phaedra.exe') -ArgumentList '--self-test' -WorkingDirectory $stage -Wait -PassThru
        if ($test.ExitCode -ne 0) { throw 'El lanzador Preview no supera la prueba de arranque.' }

        if (Test-Path -LiteralPath $root) {
            if (!(Test-Path -LiteralPath (Join-Path $root 'preview-channel.flag') -PathType Leaf)) {
                throw 'Instalacion existente sin marca Preview. No se tocara.'
            }
            $backup = Join-Path $base ('backup-' + [Guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $root -Destination $backup
            $movedOld = $true
        }
        Move-Item -LiteralPath $stage -Destination $root
        $stage = $null
        $movedOld = $false
        Write-Host ('Preview instalada: ' + $preview.Sha.Substring(0, 12))
        if ($backup) { Write-Host ('Copia de seguridad: ' + $backup) }
        return $true
    } catch {
        if ($movedOld -and $backup -and !(Test-Path -LiteralPath $root)) {
            Move-Item -LiteralPath $backup -Destination $root
        }
        throw
    } finally {
        if ($stage -and (Test-Path -LiteralPath $stage)) {
            Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $zip) {
            Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
        }
    }
}

function Invoke-Check([bool]$startApp) {
    $local = Get-InstalledSha
    $remote = $null
    try {
        $remote = Get-LatestPreview
    } catch {
        Write-Warning ('GitHub no responde: ' + $_.Exception.Message)
    }
    if ($remote -and $remote.Sha -cne $local) {
        Write-Host ('Nueva Preview publicada: ' + $remote.Sha.Substring(0, 12))
        if ($startApp) { [void](Install-Preview $remote) }
    } elseif ($remote) {
        Write-Host 'Preview actualizada.'
    } else {
        Write-Host 'No hay ninguna Preview publicada y verificable por ahora.'
    }
    if ($startApp) {
        $installed = Get-InstalledSha
        if (!$installed) { throw 'Todavia no hay Preview instalable. La estable no ha cambiado.' }
        Start-Process -FilePath (Join-Path $root 'Phaedra.exe') -ArgumentList '--no-update' -WorkingDirectory $root
    }
}

try {
    $hasLock = $mutex.WaitOne(0)
    if (!$hasLock) { throw 'Phaedra Preview Bridge ya se esta ejecutando.' }
    switch ($Mode) {
        'Check' { Invoke-Check $false }
        'Run' { Invoke-Check $true }
        'Watch' {
            Write-Host ('Vigilando versiones Preview cada ' + $PollSeconds + ' segundos. Ctrl+C para salir.')
            while ($true) {
                Invoke-Check $false
                Start-Sleep -Seconds $PollSeconds
            }
        }
    }
} catch {
    Write-Error ('Phaedra Preview Bridge: ' + $_.Exception.Message)
    exit 1
} finally {
    if ($hasLock) { $mutex.ReleaseMutex() | Out-Null }
    $mutex.Dispose()
}
