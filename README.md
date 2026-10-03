# pdfreaaaader

Aplicación de escritorio para **Windows** (instalador `.exe` y versión portable), **100 % sin conexión** y **en español**,
con el catálogo de herramientas de iLovePDF / iLoveIMG más una herramienta propia: **PDF a EPUB**.

Electron + Vite + React + TypeScript. Tema claro y oscuro (se recuerda la elección). El plan original está en [PLAN.md](PLAN.md).

![Inicio en tema claro](docs/capturas/home-claro.png)

## Herramientas

| Categoría | Herramienta | Motor |
|---|---|---|
| **Ordenar PDF** | Unir · Dividir · Eliminar páginas · Extraer páginas · Ordenar PDF | `pdf-lib`, miniaturas con `pdf.js`, arrastrar con `@dnd-kit` |
| | Escanea a PDF | cámara (`getUserMedia`) o fotos; filtros Color / Grises / Documento / B&N; `pdf-lib` |
| **Optimizar** | Comprimir PDF | Ghostscript (perfiles máxima / recomendada / menos compresión) |
| | Comprimir IMAGEN | `sharp` (mozjpeg, WebP, PNG con paleta) con tabla antes/después |
| | Ampliar | Real-ESRGAN ncnn-vulkan (×2, ×3, ×4) |
| | Eliminar fondo | ISNet (`onnxruntime-node`) → PNG transparente |
| **Convertir a PDF** | JPG a PDF | `pdf-lib` (orientación, tamaño, márgenes, EXIF) |
| | Word / PowerPoint / Excel a PDF | LibreOffice sin interfaz |
| | HTML a PDF | ventana oculta de Electron + `printToPDF` (URL, archivo o código pegado) |
| **Convertir desde PDF** | PDF a JPG | `pdf.js` → canvas (DPI configurable, JPG o PNG) → ZIP |
| | PDF a Word / PowerPoint | LibreOffice (filtros de importación de PDF) |
| | PDF a Excel | **extracción de tablas propia** (ver más abajo) |
| | PDF a PDF/A | Ghostscript (PDF/A-2b con perfil sRGB) |
| | **PDF a EPUB** | motor propio en JavaScript (ver más abajo) |
| **Modificar PDF** | Rotar PDF · Números de página | `pdf-lib` (el número queda derecho aunque la página esté girada) |
| **Imágenes** | Redimensionar · Recortar · Girar | `sharp`; recorte con selector visual (`react-image-crop`) |
| | Convertir a JPG / desde JPG · HTML a IMAGEN | `sharp`; captura de página completa por trozos con el depurador de Chromium |

Todo se procesa en el equipo. Solo «HTML a PDF/IMAGEN» con una dirección web necesita internet, por razones obvias.

## PDF a EPUB

Todo en JavaScript, sin dependencias externas (`src/lib/epub/`):

1. **Extracción** con `pdfjs-dist`: texto con posición, tamaño y estilo (negrita/cursiva por el nombre real de la fuente), y posición de las imágenes.
2. **Maquetación**: líneas → párrafos (espacio entre párrafos, sangría o línea corta, según lo que use el documento), guiones de fin de línea, listas con viñetas y numeradas, títulos `h1–h3` por tamaño relativo al cuerpo, **dos columnas** (también en páginas mixtas, con el título a ancho completo) y párrafos que cruzan página o columna.
3. **Cabeceras, pies y números de página** repetidos se eliminan (detección por repetición + aislamiento + formato de número).
4. **Capítulos**: marcadores (outline) del PDF → títulos detectados → cada N páginas. El índice tiene un segundo nivel con los subtítulos.
5. **Imágenes**: se recortan de la página renderizada (sirve también para gráficos vectoriales); se descartan logotipos repetidos, iconos y fondos.
6. **Empaquetado** con `jszip` (`mimetype` primero y sin comprimir): `container.xml`, `content.opf` (EPUB 3 + NCX), `nav.xhtml`, capítulos XHTML, CSS, portada (primera página) y metadatos editables (título, autor, idioma detectado).
7. Dos modos: **texto adaptable** (por defecto) y **diseño fijo** (`pre-paginated`, cada página como imagen).
8. **OCR sin conexión** (`tesseract.js` con el núcleo y los datos de español e inglés incluidos) para PDF escaneados; apagado por defecto y solo para páginas sin texto.

![PDF a EPUB](docs/capturas/pdf-a-epub.png)

Validado con **epubcheck 5.2.1 (0 errores, 0 avisos)** sobre libros generados con LibreOffice (justificados y sin justificar, con y sin marcadores,
cabecera, pie, columnas, listas e imagen), el modo de diseño fijo, un PDF escaneado y un PDF sin estructura.

