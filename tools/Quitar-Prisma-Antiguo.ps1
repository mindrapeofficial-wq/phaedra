# Ejecutar con Phaedra cerrado desde PowerShell abierto como administrador.
$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abre PowerShell como administrador para quitar el VST3 antiguo.'
}
$parent = (Resolve-Path -LiteralPath 'C:\Program Files\Common Files\VST3').Path.TrimEnd('\')
$target = Join-Path $parent 'Prisma.vst3'
if (-not (Test-Path -LiteralPath $target)) {
    Write-Host 'La copia global antigua de Prisma ya no existe.'
    return
}
$resolved = (Resolve-Path -LiteralPath $target).Path.TrimEnd('\')
if (-not $resolved.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La ruta no está dentro de la carpeta global VST3.'
}
Remove-Item -LiteralPath $resolved -Recurse -Force
Write-Host 'Copia global antigua de Prisma eliminada. Los datos compartidos de Surge XT se han conservado.'
