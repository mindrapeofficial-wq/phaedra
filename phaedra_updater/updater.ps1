param(
    [string]$PhaedraDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$configFile = Join-Path $PhaedraDir 'update_config.ini'
$versionFile = Join-Path $PhaedraDir 'version.txt'

if (-not (Test-Path $configFile)) { exit 0 }
if (-not (Test-Path $versionFile)) { exit 0 }

$config = @{}
Get-Content $configFile | ForEach-Object {
    if ($_ -match '^(\w+)=(.+)$') {
        $config[$Matches[1]] = $Matches[2].Trim()
    }
}

if ($config['check_updates'] -ne 'true') { exit 0 }

$repo = $config['github_repo']
if (-not $repo) { exit 0 }

$localVersion = (Get-Content $versionFile -TotalCount 1).Trim()

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName PresentationFramework

function Show-Toast($msg) {
    [System.Windows.MessageBox]::Show($msg, 'Phaedra Updater', 'OK', 'Information') | Out-Null
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $apiUrl = "https://api.github.com/repos/$repo/releases/latest"
    $headers = @{ 'User-Agent' = 'Phaedra-Updater/1.0' }
    $response = Invoke-RestMethod -Uri $apiUrl -Headers $headers -TimeoutSec 10
} catch {
    exit 0
}

$remoteVersion = $response.tag_name -replace '^v', ''

function Compare-Versions($local, $remote) {
    $lParts = $local.Split('.') | ForEach-Object { [int]$_ }
    $rParts = $remote.Split('.') | ForEach-Object { [int]$_ }
    for ($i = 0; $i -lt [Math]::Max($lParts.Count, $rParts.Count); $i++) {
        $l = if ($i -lt $lParts.Count) { $lParts[$i] } else { 0 }
        $r = if ($i -lt $rParts.Count) { $rParts[$i] } else { 0 }
        if ($r -gt $l) { return $true }
        if ($r -lt $l) { return $false }
    }
    return $false
}

if (-not (Compare-Versions $localVersion $remoteVersion)) {
    exit 0
}

$result = [System.Windows.MessageBox]::Show(
    "Hay una nueva version de Phaedra disponible: v$remoteVersion (actual: v$localVersion).`n`nDeseas actualizar ahora?",
    'Phaedra - Actualizacion disponible',
    'YesNo',
    'Question'
)

if ($result -ne 'Yes') { exit 0 }

$asset = $response.assets | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
if (-not $asset) {
    Show-Toast "No se encontro el archivo de actualizacion en la release."
    exit 1
}

$downloadUrl = $asset.browser_download_url
$tempZip = Join-Path $env:TEMP "phaedra_update_$remoteVersion.zip"
$tempExtract = Join-Path $env:TEMP "phaedra_update_$remoteVersion"

$progressForm = New-Object System.Windows.Forms.Form
$progressForm.Text = 'Phaedra - Actualizando...'
$progressForm.Size = New-Object System.Drawing.Size(420, 150)
$progressForm.StartPosition = 'CenterScreen'
$progressForm.FormBorderStyle = 'FixedDialog'
$progressForm.MaximizeBox = $false
$progressForm.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = "Descargando v$remoteVersion..."
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(360, 25)
$progressForm.Controls.Add($label)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(20, 55)
$progressBar.Size = New-Object System.Drawing.Size(360, 30)
$progressBar.Style = 'Marquee'
$progressForm.Controls.Add($progressBar)

$progressForm.Show()
$progressForm.Refresh()

try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -Headers $headers

    $label.Text = 'Instalando actualizacion...'
    $progressForm.Refresh()

    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    $extractedItems = Get-ChildItem $tempExtract
    $sourceDir = $tempExtract
    if ($extractedItems.Count -eq 1 -and $extractedItems[0].PSIsContainer) {
        $sourceDir = $extractedItems[0].FullName
    }

    $label.Text = 'Copiando archivos...'
    $progressForm.Refresh()

    Get-ChildItem $sourceDir | ForEach-Object {
        $dest = Join-Path $PhaedraDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item $_.FullName $dest -Recurse -Force
        } else {
            Copy-Item $_.FullName $dest -Force
        }
    }

    Set-Content -Path $versionFile -Value $remoteVersion -Encoding utf8

    $progressForm.Close()

    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

    Show-Toast "Phaedra actualizado a v$remoteVersion. Se reiniciara ahora."

    $bat = Join-Path $PhaedraDir 'Phaedra.bat'
    Start-Process -FilePath 'cmd.exe' -ArgumentList "/c `"$bat`"" -WorkingDirectory $PhaedraDir
    exit 0

} catch {
    $progressForm.Close()
    Show-Toast "Error al actualizar: $($_.Exception.Message)"
    exit 1
}
