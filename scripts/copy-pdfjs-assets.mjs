// Copia los recursos de pdf.js (CMaps, fuentes estándar, wasm, perfiles ICC) a public/pdfjs
// para que la app funcione sin conexión. La carpeta resultante no se versiona.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raiz = path.dirname(require.resolve('pdfjs-dist/package.json'));
const destino = path.resolve('public', 'pdfjs');

if (existsSync(destino)) rmSync(destino, { recursive: true });
mkdirSync(destino, { recursive: true });
for (const carpeta of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  const origen = path.join(raiz, carpeta);
  if (existsSync(origen)) cpSync(origen, path.join(destino, carpeta), { recursive: true });
}
console.log('Recursos de pdf.js copiados a public/pdfjs');
