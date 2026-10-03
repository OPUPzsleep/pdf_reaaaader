import { PDFDocument } from 'pdf-lib';

export interface ImagenEntrada {
  datos: Uint8Array;
  tipo: 'jpg' | 'png';
}

export interface OpcionesImagenesPdf {
  orientacion: 'auto' | 'vertical' | 'horizontal';
  tamano: 'ajustar' | 'A4' | 'Carta';
  margen: 'ninguno' | 'pequeno' | 'grande';
}

export const IMAGENES_PDF_POR_DEFECTO: OpcionesImagenesPdf = { orientacion: 'auto', tamano: 'A4', margen: 'pequeno' };

const TAMANOS: Record<'A4' | 'Carta', [number, number]> = { A4: [595.28, 841.89], Carta: [612, 792] };
const MARGENES = { ninguno: 0, pequeno: 24, grande: 48 } as const;

export async function imagenesAPdf(imagenes: ImagenEntrada[], op: OpcionesImagenesPdf, alProgreso?: (f: number) => void): Promise<Uint8Array> {
  if (imagenes.length === 0) throw new Error('Elige al menos una imagen.');
  const doc = await PDFDocument.create();
  const margen = MARGENES[op.margen];
  for (let i = 0; i < imagenes.length; i++) {
    const img = imagenes[i];
    const emb = img.tipo === 'jpg' ? await doc.embedJpg(img.datos) : await doc.embedPng(img.datos);
    let pw: number;
    let ph: number;
    if (op.tamano === 'ajustar') {
      // 1 píxel = 0,75 pt (96 dpi) y el margen se suma alrededor
      pw = emb.width * 0.75 + margen * 2;
      ph = emb.height * 0.75 + margen * 2;
    } else {
      let [a, b] = TAMANOS[op.tamano];
      const horizontal = op.orientacion === 'horizontal' || (op.orientacion === 'auto' && emb.width > emb.height);
      if (horizontal) [a, b] = [b, a];
      pw = a;
      ph = b;
    }
    const pagina = doc.addPage([pw, ph]);
    const maxW = pw - margen * 2;
    const maxH = ph - margen * 2;
    const escala = op.tamano === 'ajustar' ? 0.75 : Math.min(maxW / emb.width, maxH / emb.height);
    const dw = emb.width * escala;
    const dh = emb.height * escala;
    pagina.drawImage(emb, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    alProgreso?.((i + 1) / imagenes.length);
  }
  return doc.save();
}

/** Lee la orientación EXIF (1–8) de un JPEG; devuelve 1 si no hay. */
export function orientacionExif(datos: Uint8Array): number {
  if (datos[0] !== 0xff || datos[1] !== 0xd8) return 1;
  let p = 2;
  while (p + 4 < datos.length) {
    if (datos[p] !== 0xff) return 1;
    const marcador = datos[p + 1];
    const largo = (datos[p + 2] << 8) | datos[p + 3];
    if (marcador === 0xe1 && String.fromCharCode(...datos.slice(p + 4, p + 8)) === 'Exif') {
      const t = p + 10; // inicio del encabezado TIFF
      const little = datos[t] === 0x49;
      const u16 = (o: number) => (little ? datos[o] | (datos[o + 1] << 8) : (datos[o] << 8) | datos[o + 1]);
      const u32 = (o: number) => (little
        ? (datos[o] | (datos[o + 1] << 8) | (datos[o + 2] << 16) | (datos[o + 3] << 24)) >>> 0
        : ((datos[o] << 24) | (datos[o + 1] << 16) | (datos[o + 2] << 8) | datos[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (u16(e) === 0x0112) return u16(e + 8);
      }
      return 1;
    }
    if (marcador === 0xda) return 1;
    p += 2 + largo;
  }
  return 1;
}
