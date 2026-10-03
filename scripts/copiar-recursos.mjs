// Copia a public/ los recursos que la app necesita sin conexión:
//   public/pdfjs  → CMaps, fuentes estándar, wasm y perfiles ICC de pdf.js
//   public/ocr    → worker y núcleo de Tesseract (solo LSTM) y datos de idioma (español e inglés)
// Las carpetas resultantes no se versionan.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const resolverCarpeta = (paquete) => {
  try {
    return path.dirname(require.resolve(`${paquete}/package.json`));
  } catch {
    return null;
  }
};

// pdf.js
{
  const raiz = resolverCarpeta('pdfjs-dist');
  const destino = path.resolve('public', 'pdfjs');
  if (existsSync(destino)) rmSync(destino, { recursive: true });
  mkdirSync(destino, { recursive: true });
  for (const carpeta of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    const origen = path.join(raiz, carpeta);
    if (existsSync(origen)) cpSync(origen, path.join(destino, carpeta), { recursive: true });
  }
  console.log('Recursos de pdf.js copiados a public/pdfjs');
}

// Tesseract (OCR)
{
  const destino = path.resolve('public', 'ocr');
  if (existsSync(destino)) rmSync(destino, { recursive: true });
  mkdirSync(destino, { recursive: true });
  const tess = resolverCarpeta('tesseract.js');
  const nucleo = resolverCarpeta('tesseract.js-core');
  if (tess && nucleo) {
    cpSync(path.join(tess, 'dist', 'worker.min.js'), path.join(destino, 'worker.min.js'));
    for (const f of readdirSync(nucleo)) {
      if (/^tesseract-core.*-lstm\.wasm\.js$/.test(f) || f === 'tesseract-core-lstm.wasm.js') cpSync(path.join(nucleo, f), path.join(destino, f));
    }
    let idiomas = 0;
    for (const lang of ['spa', 'eng']) {
      const datos = resolverCarpeta(`@tesseract.js-data/${lang}`);
      const archivo = datos && path.join(datos, '4.0.0_best_int', `${lang}.traineddata.gz`);
      if (archivo && existsSync(archivo)) {
        cpSync(archivo, path.join(destino, `${lang}.traineddata.gz`));
        idiomas++;
      }
    }
    console.log(`Recursos de OCR copiados a public/ocr (${idiomas} idioma${idiomas === 1 ? '' : 's'})`);
  } else {
    console.log('tesseract.js no está instalado: se omite el OCR');
  }
}
