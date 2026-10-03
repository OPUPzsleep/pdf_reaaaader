# pdfreaaaader

Aplicación de escritorio para Windows (.exe), **100 % sin conexión** y en español, con el catálogo de herramientas de
iLovePDF / iLoveIMG y una herramienta propia: **PDF a EPUB**.

> Estado: en construcción por fases. Ver [PLAN.md](PLAN.md).

## Desarrollo

```bash
npm install
npm run dev        # Vite + Electron con recarga
npm run typecheck
npm test           # vitest (lógica de lib/pdf y lib/epub)
npm run build      # renderer + proceso principal
```
