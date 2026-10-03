# resources

Programas externos que usa la app. Esta carpeta **no se versiona** (solo este archivo): se rellena con
`npm run fetch-binaries` y `electron-builder` la copia junto a la aplicación (`extraResources`).

| Carpeta | Contenido | Herramientas |
|---|---|---|
| `libreoffice/` | LibreOffice (instalación administrativa del MSI) | Word/Excel/PowerPoint a PDF, PDF a Word/PowerPoint |
| `ghostscript/` | Ghostscript (`bin\gswin64c.exe`) | Comprimir PDF, PDF a PDF/A |
| `realesrgan/` | `realesrgan-ncnn-vulkan.exe` y `models\` | Ampliar |
| `models/` | `isnet-general-use.onnx` | Eliminar fondo |

Si algo falta, la herramienta correspondiente lo avisa en pantalla. También se usan, si existen en el sistema:
LibreOffice instalado (`C:\Program Files\LibreOffice`), `gs`/`soffice` en el `PATH`, o las variables de entorno
`PDFREAAAADER_GS`, `PDFREAAAADER_SOFFICE` y `PDFREAAAADER_MODELO_FONDO`.
