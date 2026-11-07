$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-policy.ps1')
. (Join-Path $PSScriptRoot 'install-package.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('phaedra-install-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$script:checks = 0
function Check($Value, $Message) { if (-not $Value) { throw $Message }; $script:checks++ }
function Make-Package($Path, $Entries) {
    $zip = [IO.Compression.ZipFile]::Open($Path, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($name in $Entries.Keys) {
            $entry = $zip.CreateEntry($name)
            $writer = [IO.StreamWriter]::new($entry.Open())
            try { $writer.Write($Entries[$name]) } finally { $writer.Dispose() }
        }
    } finally { $zip.Dispose() }
}
function Install-Test($Zip, $Target) {
    Install-PhaedraPackage $Zip $Target (Get-Item -LiteralPath $Zip).Length (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
}
try {
    $app = Join-Path $testRoot 'app'
    New-Item -ItemType Directory -Path (Join-Path $app 'bin') | Out-Null
    [IO.File]::WriteAllText((Join-Path $app 'Phaedra.exe'), 'old-launcher')
    [IO.File]::WriteAllText((Join-Path $app 'bin\Phaedra.exe'), 'old-engine')
    [IO.File]::WriteAllText((Join-Path $app 'version.txt'), '1.0.5')
    [IO.File]::WriteAllText((Join-Path $app 'recording.wav'), 'user-audio')
    [IO.File]::WriteAllText((Join-Path $app 'session.ardour'), 'user-session')
    [IO.File]::WriteAllText((Join-Path $app 'update_config.ini'), 'check_updates=false')
    $valid = [ordered]@{'Phaedra.exe'='new-launcher';'bin/Phaedra.exe'='new-engine';'version.txt'='1.0.6';'update_config.ini'='check_updates=true';'bin/Pulse/theme.txt'='new-theme'}
    $zip = Join-Path $testRoot 'valid.zip'
    Make-Package $zip $valid
    $backup = Install-Test $zip $app
    Check ((Get-Content -LiteralPath (Join-Path $app 'bin\Phaedra.exe') -Raw) -eq 'new-engine') 'Engine not updated'
    Check ((Get-Content -LiteralPath (Join-Path $backup 'files\bin\Phaedra.exe') -Raw) -eq 'old-engine') 'Backup not preserved'
    Check ((Get-Content -LiteralPath (Join-Path $app 'recording.wav') -Raw) -eq 'user-audio') 'Audio modified'
    Check ((Get-Content -LiteralPath (Join-Path $app 'session.ardour') -Raw) -eq 'user-session') 'Session modified'
    Check ((Get-Content -LiteralPath (Join-Path $app 'update_config.ini') -Raw) -eq 'check_updates=false') 'Settings modified'
    Check ((Get-Content -LiteralPath (Join-Path $backup 'transaction.json') -Raw | ConvertFrom-Json).State -eq 'complete') 'No completion journal'
    foreach ($badName in @('../outside.txt','bin/../../outside.txt','/absolute.txt','bin/Phaedra.exe:stream','user-session.ardour','bin/../Phaedra.exe','bin./file.txt')) {
        $bad = Join-Path $testRoot ([guid]::NewGuid().ToString('N') + '.zip')
        Make-Package $bad ([ordered]@{'Phaedra.exe'='bad';'bin/Phaedra.exe'='bad';'version.txt'='2.0.0';$badName='bad'})
        $rejected = $false
        try { Install-Test $bad $app | Out-Null } catch { $rejected = $true }
        Check $rejected "Unsafe ZIP accepted: $badName"
        Check ((Get-Content -LiteralPath (Join-Path $app 'bin\Phaedra.exe') -Raw) -eq 'new-engine') 'Rejected ZIP changed installed app'
    }
    $missing = Join-Path $testRoot 'missing.zip'
    Make-Package $missing ([ordered]@{'Phaedra.exe'='bad';'version.txt'='2.0.0'})
    $rejected = $false
    try { Install-Test $missing $app | Out-Null } catch { $rejected = $true }
    Check $rejected 'Incomplete package accepted'
    $second = Join-Path $testRoot 'second.zip'
    Make-Package $second ([ordered]@{'Phaedra.exe'='must-roll-back';'bin/Phaedra.exe'='must-not-stick';'version.txt'='1.0.7'})
    # Inject a write failure after the first replacement, leaving backup copies unaffected.
    function Copy-Item {
        param($LiteralPath, $Destination, [switch]$Force)
        if ($LiteralPath -like '*phaedra-pro-update-*' -and $LiteralPath -like '*bin*Phaedra.exe') { throw 'Simulated disk write failure' }
        Microsoft.PowerShell.Management\Copy-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
    }
    $rejected = $false
    try { Install-Test $second $app | Out-Null } catch { $rejected = $true }
    Check $rejected 'Injected write failure was ignored'
    Check ((Get-Content -LiteralPath (Join-Path $app 'Phaedra.exe') -Raw) -eq 'new-launcher') 'Rollback did not restore launcher'
    Check ((Get-Content -LiteralPath (Join-Path $app 'bin\Phaedra.exe') -Raw) -eq 'new-engine') 'Rollback did not restore engine'
    $journals = @(Get-ChildItem -LiteralPath $testRoot -Directory -Filter 'Phaedra-update-backup-*' | ForEach-Object { Get-Content -LiteralPath (Join-Path $_.FullName 'transaction.json') -Raw | ConvertFrom-Json })
    Check (@($journals | Where-Object State -eq 'rolled-back').Count -eq 1) 'Rollback not recorded'
    Set-Content -LiteralPath (Join-Path $app 'development-build.txt') -Value 'local build'
    $rejected = $false
    try { Install-Test $second $app | Out-Null } catch { $rejected = $true }
    Check $rejected 'Development package was overwritten'
    Check ((Get-Content -LiteralPath (Join-Path $app 'Phaedra.exe') -Raw) -eq 'new-launcher') 'Development package changed'
    Write-Output "$script:checks installation checks passed; synthetic files only."
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved) -match '^phaedra-install-test-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
