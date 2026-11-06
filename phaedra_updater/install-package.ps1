# Portable installation with a persistent backup and rollback on write failures.
function Install-PhaedraPackage {
    param([string]$ZipFile, [string]$PhaedraDir, [long]$ExpectedSize, [string]$ExpectedSha256)
    Assert-PhaedraClosed $PhaedraDir
    Assert-PhaedraDownload $ZipFile $ExpectedSize $ExpectedSha256
    $root = [IO.Path]::GetFullPath($PhaedraDir).TrimEnd('\')
    if (-not (Test-Path -LiteralPath (Join-Path $root 'bin\Phaedra.exe'))) { throw 'El destino no es una instalacion portable de Phaedra Pro.' }
    if (Test-PhaedraDevelopmentBuild $root) { throw 'No se puede actualizar una carpeta de desarrollo.' }
    $parent = [IO.Directory]::GetParent($root).FullName
    $backup = Join-Path $parent ('Phaedra-update-backup-' + [guid]::NewGuid().ToString('N'))
    $stage = Join-Path ([IO.Path]::GetTempPath()) ('phaedra-pro-update-' + [guid]::NewGuid().ToString('N'))
    $files = [Collections.Generic.List[string]]::new()
    $touched = [Collections.Generic.List[string]]::new()
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    $archive = $null
    $journal = [ordered]@{ Target=$root; State='prepared'; Files=@(); Touched=@() }
    function Assert-NoLinks([string]$Path) {
        $cursor = $Path
        while ($cursor) {
            if (Test-Path -LiteralPath $cursor) {
                if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Ruta enlazada no permitida: $cursor" }
            }
            $next = [IO.Directory]::GetParent($cursor)
            $cursor = if ($next) { $next.FullName } else { $null }
        }
    }
    Assert-NoLinks $root
    New-Item -ItemType Directory -Path $stage | Out-Null
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        Add-Type -AssemblyName System.IO.Compression
        $archive = [IO.Compression.ZipFile]::OpenRead($ZipFile)
        if ($archive.Entries.Count -gt 50000) { throw 'El paquete contiene demasiados archivos.' }
        $total = 0L
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\','/').TrimEnd('/')
            if (-not $name -or $name.StartsWith('/') -or $name.Contains(':') -or
                @($name.Split('/') | Where-Object { $_ -in @('..','.') -or $_ -match '[. ]$' -or -not $_ }).Count) {
                throw 'Ruta no valida dentro del paquete.'
            }
            $top = $name.Split('/')[0]
            if ($top -notin @('bin','lib','share','etc','updater','licenses','Phaedra.exe','Phaedra.bat','version.txt','update_config.ini','COPYING','PULSE-README.md','PULSE-LICENSE-GPL-3.0.txt','Pulse-modified-source.zip')) {
                throw "Archivo ajeno a la aplicacion: $name"
            }
            if (($entry.ExternalAttributes -band 0xF0000000L) -eq 0xA0000000L) { throw 'No se permiten enlaces en el ZIP.' }
            if (-not $seen.Add($name)) { throw 'El paquete contiene rutas duplicadas.' }
            $total += $entry.Length
            if ($total -gt 4294967296L) { throw 'El paquete expandido supera 4 GiB.' }
            if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { continue }
            # Configuration belongs to the user, even if the bundle has defaults.
            if ($name -eq 'update_config.ini') { continue }
            $destination = [IO.Path]::GetFullPath((Join-Path $root $name))
            if (-not $destination.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera de la instalacion.' }
            Assert-NoLinks $destination
            $extracted = Join-Path $stage $name
            New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($extracted)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $extracted, $false)
            $files.Add($name)
        }
        $archive.Dispose(); $archive = $null
        foreach ($required in @('Phaedra.exe','bin/Phaedra.exe','version.txt')) {
            if (-not $files.Contains($required) -or (Get-Item -LiteralPath (Join-Path $stage $required)).Length -eq 0) { throw "Falta $required en el paquete." }
        }
        # Back up every replaced file before changing the first installed file.
        New-Item -ItemType Directory -Path $backup | Out-Null
        foreach ($name in $files) {
            $destination = Join-Path $root $name
            if (Test-Path -LiteralPath $destination) {
                if ((Get-Item -LiteralPath $destination).PSIsContainer) { throw 'Un archivo del paquete coincide con una carpeta existente.' }
                $saved = Join-Path $backup ('files/' + $name)
                New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($saved)) | Out-Null
                Copy-Item -LiteralPath $destination -Destination $saved
            }
        }
        $journal.Files = @($files.ToArray())
        $journal.State = 'installing'
        $journalPath = Join-Path $backup 'transaction.json'
        $journal | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $journalPath -Encoding UTF8
        try {
            foreach ($name in $files) {
                $destination = Join-Path $root $name
                Assert-NoLinks $destination
                New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destination)) | Out-Null
                $touched.Add($name)
                $journal.Touched = @($touched.ToArray())
                $journal | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $journalPath -Encoding UTF8
                Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $destination -Force
            }
            $journal.State = 'complete'
        } catch {
            $failure = $_
            for ($index=$touched.Count-1; $index -ge 0; $index--) {
                $name = $touched[$index]
                $destination = Join-Path $root $name
                Assert-NoLinks $destination
                $saved = Join-Path $backup ('files/' + $name)
                if (Test-Path -LiteralPath $saved) { Copy-Item -LiteralPath $saved -Destination $destination -Force }
                elseif (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
            }
            $journal.State = 'rolled-back'
            throw $failure
        } finally {
            $journal | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $journalPath -Encoding UTF8
        }
        return $backup
    } finally {
        if ($archive) { $archive.Dispose() }
        $resolved = [IO.Path]::GetFullPath($stage)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
            [IO.Path]::GetFileName($resolved) -match '^phaedra-pro-update-[a-f0-9]{32}$') {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
