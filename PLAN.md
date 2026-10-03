# pdfreaaaader — plan de reconstrucción (app .exe: PDF + imágenes + PDF→EPUB)

Aplicación de escritorio para Windows, **100 % sin conexión y en español**, que copia el catálogo de herramientas de
iLovePDF / iLoveIMG y añade **PDF a EPUB**. Carpeta del usuario: `F:\pdf_reaaaader`.

Decisiones: tema claro/oscuro con selector (recordado); IA de imágenes (Eliminar fondo, Ampliar) incluida; LibreOffice incluido
en el instalador (cambiable a descarga la primera vez si pesa demasiado). **Cambio posterior:** LibreOffice se sustituyó por motores propios en JavaScript
(ver «Estado de la implementación»).

## Catálogo → implementación

| Categoría | Herramienta | Implementación |
|---|---|---|
| Ordenar PDF | Unir, Dividir, Eliminar, Extraer, Ordenar | `pdf-lib` + miniaturas `pdfjs-dist` + `@dnd-kit` + `jszip` |
| | Escanea a PDF | webcam (`getUserMedia`) + fotos importadas; filtros en canvas; `pdf-lib` |
| Optimizar | Comprimir PDF | Ghostscript (`gswin64c`, perfiles bajo/medio/alto) |
| | Comprimir IMAGEN | `sharp` (mozjpeg, WebP, PNG paleta) |
| | Ampliar | Real-ESRGAN ncnn-vulkan (x2/x3/x4), proceso externo |
| | Eliminar fondo | `onnxruntime-node` + modelo U²-Net/ISNet → PNG transparente |
| Convertir a PDF | JPG a PDF | `pdf-lib` |
| | Word / PowerPoint / Excel a PDF | ~~LibreOffice headless~~ → motores propios: documento → HTML + `printToPDF` |
| | HTML a PDF | ventana oculta de Electron + `printToPDF` |
| Convertir desde PDF | PDF a JPG | `pdfjs-dist` → canvas → JPG → ZIP |
| | PDF a Word / PowerPoint / Excel | ~~LibreOffice~~ → motores propios (escritores `.docx`/`.pptx`, extractor de tablas) |
| | PDF a PDF/A | Ghostscript (`-dPDFA=2`) |
| | **PDF a EPUB** | JavaScript puro (ver abajo) |
| Modificar PDF | Rotar, Números de página | `pdf-lib` |
| Imágenes | Redimensionar, Recortar, Girar, Convertir a/desde JPG | `sharp` + `react-image-crop` |
| | HTML a IMAGEN | ventana oculta de Electron + `capturePage` |

## PDF a EPUB

1. `pdfjs-dist` `getTextContent()` → líneas y párrafos. 2. Títulos por tamaño de fuente; capítulos por outline o cada N páginas.
3. Quitar cabeceras/pies repetidos. 4. Imágenes del operator list. 5. Empaquetar con `jszip` (`mimetype` primero y sin comprimir).
6. Modos: texto adaptable (por defecto) y diseño fijo. 7. OCR opcional con `tesseract.js` (apagado por defecto).

## Fases

0. Andamiaje · 1. Herramientas PDF · 2. Imágenes, HTML y Escáner · 3. PDF a EPUB · 4. Ghostscript y Office (LibreOffice → motores propios) ·
5. IA de imágenes · 6. Empaquetado (NSIS + portable).

## Riesgos

Instalador de ≈ 420 MB (modelos + Electron + Ghostscript); fidelidad limitada de PDF→Office (maquetación fluida en Word, texto editable sobre fondo en PowerPoint); Ghostscript es AGPL (revisar si se
distribuye); Ampliar requiere GPU con Vulkan; PDF→EPUB con columnas/tablas es heurístico (de ahí el modo de diseño fijo).

---

## Estado de la implementación

Las seis fases están implementadas (ver [README.md](README.md)). Diferencias respecto al plan:

- **PDF a Excel**: LibreOffice no tiene filtro de importación de PDF en Calc (el PDF se abre siempre como documento de Draw y no se puede exportar a XLSX),
  así que se implementó la extracción de tablas propia que el plan dejaba como plan B (`src/lib/tablas/`).
- **LibreOffice se eliminó del producto.** Su descarga desde GitHub Actions resultó inviable (el espejo de documentfoundation.org daba < 20 KB/s y cortaba la conexión: 8 MB en 12 minutos
  de unos 350) y añadía ≈ 400 MB al instalador. En su lugar hay motores propios (`src/lib/office/`):
  - **Word / Excel / PowerPoint a PDF**: lectura de OOXML (lector XML propio) → HTML autocontenido con `@page` → Chromium de Electron imprime el PDF.
  - **PDF a Word**: maquetación compartida con PDF a EPUB (`src/lib/epub/lectura.ts`) + detección de tablas + escritor de `.docx`.
  - **PDF a PowerPoint**: fondo de la página sin texto (pdf.js con `operationsFilter`) + cuadros de texto editables con el color real (página con y sin texto) + escritor de `.pptx`.
  - Quedan fuera los formatos antiguos (`.doc`, `.xls`, `.ppt`), RTF y OpenDocument, y los gráficos incrustados (se sustituyen por un recuadro).
- El instalador baja de 700 MB–1 GB a ≈ 420 MB.
- **Ampliar x2 / x3**: el modelo siempre amplía x4 y el resultado se reduce con Lanczos, que da mejor calidad que los modelos x2/x3.
- **Escanea a PDF**: sin la recepción de fotos del móvil por QR (era opcional en la fase 6).
- El renderer se sirve por un esquema propio `app://` en lugar de `file://`.
- Se añadió un flujo de GitHub Actions que compila el instalador en un Windows limpio y ejecuta las pruebas de humo de la app empaquetada.
