# Shared by the downloader and installer. Keep compatible with Windows PowerShell 5.1.
function Test-PhaedraDevelopmentBuild {
    param([string]$PhaedraDir)
    return ((Test-Path -LiteralPath (Join-Path $PhaedraDir '.git')) -or
        (Test-Path -LiteralPath (Join-Path $PhaedraDir 'development-build.txt')))
}

function Remove-PhaedraStagedDownload {
    param([string]$ZipFile)
    $file = [IO.Path]::GetFullPath($ZipFile)
    $stage = [IO.Path]::GetDirectoryName($file)
    $cache = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'PhaedraUpdater')).TrimEnd('\')
    if ([IO.Path]::GetDirectoryName($stage) -ine $cache -or
        [IO.Path]::GetFileName($stage) -notmatch '^[a-f0-9]{32}$' -or
        [IO.Path]::GetFileName($file) -notmatch '^Phaedra-v[0-9.]+\.zip$') { return }
    foreach ($path in @($cache,$stage,$file)) {
        if ((Test-Path -LiteralPath $path) -and
            ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { return }
    }
    if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    # Only remove the empty directory; never recurse into any additional files.
    try { [IO.Directory]::Delete($stage, $false) } catch [IO.IOException] { } catch [UnauthorizedAccessException] { }
}

function Assert-PhaedraReleaseAsset {
    param($Asset, [string]$Tag)
    if ($Tag -notmatch '^v?\d+\.\d+\.\d+(\.\d+)?$') { throw 'Version de actualizacion no valida.' }
    $expectedName = 'Phaedra-v{0}.zip' -f $Tag.TrimStart('v')
    if ([string]$Asset.name -cne $expectedName) { throw 'El paquete no corresponde a esta version de Phaedra Pro.' }
    if ([string]$Asset.digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { throw 'El paquete no tiene SHA-256 publicado.' }
    $size = 0L
    if (-not [long]::TryParse([string]$Asset.size, [ref]$size) -or $size -le 0 -or $size -gt 1073741824) {
        throw 'El tamano publicado no es valido (limite: 1 GiB).'
    }
    $expectedUrl = 'https://github.com/mindrapeofficial-wq/phaedra/releases/download/{0}/{1}' -f $Tag,$expectedName
    if ([string]$Asset.browser_download_url -cne $expectedUrl) { throw 'El paquete no pertenece al canal de Phaedra Pro.' }
}

function Assert-PhaedraDownload {
    param([string]$Path, [long]$ExpectedSize, [string]$ExpectedSha256)
    if ($ExpectedSize -le 0 -or $ExpectedSize -gt 1073741824 -or $ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$') {
        throw 'Faltan los datos de verificacion del paquete.'
    }
    $file = Get-Item -LiteralPath $Path -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Length -ne $ExpectedSize) { throw 'La descarga esta incompleta o su tamano no coincide.' }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ine $ExpectedSha256) {
        throw 'El SHA-256 no coincide. No se instalara la descarga.'
    }
}

function Assert-PhaedraClosed {
    param([string]$PhaedraDir)
    $root = [IO.Path]::GetFullPath($PhaedraDir).TrimEnd('\') + '\'
    foreach ($process in @(Get-Process -Name Phaedra -ErrorAction SilentlyContinue)) {
        # An inaccessible process is not evidence that it is safe to overwrite binaries.
        $path = $process.Path
        if (-not $path -or $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Guarda la sesion y cierra Phaedra antes de instalar la actualizacion.'
        }
    }
}
