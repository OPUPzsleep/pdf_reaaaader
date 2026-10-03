import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import JSZip from 'jszip';
import type { ProveedorRender } from '../../src/lib/epub/tipos';
import type { OperadoresPdf } from '../../src/lib/epub/extraer';
import { MotorOcr } from '../../src/lib/epub/ocr';

const OPS_TEXTO = new Set<number>([pdfjs.OPS.showText, pdfjs.OPS.showSpacedText, pdfjs.OPS.nextLineShowText, pdfjs.OPS.nextLineSetSpacingShowText]);

export const OPS_NODE: OperadoresPdf = {
  save: pdfjs.OPS.save,
  restore: pdfjs.OPS.restore,
  transform: pdfjs.OPS.transform,
  paintImageXObject: pdfjs.OPS.paintImageXObject,
  paintInlineImageXObject: pdfjs.OPS.paintInlineImageXObject,
  paintImageMaskXObject: pdfjs.OPS.paintImageMaskXObject,
  paintFormXObjectBegin: pdfjs.OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: pdfjs.OPS.paintFormXObjectEnd,
};

export async function abrirDoc(datos: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: datos.slice(), useSystemFonts: true, verbosity: 0, fontExtraProperties: true }).promise as unknown as Promise<PDFDocumentProxy>;
}

/** Render real en node (pdf.js + @napi-rs/canvas) con la misma interfaz que usa la app. */
export function renderNode(doc: PDFDocumentProxy, ocr?: { idioma: string }): ProveedorRender {
  let motor: Promise<MotorOcr> | null = null;
  return {
    ocrPagina: ocr
      ? async (indice) => {
          motor ??= (async () => {
            const { createWorker } = await import('tesseract.js');
            const lang = ocr.idioma.split('+')[0];
            const w = await createWorker(ocr.idioma, 1, { langPath: path.resolve(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int`), gzip: true, cacheMethod: 'none' });
            return MotorOcr.envolver(w);
          })();
          const m = await motor;
          const pagina = await doc.getPage(indice + 1);
          const v1 = pagina.getViewport({ scale: 1 });
          const escala = 300 / 72;
          const vp = pagina.getViewport({ scale: escala });
          const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await pagina.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: vp, background: '#ffffff' }).promise;
          return m.reconocer(canvas.toBuffer('image/png'), escala, v1.height);
        }
      : undefined,
    async liberar() {
      if (motor) await (await motor).terminar();
      motor = null;
    },
    async paginaAJpeg(indice, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const escala = anchoPx / v1.width;
      const vp = pagina.getViewport({ scale: escala });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvas: canvas as never, canvasContext: ctx as never, viewport: vp, background: '#ffffff' }).promise;
      return { datos: new Uint8Array(canvas.toBuffer('image/jpeg', 80)), ancho: canvas.width, alto: canvas.height };
    },
    async paginaSinTextoAJpeg(indice, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: anchoPx / v1.width });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({
        canvas: canvas as never, canvasContext: ctx as never, viewport: vp, background: '#ffffff',
        operationsFilter: (i, lista) => !OPS_TEXTO.has(lista.fnArray[i]),
      }).promise;
      return { datos: new Uint8Array(canvas.toBuffer('image/jpeg', 80)), ancho: canvas.width, alto: canvas.height };
    },
    async paginaRgba(indice, anchoPx, sinTexto) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const vp = pagina.getViewport({ scale: anchoPx / v1.width });
      const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({
        canvas: canvas as never, canvasContext: ctx as never, viewport: vp, background: '#ffffff',
        operationsFilter: sinTexto ? (i, lista) => !OPS_TEXTO.has(lista.fnArray[i]) : undefined,
      }).promise;
      const datos = ctx.getImageData(0, 0, canvas.width, canvas.height).data as unknown as Uint8ClampedArray;
      return { ancho: canvas.width, alto: canvas.height, datos };
    },
    async regionAImagen(indice, r, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const escala = anchoPx / r.ancho;
      const vp = pagina.getViewport({ scale: escala });
      const w = Math.max(1, Math.round(r.ancho * escala));
      const h = Math.max(1, Math.round(r.alto * escala));
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      const arriba = v1.height - (r.y + r.alto);
      await pagina.render({
        canvas: canvas as never, canvasContext: ctx as never, viewport: vp,
        transform: [1, 0, 0, 1, -r.x * escala, -arriba * escala], background: '#ffffff',
      }).promise;
      return { datos: new Uint8Array(canvas.toBuffer('image/jpeg', 85)), tipo: 'jpeg' as const };
    },
  };
}

const EPUBCHECK = '/tmp/epubcheck/epubcheck-5.2.1/epubcheck.jar';
export const hayEpubcheck = fs.existsSync(EPUBCHECK) && (() => {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export interface InformeEpubcheck {
  errores: string[];
  avisos: string[];
}

/** Valida un EPUB con epubcheck (Java). */
export function validarConEpubcheck(epub: Uint8Array): InformeEpubcheck {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'epubcheck-'));
  const archivo = path.join(dir, 'libro.epub');
  const json = path.join(dir, 'informe.json');
  fs.writeFileSync(archivo, epub);
  try {
    execFileSync('java', ['-jar', EPUBCHECK, archivo, '--json', json, '-q'], { stdio: 'ignore', timeout: 120_000 });
  } catch {
    /* epubcheck devuelve código ≠ 0 cuando hay errores; el informe se lee igual */
  }
  const informe = JSON.parse(fs.readFileSync(json, 'utf8')) as { messages?: { severity: string; ID: string; message: string; locations?: { path: string; line: number }[] }[] };
  const fmt = (m: NonNullable<typeof informe.messages>[number]) => `${m.ID}: ${m.message} (${m.locations?.[0]?.path ?? ''}:${m.locations?.[0]?.line ?? ''})`;
  const msgs = informe.messages ?? [];
  return {
    errores: msgs.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL').map(fmt),
    avisos: msgs.filter((m) => m.severity === 'WARNING').map(fmt),
  };
}

export async function leerEpub(epub: Uint8Array) {
  const zip = await JSZip.loadAsync(epub);
  const texto = async (ruta: string) => zip.file(ruta)!.async('string');
  return { zip, texto, archivos: Object.keys(zip.files) };
}
