import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { IMAGENES_PDF_POR_DEFECTO, imagenesAPdf, orientacionExif } from '../src/lib/pdf/imagenesAPdf';

async function img(ancho: number, alto: number, tipo: 'jpg' | 'png', orientacion?: number) {
  let s = sharp({ create: { width: ancho, height: alto, channels: 3, background: '#3366cc' } });
  if (orientacion) s = s.withMetadata({ orientation: orientacion });
  const buf = tipo === 'jpg' ? await s.jpeg().toBuffer() : await s.png().toBuffer();
  return { datos: new Uint8Array(buf), tipo };
}

describe('imágenes a PDF', () => {
  it('una página por imagen, A4 con orientación automática', async () => {
    const r = await imagenesAPdf(
      [await img(200, 100, 'jpg'), await img(100, 200, 'png')],
      IMAGENES_PDF_POR_DEFECTO,
    );
    const doc = await PDFDocument.load(r);
    expect(doc.getPageCount()).toBe(2);
    const [p1, p2] = doc.getPages().map((p) => p.getSize());
    expect(p1.width).toBeGreaterThan(p1.height); // apaisada
    expect(p2.height).toBeGreaterThan(p2.width); // vertical
    expect(Math.round(p1.height)).toBe(595);
  });

  it('"ajustar" usa el tamaño de la imagen más el margen', async () => {
    const r = await imagenesAPdf([await img(400, 200, 'png')], { orientacion: 'auto', tamano: 'ajustar', margen: 'ninguno' });
    const { width, height } = (await PDFDocument.load(r)).getPage(0).getSize();
    expect([width, height]).toEqual([300, 150]);
  });

  it('orientación forzada en Carta', async () => {
    const r = await imagenesAPdf([await img(100, 200, 'jpg')], { orientacion: 'horizontal', tamano: 'Carta', margen: 'grande' });
    const { width, height } = (await PDFDocument.load(r)).getPage(0).getSize();
    expect([width, height]).toEqual([792, 612]);
  });

  it('lee la orientación EXIF', async () => {
    expect(orientacionExif((await img(10, 20, 'jpg')).datos)).toBe(1);
    expect(orientacionExif((await img(10, 20, 'jpg', 6)).datos)).toBe(6);
    expect(orientacionExif(new Uint8Array([1, 2, 3]))).toBe(1);
  });
});
