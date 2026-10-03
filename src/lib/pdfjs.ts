import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Recursos copiados a public/pdfjs (ver scripts/copy-pdfjs-assets.mjs): la app no necesita internet.
const base = (carpeta: string) => new URL(`./pdfjs/${carpeta}/`, document.baseURI).href;

export type { PDFDocumentProxy, PDFPageProxy };

/** Códigos de operación que usa el conversor a EPUB para localizar imágenes. */
export const OPERADORES = {
  save: pdfjs.OPS.save,
  restore: pdfjs.OPS.restore,
  transform: pdfjs.OPS.transform,
  paintImageXObject: pdfjs.OPS.paintImageXObject,
  paintInlineImageXObject: pdfjs.OPS.paintInlineImageXObject,
  paintImageMaskXObject: pdfjs.OPS.paintImageMaskXObject,
  paintFormXObjectBegin: pdfjs.OPS.paintFormXObjectBegin,
  paintFormXObjectEnd: pdfjs.OPS.paintFormXObjectEnd,
};

/** Operaciones que dibujan texto: al omitirlas queda la página sin texto (fondo de las diapositivas de PDF a PowerPoint) */
const OPS_TEXTO = new Set<number>([pdfjs.OPS.showText, pdfjs.OPS.showSpacedText, pdfjs.OPS.nextLineShowText, pdfjs.OPS.nextLineSetSpacingShowText]);

/** Abre un PDF con pdf.js. Se copia el buffer porque pdf.js lo transfiere al worker. */
export async function abrirPdfjs(datos: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    return await pdfjs.getDocument({
      data: datos.slice(),
      cMapUrl: base('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: base('standard_fonts'),
      wasmUrl: base('wasm'),
      iccUrl: base('iccs'),
      // Necesario para conocer el nombre real de la fuente (negrita/cursiva) al convertir a EPUB
      fontExtraProperties: true,
    }).promise;
  } catch (e) {
    const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    if (/Password/i.test(msg)) throw new Error('El PDF está protegido con contraseña.');
    throw new Error('No se pudo abrir el PDF: no parece válido o está dañado.');
  }
}

/** Libera el documento y su worker. */
export function cerrarPdfjs(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy();
}

const MAX_PIXELES = 120_000_000;

/** Dibuja una página en un canvas a la escala indicada (1 = 72 dpi). Devuelve el tamaño en píxeles. */
export async function dibujarPagina(
  pagina: PDFPageProxy,
  canvas: HTMLCanvasElement,
  escala: number,
  opciones: { fondo?: string; rotacion?: number; sinTexto?: boolean } = {},
): Promise<{ ancho: number; alto: number; cancelar: () => void }> {
  const rotation = (((pagina.rotate + (opciones.rotacion ?? 0)) % 360) + 360) % 360;
  let vp = pagina.getViewport({ scale: escala, rotation });
  if (vp.width * vp.height > MAX_PIXELES) {
    vp = pagina.getViewport({ scale: escala * Math.sqrt(MAX_PIXELES / (vp.width * vp.height)), rotation });
  }
  const dpr = 1;
  canvas.width = Math.max(1, Math.floor(vp.width * dpr));
  canvas.height = Math.max(1, Math.floor(vp.height * dpr));
  const ctx = canvas.getContext('2d', { alpha: !opciones.fondo })!;
  const tarea = pagina.render({
    canvas,
    canvasContext: ctx,
    viewport: vp,
    background: opciones.fondo,
    operationsFilter: opciones.sinTexto ? (i, lista) => !OPS_TEXTO.has(lista.fnArray[i]) : undefined,
  });
  await tarea.promise;
  return { ancho: canvas.width, alto: canvas.height, cancelar: () => tarea.cancel() };
}

export function canvasABytes(canvas: HTMLCanvasElement, tipo: 'image/jpeg' | 'image/png', calidad = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('No se pudo generar la imagen.'))),
      tipo,
      calidad,
    );
  });
}

/** Renderiza una página (1 = primera) a JPG o PNG con el DPI dado. */
export async function paginaABytes(
  doc: PDFDocumentProxy,
  numero: number,
  dpi: number,
  tipo: 'image/jpeg' | 'image/png',
  calidad = 0.92,
): Promise<Uint8Array> {
  const pagina = await doc.getPage(numero);
  const canvas = document.createElement('canvas');
  await dibujarPagina(pagina, canvas, dpi / 72, { fondo: '#ffffff' });
  const bytes = await canvasABytes(canvas, tipo, calidad);
  canvas.width = canvas.height = 0;
  pagina.cleanup();
  return bytes;
}
