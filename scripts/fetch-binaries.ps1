<#
.SYNOPSIS
  Descarga los programas externos que usa pdfreaaaader y los deja en la carpeta «resources».

.DESCRIPTION
  - Ghostscript  : Comprimir PDF y PDF a PDF/A (~40 MB)
  - Real-ESRGAN  : Ampliar imágenes con IA, necesita una GPU con Vulkan (~45 MB)
  - Modelo       : ISNet para Eliminar fondo (~170 MB)

  Después, «npm run dist» los copia dentro del instalador (extraResources).

.PARAMETER Solo
  Descarga solo lo indicado: ghostscript, realesrgan, modelo.

.PARAMETER Forzar
  Vuelve a descargar aunque ya estén en resources.

.EXAMPLE
  npm run fetch-binaries
  npm run fetch-binaries -- -Solo modelo,realesrgan
#>
[CmdletBinding()]
param(
  [ValidateSet('ghostscript', 'realesrgan', 'modelo')]
  [string[]]$Solo,
  [switch]$Forzar
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest es mucho más rápido sin barra de progreso

$raiz = Split-Path -Parent $PSScriptRoot
$res = Join-Path $raiz 'resources'
$tmp = if ($env:PDFREAAAADER_DESCARGAS) { $env:PDFREAAAADER_DESCARGAS } else { Join-Path ([IO.Path]::GetTempPath()) 'pdfreaaaader-descargas' }
New-Item -ItemType Directory -Force -Path $res, $tmp | Out-Null

function Quiere([string]$nombre) { -not $Solo -or ($Solo -contains $nombre) }

function Descargar([string]$url, [string]$destino) {
  if ((Test-Path $destino) -and -not $Forzar) {
    Write-Host "  ya descargado: $(Split-Path $destino -Leaf)"
    return
  }
  Write-Host "  descargando $url"
  $parcial = "$destino.parcial"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  for ($i = 1; $i -le 6; $i++) {
    try {
      if ($curl) {
        # curl sigue las redirecciones y reanuda lo ya descargado (-C -): algunos espejos cortan la conexion a mitad del archivo
        & $curl.Source -L --fail --silent --show-error -C - --connect-timeout 30 --speed-limit 20480 --speed-time 60 -A pdfreaaaader -o $parcial $url
        if ($LASTEXITCODE -ne 0) { throw "curl termino con el codigo $LASTEXITCODE" }
      } else {
        Invoke-WebRequest -Uri $url -OutFile $parcial -UseBasicParsing -Headers @{ 'User-Agent' = 'pdfreaaaader' }
      }
      Move-Item -Force $parcial $destino
      Write-Host ("  descargado: {0:N0} MB" -f ((Get-Item $destino).Length / 1MB))
      return
    } catch {
      $tam = if (Test-Path $parcial) { '{0:N0} MB' -f ((Get-Item $parcial).Length / 1MB) } else { '0 MB' }
      Write-Host "  intento $i fallido ($tam descargados): $(($_.Exception.Message -split "`n")[0])"
      if ($i -eq 6) { throw }
      Start-Sleep -Seconds (5 * $i)
    }
  }
}

# «Start-Process -Wait» espera también a los procesos descendientes (el servicio de msiexec, por ejemplo) y puede colgarse:
# se espera solo al proceso lanzado.
function Ejecutar([string]$programa, [string[]]$argumentos, [int]$minutos = 20) {
  $p = Start-Process -FilePath $programa -ArgumentList $argumentos -PassThru -WindowStyle Hidden
  $null = $p.Handle # sin esto, ExitCode puede quedar vacío
  if (-not $p.WaitForExit($minutos * 60 * 1000)) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    throw "$programa tardó más de $minutos minutos y se canceló."
  }
  return $p.ExitCode
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

# 7-Zip (instalado, en el PATH o extraído del MSI oficial) para abrir el instalador de Ghostscript sin ejecutarlo
function Obtener7z {
  foreach ($c in @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe")) { if (Test-Path $c) { return $c } }
  $en = Get-Command 7z.exe -ErrorAction SilentlyContinue
  if ($en) { return $en.Source }
  $dir = Join-Path $tmp '7zip'
  $r = Buscar $dir '7z.exe'
  if (-not $r) {
    try {
      $msi = Join-Path $tmp '7z-x64.msi'
      Descargar 'https://www.7-zip.org/a/7z2409-x64.msi' $msi
      Ejecutar 'msiexec.exe' @('/a', "`"$msi`"", '/qn', "TARGETDIR=`"$dir`"") 10 | Out-Null
      $r = Buscar $dir '7z.exe'
    } catch {
      Write-Host '  (no se pudo conseguir 7-Zip)'
    }
  }
  if ($r) { return $r.FullName }
  return $null
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
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    # 1) Se abre el instalador con 7-Zip: no se ejecuta ni toca el registro de Windows
    $sz = Obtener7z
    if ($sz) {
      Write-Host '  extrayendo con 7-Zip...'
      & $sz x -y "-o$dest" $instalador | Out-Null
    }
    # 2) Si no hay 7-Zip se ejecuta el instalador en silencio (NSIS: /D debe ir al final y sin comillas).
    #    No se usa «Start-Process -Wait»: espera también a los procesos hijos y puede quedarse colgado.
    if (-not (Buscar $dest 'gswin64c.exe')) {
      Write-Host '  instalando en silencio…'
      $p = Start-Process -FilePath $instalador -ArgumentList '/S', "/D=$dest" -PassThru
      $limite = (Get-Date).AddMinutes(8)
      while ((Get-Date) -lt $limite -and -not (Buscar $dest 'gswin64c.exe')) { Start-Sleep -Seconds 3 }
      if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
    }
    if (-not (Buscar $dest 'gswin64c.exe')) { throw 'La instalación de Ghostscript no creó gswin64c.exe en resources\ghostscript.' }
    # Sobra todo lo que no hace falta para ejecutar gswin64c (se conserva vcredist_x64.exe por si el equipo no tiene el runtime de Visual C++)
    foreach ($sobra in '$PLUGINSDIR', 'doc', 'examples', 'uninstgs.exe.nsis') {
      $r = Join-Path $dest $sobra
      if (Test-Path -LiteralPath $r) { Remove-Item -Recurse -Force -LiteralPath $r }
    }
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
