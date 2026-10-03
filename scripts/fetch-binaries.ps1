<#
.SYNOPSIS
  Descarga los programas externos que usa pdfreaaaader y los deja en la carpeta «resources».

.DESCRIPTION
  - LibreOffice  : Word/Excel/PowerPoint a PDF y PDF a Word/PowerPoint (~400 MB, instalación administrativa del MSI: no instala nada en el sistema)
  - Ghostscript  : Comprimir PDF y PDF a PDF/A (~40 MB)
  - Real-ESRGAN  : Ampliar imágenes con IA, necesita una GPU con Vulkan (~45 MB)
  - Modelo       : ISNet para Eliminar fondo (~170 MB)

  Después, «npm run dist» los copia dentro del instalador (extraResources).

.PARAMETER Solo
  Descarga solo lo indicado: libreoffice, ghostscript, realesrgan, modelo.

.PARAMETER Forzar
  Vuelve a descargar aunque ya estén en resources.

.EXAMPLE
  npm run fetch-binaries
  npm run fetch-binaries -- -Solo modelo,realesrgan
#>
[CmdletBinding()]
param(
  [ValidateSet('libreoffice', 'ghostscript', 'realesrgan', 'modelo')]
  [string[]]$Solo,
  [switch]$Forzar
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest es mucho más rápido sin barra de progreso

$raiz = Split-Path -Parent $PSScriptRoot
$res = Join-Path $raiz 'resources'
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'pdfreaaaader-descargas'
New-Item -ItemType Directory -Force -Path $res, $tmp | Out-Null

function Quiere([string]$nombre) { -not $Solo -or ($Solo -contains $nombre) }

function Descargar([string]$url, [string]$destino) {
  if ((Test-Path $destino) -and -not $Forzar) {
    Write-Host "  ya descargado: $(Split-Path $destino -Leaf)"
    return
  }
  Write-Host "  descargando $url"
  $parcial = "$destino.parcial"
  Invoke-WebRequest -Uri $url -OutFile $parcial -UseBasicParsing -Headers @{ 'User-Agent' = 'pdfreaaaader' }
  Move-Item -Force $parcial $destino
}

function Buscar([string]$carpeta, [string]$nombre) {
  if (-not (Test-Path $carpeta)) { return $null }
  Get-ChildItem -Path $carpeta -Recurse -Filter $nombre -File -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Tamano([string]$carpeta) {
  if (-not (Test-Path $carpeta)) { return '0 MB' }
  $bytes = (Get-ChildItem $carpeta -Recurse -File | Measure-Object Length -Sum).Sum
  '{0:N0} MB' -f ($bytes / 1MB)
}

# ───────────────────────── Ghostscript ─────────────────────────
if (Quiere 'ghostscript') {
  Write-Host '== Ghostscript'
  $dest = Join-Path $res 'ghostscript'
  if ((Buscar $dest 'gswin64c.exe') -and -not $Forzar) {
    Write-Host '  ya está en resources\ghostscript'
  } else {
    $url = $null
    $nombre = $null
    try {
      $rel = Invoke-RestMethod 'https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest' -Headers @{ 'User-Agent' = 'pdfreaaaader' }
      $asset = $rel.assets | Where-Object { $_.name -match '^gs\d+w64\.exe$' } | Select-Object -First 1
      if ($asset) { $url = $asset.browser_download_url; $nombre = $asset.name }
    } catch {
      Write-Host '  (no se pudo consultar GitHub; se usa una versión conocida)'
    }
    if (-not $url) {
      $nombre = 'gs10040w64.exe'
      $url = "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/gs10040/$nombre"
    }
    $instalador = Join-Path $tmp $nombre
    Descargar $url $instalador
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    # Instalación silenciosa (NSIS): /D debe ser el último argumento y sin comillas.
    # No se usa «Start-Process -Wait»: espera también a los procesos hijos del instalador y puede quedarse colgado.
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $p = Start-Process -FilePath $instalador -ArgumentList '/S', "/D=$dest" -PassThru
    $limite = (Get-Date).AddMinutes(8)
    while ((Get-Date) -lt $limite -and -not (Buscar $dest 'gswin64c.exe')) { Start-Sleep -Seconds 3 }
    if (-not $p.WaitForExit(30000)) {
      Write-Host '  el instalador sigue abierto; se cierra (los archivos ya están copiados)'
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
    if (-not (Buscar $dest 'gswin64c.exe')) { throw 'La instalación de Ghostscript no creó gswin64c.exe en resources\ghostscript.' }
    Write-Host "  listo ($(Tamano $dest))"
  }
}

# ───────────────────────── LibreOffice ─────────────────────────
if (Quiere 'libreoffice') {
  Write-Host '== LibreOffice'
  $dest = Join-Path $res 'libreoffice'
  if ((Buscar $dest 'soffice.exe') -and -not $Forzar) {
    Write-Host '  ya está en resources\libreoffice'
  } else {
    $version = $null
    try {
      $indice = Invoke-WebRequest 'https://download.documentfoundation.org/libreoffice/stable/' -UseBasicParsing
      $version = $indice.Links |
        Where-Object { $_.href -match '^\d+\.\d+\.\d+/?$' } |
        ForEach-Object { $_.href.TrimEnd('/') } |
        Sort-Object { [version]$_ } -Descending |
        Select-Object -First 1
    } catch {
      Write-Host '  (no se pudo consultar la última versión; se usa una conocida)'
    }
    if (-not $version) { $version = '24.8.4' }
    $nombre = "LibreOffice_${version}_Win_x86-64.msi"
    $msi = Join-Path $tmp $nombre
    Descargar "https://download.documentfoundation.org/libreoffice/stable/$version/win/x86_64/$nombre" $msi
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Write-Host '  extrayendo (instalación administrativa, no instala nada en el sistema)…'
    $p = Start-Process msiexec.exe -ArgumentList '/a', "`"$msi`"", '/qn', "TARGETDIR=`"$dest`"" -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "msiexec terminó con el código $($p.ExitCode)." }
    if (-not (Buscar $dest 'soffice.exe')) { throw 'No se encontró soffice.exe tras extraer LibreOffice.' }
    Write-Host "  listo ($(Tamano $dest))"
  }
}

# ───────────────────────── Real-ESRGAN ─────────────────────────
if (Quiere 'realesrgan') {
  Write-Host '== Real-ESRGAN (ncnn-vulkan)'
  $dest = Join-Path $res 'realesrgan'
  if ((Buscar $dest 'realesrgan-ncnn-vulkan.exe') -and -not $Forzar) {
    Write-Host '  ya está en resources\realesrgan'
  } else {
    $zip = Join-Path $tmp 'realesrgan-ncnn-vulkan-windows.zip'
    Descargar 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip' $zip
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Expand-Archive -Path $zip -DestinationPath $dest -Force
    if (-not (Buscar $dest 'realesrgan-ncnn-vulkan.exe')) { throw 'No se encontró realesrgan-ncnn-vulkan.exe tras descomprimir.' }
    Write-Host "  listo ($(Tamano $dest))"
  }
}

# ───────────────────────── Modelo para quitar fondos ─────────────────────────
if (Quiere 'modelo') {
  Write-Host '== Modelo ISNet (quitar fondos)'
  $dest = Join-Path $res 'models'
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  $archivo = Join-Path $dest 'isnet-general-use.onnx'
  if ((Test-Path $archivo) -and -not $Forzar) {
    Write-Host '  ya está en resources\models'
  } else {
    Descargar 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx' $archivo
    Write-Host "  listo ($(Tamano $dest))"
  }
}

Write-Host ''
Write-Host "Contenido de resources: $(Tamano $res)"
Get-ChildItem $res -Directory | ForEach-Object { Write-Host ("  {0,-14} {1}" -f $_.Name, (Tamano $_.FullName)) }
