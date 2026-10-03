import { canvasABytes, dibujarPagina, type PDFDocumentProxy } from '../pdfjs';
import { MotorOcr } from './ocr';
import type { ProveedorRender } from './tipos';

function rutasOcr() {
  const base = (r: string) => new URL(`./ocr/${r}`, document.baseURI).href;
  return { workerPath: base('worker.min.js'), corePath: base(''), langPath: base('') };
}

/** Render y OCR con el navegador (canvas + pdf.js + Tesseract en un worker). */
export function crearRenderNavegador(doc: PDFDocumentProxy, ocr?: { idioma: string }): ProveedorRender {
  let motor: Promise<MotorOcr> | null = null;

  return {
    async paginaAJpeg(indice, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      await dibujarPagina(pagina, canvas, anchoPx / v1.width, { fondo: '#ffffff' });
      const datos = await canvasABytes(canvas, 'image/jpeg', 0.82);
      const r = { datos, ancho: canvas.width, alto: canvas.height };
      canvas.width = canvas.height = 0;
      pagina.cleanup();
      return r;
    },

    async paginaSinTextoAJpeg(indice, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      await dibujarPagina(pagina, canvas, anchoPx / v1.width, { fondo: '#ffffff', sinTexto: true });
      const datos = await canvasABytes(canvas, 'image/jpeg', 0.85);
      const r = { datos, ancho: canvas.width, alto: canvas.height };
      canvas.width = canvas.height = 0;
      pagina.cleanup();
      return r;
    },

    async paginaRgba(indice, anchoPx, sinTexto) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      await dibujarPagina(pagina, canvas, anchoPx / v1.width, { fondo: '#ffffff', sinTexto });
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const datos = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const r = { ancho: canvas.width, alto: canvas.height, datos };
      canvas.width = canvas.height = 0;
      pagina.cleanup();
      return r;
    },

    async regionAImagen(indice, r, anchoPx) {
      const pagina = await doc.getPage(indice + 1);
      const v1 = pagina.getViewport({ scale: 1 });
      const escala = anchoPx / r.ancho;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(r.ancho * escala));
      canvas.height = Math.max(1, Math.round(r.alto * escala));
      const ctx = canvas.getContext('2d', { alpha: false })!;
      const arriba = v1.height - (r.y + r.alto);
      await pagina.render({
        canvas,
        canvasContext: ctx,
        viewport: pagina.getViewport({ scale: escala }),
        transform: [1, 0, 0, 1, -r.x * escala, -arriba * escala],
        background: '#ffffff',
      }).promise;
      const datos = await canvasABytes(canvas, 'image/jpeg', 0.88);
      canvas.width = canvas.height = 0;
      pagina.cleanup();
      return { datos, tipo: 'jpeg' as const };
    },

    ocrPagina: ocr
      ? async (indice) => {
          motor ??= MotorOcr.crear(ocr.idioma, rutasOcr());
          const m = await motor;
          const pagina = await doc.getPage(indice + 1);
          const v1 = pagina.getViewport({ scale: 1 });
          const escala = 300 / 72; // 300 ppp
          const canvas = document.createElement('canvas');
          await dibujarPagina(pagina, canvas, escala, { fondo: '#ffffff' });
          const lineas = await m.reconocer(canvas, escala, v1.height);
          canvas.width = canvas.height = 0;
          pagina.cleanup();
          return lineas;
        }
      : undefined,

    async liberar() {
      if (motor) {
        const m = await motor.catch(() => null);
        await m?.terminar();
        motor = null;
      }
    },
  };
}
