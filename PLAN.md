# pdfreaaaader — plan de reconstrucción (app .exe: PDF + imágenes + PDF→EPUB)

Aplicación de escritorio para Windows, **100 % sin conexión y en español**, que copia el catálogo de herramientas de
iLovePDF / iLoveIMG y añade **PDF a EPUB**. Carpeta del usuario: `F:\pdf_reaaaader`.

Decisiones: tema claro/oscuro con selector (recordado); IA de imágenes (Eliminar fondo, Ampliar) incluida; LibreOffice incluido
en el instalador (cambiable a descarga la primera vez si pesa demasiado).

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
| | Word / PowerPoint / Excel a PDF | LibreOffice headless |
| | HTML a PDF | ventana oculta de Electron + `printToPDF` |
| Convertir desde PDF | PDF a JPG | `pdfjs-dist` → canvas → JPG → ZIP |
| | PDF a Word / PowerPoint / Excel | LibreOffice (filtros `*_pdf_import`) |
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

0. Andamiaje · 1. Herramientas PDF · 2. Imágenes, HTML y Escáner · 3. PDF a EPUB · 4. Ghostscript y LibreOffice ·
5. IA de imágenes · 6. Empaquetado (NSIS + portable).

## Riesgos

Instalador de 700 MB–1 GB (LibreOffice + modelos + Electron); fidelidad limitada de PDF→Office; Ghostscript es AGPL (revisar si se
distribuye); Ampliar requiere GPU con Vulkan; PDF→EPUB con columnas/tablas es heurístico (de ahí el modo de diseño fijo).

---

## Estado de la implementación

Las seis fases están implementadas (ver [README.md](README.md)). Diferencias respecto al plan:

- **PDF a Excel**: LibreOffice no tiene filtro de importación de PDF en Calc (el PDF se abre siempre como documento de Draw y no se puede exportar a XLSX),
  así que se implementó la extracción de tablas propia que el plan dejaba como plan B (`src/lib/tablas/`).
- **PDF a Word / PowerPoint** sí usan LibreOffice (`writer_pdf_import`, `impress_pdf_import`).
- **Ampliar x2 / x3**: el modelo siempre amplía x4 y el resultado se reduce con Lanczos, que da mejor calidad que los modelos x2/x3.
- **Escanea a PDF**: sin la recepción de fotos del móvil por QR (era opcional en la fase 6).
- El renderer se sirve por un esquema propio `app://` en lugar de `file://`.
- Se añadió un flujo de GitHub Actions que compila el instalador en un Windows limpio y ejecuta las pruebas de humo de la app empaquetada.
