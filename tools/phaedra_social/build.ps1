#Requires -Version 7.2
[CmdletBinding()]
param(
    [string]$ClientDist = 'social/dist',
    [string]$OutputDir = 'artifacts/phaedra-social'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sdkVersion = '1.0.4314.35'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$buildRoot = Join-Path $repoRoot 'build/phaedra-social'
function Resolve-RepoPath([string]$Value) {
    if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
    return [IO.Path]::GetFullPath((Join-Path $repoRoot $Value))
}
$clientPath = Resolve-RepoPath $ClientDist
$outputPath = Resolve-RepoPath $OutputDir
$sdkDir = Join-Path $buildRoot "sdk-$sdkVersion"
$package = Join-Path $buildRoot "microsoft.web.webview2.$sdkVersion.nupkg"
$stage = Join-Path $buildRoot 'bundle-stage'

if (-not $IsWindows) { throw 'Build this helper on Windows with Visual Studio 2022, CMake and the .NET SDK.' }
if ($outputPath -eq $repoRoot -or $repoRoot.StartsWith($outputPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputDir must be a dedicated generated-artifact directory.'
}
foreach ($tool in @('cmake', 'dotnet')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Missing build tool: $tool" }
}
foreach ($name in @('index.html', 'config.json', 'style.css', 'src/app.js', 'src/stoat-client.js', 'src/view-model.js', 'assets/mark.svg')) {
    $file = Join-Path $clientPath $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -eq 0) {
        throw "Incomplete client build: $name. Build social/dist first."
    }
}
$config = Get-Content -LiteralPath (Join-Path $clientPath 'config.json') -Raw -Encoding utf8 | ConvertFrom-Json
if ($config.schemaVersion -ne 1) { throw 'The social client requires config schemaVersion 1.' }
foreach ($item in Get-ChildItem -LiteralPath $clientPath -Recurse -Force) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Client builds cannot contain junctions or symbolic links.' }
}

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $package -PathType Leaf)) {
    $packageUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg"
    Invoke-WebRequest -Uri $packageUrl -OutFile "$package.partial" -MaximumRedirection 3
    Move-Item -LiteralPath "$package.partial" -Destination $package -Force
}
# Verify the signed NuGet archive before extracting headers or loader binaries.
& dotnet nuget verify $package --all
if ($LASTEXITCODE -ne 0) { throw 'WebView2 SDK package signature verification failed.' }
if (Test-Path -LiteralPath $sdkDir) { Remove-Item -LiteralPath $sdkDir -Recurse -Force }
New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory($package, $sdkDir)

$loader = Join-Path $sdkDir 'build/native/x64/WebView2Loader.dll'
if (-not (Test-Path -LiteralPath $loader -PathType Leaf)) {
    $loader = Join-Path $sdkDir 'runtimes/win-x64/native/WebView2Loader.dll'
}
if (-not (Test-Path -LiteralPath $loader -PathType Leaf)) { throw 'Pinned SDK has no x64 WebView2Loader.dll.' }
$signature = Get-AuthenticodeSignature -LiteralPath $loader
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'The WebView2 loader must have a valid Microsoft Authenticode signature.'
}

$cmakeBuild = Join-Path $buildRoot 'cmake'
& cmake -S $PSScriptRoot -B $cmakeBuild -G 'Visual Studio 17 2022' -A x64 "-DWEBVIEW2_SDK_DIR=$sdkDir"
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed.' }
& cmake --build $cmakeBuild --config Release --parallel 2
if ($LASTEXITCODE -ne 0) { throw 'PhaedraSocial compilation failed.' }

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$stageBin = Join-Path $stage 'bin'
$stageAssets = Join-Path $stage 'share/phaedra-social'
$sdkLicenses = Join-Path $stage 'licenses/webview2'
$hostLicenses = Join-Path $stage 'licenses/phaedra-social'
New-Item -ItemType Directory -Path $stageBin, $stageAssets, $sdkLicenses, $hostLicenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $cmakeBuild 'Release/PhaedraSocial.exe') -Destination $stageBin
Copy-Item -LiteralPath $loader -Destination $stageBin
Get-ChildItem -LiteralPath $clientPath -Force | Copy-Item -Destination $stageAssets -Recurse
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE') -Destination (Join-Path $hostLicenses 'LICENSE.txt')
$licenseFiles = @(Get-ChildItem -LiteralPath $sdkDir -File | Where-Object { $_.Name -match '^(LICENSE|ThirdPartyNotices)(\..*)?$' })
if ($licenseFiles.Count -eq 0) { throw 'The SDK license text is missing; do not distribute an incomplete bundle.' }
$licenseFiles | Copy-Item -Destination $sdkLicenses

$selfTest = Start-Process -FilePath (Join-Path $stageBin 'PhaedraSocial.exe') -ArgumentList '--self-test' -WorkingDirectory $stage -PassThru -Wait
if ($selfTest.ExitCode -ne 0) { throw "Native bundle self-test failed: $($selfTest.ExitCode)" }

$fileHashes = [ordered]@{}
foreach ($file in Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object FullName) {
    $relative = [IO.Path]::GetRelativePath($stage, $file.FullName).Replace('\', '/')
    $fileHashes[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest = [ordered]@{
    schemaVersion = 1
    platform = 'win-x64'
    host = 'bin/PhaedraSocial.exe'
    loader = 'bin/WebView2Loader.dll'
    assets = 'share/phaedra-social'
    virtualOrigin = 'https://phaedra-social.invalid'
    webview2Sdk = $sdkVersion
    sdkPackageSha256 = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
    files = $fileHashes
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stage 'social-bundle.json') -Encoding utf8NoBOM

if (Test-Path -LiteralPath $outputPath) {
    $knownOutput = Test-Path -LiteralPath (Join-Path $outputPath 'social-bundle.json') -PathType Leaf
    if (-not $knownOutput -and @(Get-ChildItem -LiteralPath $outputPath -Force).Count -ne 0) {
        throw 'OutputDir is not empty and has no previous social-bundle.json. Choose a dedicated output directory.'
    }
    Remove-Item -LiteralPath $outputPath -Recurse -Force
}
New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($outputPath)) -Force | Out-Null
Move-Item -LiteralPath $stage -Destination $outputPath
Write-Host "Phaedra Social bundle: $outputPath"
Write-Host 'Verified: native assets/config self-test. WebView2 startup and two-user chat still require runtime/integration checks.'
