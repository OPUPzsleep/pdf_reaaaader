# resources

Programas externos que usa la app. Esta carpeta **no se versiona** (solo este archivo): se rellena con
`npm run fetch-binaries` y `electron-builder` la copia junto a la aplicación (`extraResources`).

| Carpeta | Contenido | Herramientas |
|---|---|---|
| `ghostscript/` | Ghostscript (`bin\gswin64c.exe`) | Comprimir PDF, PDF a PDF/A |
| `realesrgan/` | `realesrgan-ncnn-vulkan.exe` y `models\` | Ampliar |
| `models/` | `isnet-general-use.onnx` | Eliminar fondo |

Si algo falta, la herramienta correspondiente lo avisa en pantalla. También se usan, si existen en el sistema:
Ghostscript instalado (`C:\Program Files\gs`), `gs` en el `PATH`, o las variables de entorno
`PDFREAAAADER_GS` y `PDFREAAAADER_MODELO_FONDO`.

Word, Excel y PowerPoint (a y desde PDF) no usan ningún programa externo: están implementados en la propia aplicación.
