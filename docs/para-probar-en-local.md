# Para probar en local (Windows)

Todo el código se ha ejecutado y probado en Linux (Electron real con Xvfb, 120+ pruebas unitarias, 40+ pruebas de extremo a extremo y la app
empaquetada) y en un Windows limpio de GitHub Actions. Lo siguiente **solo se puede comprobar con tu equipo** (GPU, cámara, versiones reales
de Windows, instalador):

## Instalación

- [ ] `npm install` y `npm run fetch-binaries` terminan sin errores (descarga ≈ 700 MB).
- [ ] `npm run dist` crea `release\pdfreaaaader-Setup-1.0.0.exe` y `release\pdfreaaaader-Portable-1.0.0.exe`.
- [ ] El instalador (NSIS) se instala, crea el acceso directo y se desinstala bien; el portable arranca sin instalar.
- [ ] En una máquina limpia (Windows Sandbox) **sin Office ni LibreOffice**, las conversiones funcionan con lo que va dentro del instalador.
- [ ] El icono aparece en el `.exe`, en la barra de tareas y en el acceso directo.

## Herramientas que dependen de tu hardware

- [ ] **Ampliar** (Real-ESRGAN) usa tu GPU con Vulkan: prueba una foto pequeña y una de 4–8 megapíxeles y mira el tiempo. En un PC sin Vulkan debe avisar.
- [ ] **Eliminar fondo**: en Windows intenta primero DirectML (GPU) y si falla usa la CPU. Comprueba que no se cuelga y revisa la calidad con fotos de personas y objetos.
- [ ] **Escanea a PDF** con tu webcam real (permiso de cámara de Windows, cambio entre cámaras, filtros).
- [ ] **HTML a PDF / HTML a IMAGEN** con una URL real y con un archivo `.html` con CSS e imágenes relativas.

## Calidad de las conversiones con tus propios archivos

- [ ] **PDF a EPUB** con 3–4 libros o documentos tuyos (con y sin marcadores, con columnas, con imágenes): abre el `.epub` en tu lector y revisa capítulos, párrafos, cursivas, imágenes y la portada.
      Prueba también el modo «diseño fijo» y un PDF escaneado con OCR.
- [ ] **PDF a Word / PowerPoint**: la fidelidad depende de LibreOffice; anota qué documentos salen mal.
- [ ] **PDF a Excel** con una factura o un informe con tablas: compara con el PDF. Si la detección de tablas falla en algún formato, guarda el PDF para ajustar `src/lib/tablas/detectar.ts`.
- [ ] **Comprimir PDF** con un PDF pesado real: tamaño antes/después y que el texto siga seleccionable.
- [ ] **PDF a PDF/A**: valídalo con veraPDF si lo necesitas para un trámite oficial (aquí solo se ha comprobado el perfil de salida y los metadatos XMP).

## Detalles de interfaz

- [ ] Tema claro/oscuro, buscador (Ctrl+K), arrastrar y soltar archivos desde el Explorador, diálogo «Guardar como».
- [ ] Rendimiento con PDF de cientos de páginas (miniaturas de Ordenar y Eliminar páginas).
