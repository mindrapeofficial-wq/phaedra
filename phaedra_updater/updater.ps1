param([string]$PhaedraDir, [int]$LauncherPid, [switch]$Manual)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'update-policy.ps1')
. (Join-Path $PSScriptRoot 'download-package.ps1')
if (Test-PhaedraDevelopmentBuild $PhaedraDir) {
    if ($Manual) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show('Esta es una compilacion local de desarrollo. Las actualizaciones automaticas no sustituyen esta version.', 'Phaedra Pro') | Out-Null
    }
    exit 0
}
$configFile = Join-Path $PhaedraDir 'update_config.ini'
if (-not $Manual -and (Test-Path -LiteralPath $configFile) -and
    (Get-Content -LiteralPath $configFile | Where-Object { $_ -match '^\s*check_updates\s*=\s*false\s*$' })) { exit 0 }
$versionFile = Join-Path $PhaedraDir 'version.txt'
if (-not (Test-Path -LiteralPath $versionFile)) { exit 0 }
try {
    $local = [version]((Get-Content -LiteralPath $versionFile -TotalCount 1).Trim().TrimStart('v'))
    $headers = @{ 'User-Agent' = 'Phaedra-Updater'; 'Accept' = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/mindrapeofficial-wq/phaedra/releases/latest' -Headers $headers -TimeoutSec 10
    $remote = [version]([string]$release.tag_name).TrimStart('v')
    if ($remote -le $local) { exit 0 }
    $asset = @($release.assets | Where-Object { $_.name -match '^Phaedra-v.*\.zip$' }) | Select-Object -First 1
    if (-not $asset) { exit 0 }
    Assert-PhaedraReleaseAsset -Asset $asset -Tag ([string]$release.tag_name)
} catch { exit 0 }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$notes = ([string]$release.body).Trim()
if ([string]::IsNullOrWhiteSpace($notes)) { $notes = 'Esta version no incluye una lista de cambios.' }
$dialog = New-Object System.Windows.Forms.Form
$dialog.Text = 'Actualizacion de Phaedra'
$dialog.Size = New-Object System.Drawing.Size(560, 410)
$dialog.MinimumSize = New-Object System.Drawing.Size(460, 330)
$dialog.StartPosition = 'CenterScreen'
$dialog.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$heading = New-Object System.Windows.Forms.Label
$heading.Text = "Phaedra $remote esta disponible (version instalada: $local)"
$heading.AutoSize = $true
$heading.Location = New-Object System.Drawing.Point(18, 17)
$dialog.Controls.Add($heading)
$notesLabel = New-Object System.Windows.Forms.Label
$notesLabel.Text = 'Novedades de esta version:'
$notesLabel.AutoSize = $true
$notesLabel.Location = New-Object System.Drawing.Point(18, 47)
$dialog.Controls.Add($notesLabel)
$notesBox = New-Object System.Windows.Forms.TextBox
$notesBox.Multiline = $true
$notesBox.ReadOnly = $true
$notesBox.ScrollBars = 'Vertical'
$notesBox.WordWrap = $true
$notesBox.Text = $notes
$notesBox.Location = New-Object System.Drawing.Point(18, 72)
$notesBox.Size = New-Object System.Drawing.Size(508, 246)
$notesBox.Anchor = 'Top, Bottom, Left, Right'
$dialog.Controls.Add($notesBox)
$installButton = New-Object System.Windows.Forms.Button
$installButton.Text = 'Descargar'
$installButton.Size = New-Object System.Drawing.Size(145, 30)
$installButton.Location = New-Object System.Drawing.Point(381, 330)
$installButton.Anchor = 'Bottom, Right'
$installButton.DialogResult = [System.Windows.Forms.DialogResult]::Yes
$dialog.Controls.Add($installButton)
$laterButton = New-Object System.Windows.Forms.Button
$laterButton.Text = 'Mas tarde'
$laterButton.Size = New-Object System.Drawing.Size(100, 30)
$laterButton.Location = New-Object System.Drawing.Point(270, 330)
$laterButton.Anchor = 'Bottom, Right'
$laterButton.DialogResult = [System.Windows.Forms.DialogResult]::No
$dialog.Controls.Add($laterButton)
$dialog.AcceptButton = $installButton
$dialog.CancelButton = $laterButton
$answer = $dialog.ShowDialog()
$dialog.Dispose()
if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
$stage = Join-Path (Join-Path $env:LOCALAPPDATA 'PhaedraUpdater') ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$zipFile = Join-Path $stage $asset.name
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Actualizando Phaedra'
$form.Size = New-Object System.Drawing.Size(440, 130)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$label = New-Object System.Windows.Forms.Label
$label.Text = "Descargando Phaedra $remote..."
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(18, 16)
$form.Controls.Add($label)
$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(18, 44)
$bar.Size = New-Object System.Drawing.Size(390, 22)
$bar.Style = 'Marquee'
$form.Controls.Add($bar)
$form.Show()
$handedOff = $false
try {
    Receive-PhaedraPackage $asset.browser_download_url $zipFile $asset.size {
        param($received, $expected)
        [System.Windows.Forms.Application]::DoEvents()
        if ($form.IsDisposed -or -not $form.Visible) { throw 'Descarga cancelada.' }
        $bar.Style = 'Continuous'
        $bar.Value = [Math]::Min(100, [int](100.0 * $received / $expected))
    }
    if (-not (Test-Path -LiteralPath $zipFile)) { throw 'La descarga no se completo.' }
    $digest = ([string]$asset.digest).Substring(7)
    Assert-PhaedraDownload -Path $zipFile -ExpectedSize $asset.size -ExpectedSha256 $digest
    $form.Close()
    $confirm = [System.Windows.Forms.MessageBox]::Show(
        'Descarga verificada. La instalacion esperara a que cierres Phaedra normalmente (hasta una hora). Guarda tus sesiones antes de cerrar. Preparar la instalacion?',
        'Phaedra', 'YesNo', 'Question', 'Button2')
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) { exit 0 }
    $helper = Join-Path $PhaedraDir 'updater\install-update.ps1'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -ZipFile "{1}" -PhaedraDir "{2}" -LauncherPid {3} -ExpectedSize {4} -ExpectedSha256 {5}' -f $helper,$zipFile,$PhaedraDir,$LauncherPid,$asset.size,$digest
    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden | Out-Null
    $handedOff = $true
    exit 2
} catch {
    $form.Close()
    [System.Windows.Forms.MessageBox]::Show("No se pudo actualizar Phaedra: $($_.Exception.Message)", 'Phaedra', 'OK', 'Error') | Out-Null
    exit 0
} finally {
    $form.Dispose()
    if (-not $handedOff) { Remove-PhaedraStagedDownload $zipFile }
}