### Límites conocidos
- Los PDF con **tablas, columnas irregulares o más de dos columnas** se reconstruyen de forma aproximada; para esos usa el modo de diseño fijo.
- En texto sin justificar y sin sangría, un párrafo que continúa en la página siguiente puede quedar partido si la página acaba justo al final de una frase.
- El OCR comete errores y es lento (unos segundos por página).

## PDF a Excel

LibreOffice no tiene filtro de importación de PDF en Calc, así que la herramienta usa un extractor propio (`src/lib/tablas/`): agrupa el texto en filas, detecta bloques
con celdas alineadas en columnas, une las tablas que continúan en la página siguiente (omitiendo la cabecera repetida), reconoce celdas combinadas y convierte los números
(`1.234,50`, `12 %`, `(300)`) en números de Excel. Genera cada tabla en su hoja y, opcionalmente, el resto del texto en una hoja «Texto». El `.xlsx` se escribe a mano y se
comprueba abriéndolo con LibreOffice.

## Desarrollo

Requisitos: Node 22 o superior.

```bash
npm install
npm run dev          # Vite + Electron con recarga
npm run typecheck
npm test             # vitest: lib/pdf, lib/epub, lib/tablas, sharp, Ghostscript, LibreOffice, OCR, IA
npm run build        # interfaz + proceso principal
npx playwright test  # pruebas de extremo a extremo con Electron (en Linux: xvfb-run -a npx playwright test)
```

El renderer **no usa `file://`**: la versión empaquetada se sirve por un esquema propio `app://` para que funcionen `fetch`, workers y wasm
(pdf.js, Tesseract, onnxruntime) como en un sitio normal. Los recursos de pdf.js y de OCR se copian a `public/` con `scripts/copiar-recursos.mjs`.

## Compilar el instalador (Windows)

```powershell
npm install
npm run fetch-binaries   # descarga LibreOffice, Ghostscript, Real-ESRGAN y el modelo a .\resources (≈ 700 MB)
npm run dist             # release\pdfreaaaader-Setup-<versión>.exe y release\pdfreaaaader-Portable-<versión>.exe
```

`npm run fetch-binaries -- -Solo modelo,realesrgan` descarga solo una parte. Si no los descargas, la app funciona igual y cada herramienta
que dependa de un programa que falte lo avisa en pantalla (también detecta LibreOffice instalado en `C:\Program Files`, `gs`/`soffice` en el `PATH` y las variables
`PDFREAAAADER_GS`, `PDFREAAAADER_SOFFICE`, `PDFREAAAADER_MODELO_FONDO`). `npm run dist:dir` genera solo la carpeta sin instalador (más rápido para probar).

Tamaño estimado del instalador: **700 MB – 1 GB** (LibreOffice ≈ 400 MB, modelo ≈ 170 MB, Electron ≈ 100 MB, Ghostscript ≈ 40 MB). Si es demasiado, lo más fácil
es quitar `libreoffice` de `resources` y dejar que la app use el LibreOffice instalado, o pasar LibreOffice y el modelo a una descarga en el primer uso.

El repositorio incluye un flujo de GitHub Actions (`.github/workflows/windows.yml`) que ejecuta todo esto en un Windows limpio y sube el instalador como artefacto.

## Estructura

```
electron/         main.ts, preload.ts, ipc/ (archivos, imagen, html, externos, ia), lib/ (sharp, Ghostscript, LibreOffice, IA)
src/
  app/            App, Layout, tema
  pages/          Home, ToolPage
  tools/          registry.ts (una entrada por herramienta) + una carpeta por herramienta + comun/ (vistas compartidas)
  lib/pdf/        unir, dividir, rotar, números, imágenes a PDF, rangos, zip
  lib/epub/       extraer, layout, capítulos, xhtml, ensamblar, ocr, renderNavegador
  lib/tablas/     detectar, números, xlsx
  components/     FileDropzone, Miniatura, ListaOrdenable, CuadriculaOrdenable, SelectorPaginas, ResultadoPanel…
scripts/          build-electron.mjs, dev.mjs, copiar-recursos.mjs, generar-iconos.mjs, fetch-binaries.ps1
tests/            vitest (unitarias e integración) y tests/e2e (Playwright para Electron)
resources/        programas externos (no se versiona)
```

Añadir una herramienta es una entrada en `src/tools/registry.ts` (id, categoría, nombre, descripción, icono y componente); de ahí salen la home, el menú lateral y el buscador.

## Licencias

- **Ghostscript** es AGPL. Para uso personal no hay problema; si algún día distribuyes la app, revisa esa licencia (o sustituye la compresión por otra herramienta).
- **LibreOffice** (MPL 2.0), **Real-ESRGAN** (BSD-3) y **tesseract.js** (Apache-2.0) son compatibles con la redistribución. Revisa la licencia del modelo **ISNet** antes de distribuir.
- Los iconos son propios (SVG con `lucide-react`); no se usa ningún recurso gráfico de iLovePDF.
