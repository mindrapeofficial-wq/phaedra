#Requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BundleRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The real WebView2 smoke test must run on Windows.' }
$bundle = [IO.Path]::GetFullPath($BundleRoot)
$helper = Join-Path $bundle 'bin/PhaedraSocial.exe'
if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'The packaged social host is missing.' }
$logRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$prefix = Join-Path $logRoot ("phaedra-social-ui-smoke-$PID-" + [Guid]::NewGuid().ToString('N'))
$stdout = "$prefix.stdout.log"
$stderr = "$prefix.stderr.log"
$process = $null
try {
    $process = Start-Process -FilePath $helper -ArgumentList '--ui-smoke-test' -WorkingDirectory $bundle `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    if (-not $process.WaitForExit(45000)) {
        $process.Kill($true)
        [void]$process.WaitForExit(5000)
        throw 'The WebView2 smoke test exceeded its 45-second process limit.'
    }
    # Complete redirected stream collection after the bounded process wait.
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
        throw "The real WebView2 smoke test failed with exit code $($process.ExitCode). Check the runtime and local bundle; no login was attempted."
    }
    Write-Host 'Verified real WebView2 startup, local HTML/CSS/logo, JavaScript modules and the configured login screen.'
    Write-Host 'This does not test account login, the permanent server, or audio playback/recording in the DAW.'
} finally {
    foreach ($log in @($stdout, $stderr)) {
        if (Test-Path -LiteralPath $log) {
            Get-Content -LiteralPath $log | Write-Host
            Remove-Item -LiteralPath $log -Force
        }
    }
    if ($null -ne $process) { $process.Dispose() }
}
