import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { infoImagen, procesarImagen } from '../electron/lib/imagen';

const crear = async (w: number, h: number, formato: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff', extra: Record<string, unknown> = {}) => {
  const s = sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } });
  return new Uint8Array(await s.toFormat(formato, extra).toBuffer());
};

describe('imágenes con sharp', () => {
  it('redimensiona conservando proporción dentro del cuadro', async () => {
    const r = await procesarImagen(await crear(400, 200, 'png'), { tipo: 'redimensionar', ancho: 100, alto: 100, ajuste: 'inside' });
    expect([r.ancho, r.alto]).toEqual([100, 50]);
    expect(r.formato).toBe('png');
  });
  it('redimensiona a medida exacta', async () => {
    const r = await procesarImagen(await crear(400, 200, 'jpeg'), { tipo: 'redimensionar', ancho: 100, alto: 100, ajuste: 'fill' });
    expect([r.ancho, r.alto]).toEqual([100, 100]);
  });
  it('por porcentaje', async () => {
    const r = await procesarImagen(await crear(400, 200, 'webp'), { tipo: 'redimensionar', porcentaje: 25, ajuste: 'inside' });
    expect([r.ancho, r.alto]).toEqual([100, 50]);
    expect(r.formato).toBe('webp');
  });
  it('no agranda si se pide', async () => {
    const r = await procesarImagen(await crear(100, 100, 'png'), { tipo: 'redimensionar', ancho: 400, ajuste: 'inside', sinAgrandar: true });
    expect([r.ancho, r.alto]).toEqual([100, 100]);
  });
  it('exige alguna medida', async () => {
    await expect(procesarImagen(await crear(10, 10, 'png'), { tipo: 'redimensionar', ajuste: 'inside' })).rejects.toThrow(/ancho, un alto o un porcentaje/);
  });
  it('recorta una zona', async () => {
    const r = await procesarImagen(await crear(300, 200, 'png'), { tipo: 'recortar', x: 50, y: 20, ancho: 100, alto: 80 });
    expect([r.ancho, r.alto]).toEqual([100, 80]);
  });
  it('recorte fuera de límites se ajusta', async () => {
    const r = await procesarImagen(await crear(100, 100, 'png'), { tipo: 'recortar', x: 80, y: 80, ancho: 100, alto: 100 });
    expect([r.ancho, r.alto]).toEqual([20, 20]);
  });
  it('gira 90° e intercambia dimensiones', async () => {
    const r = await procesarImagen(await crear(300, 100, 'png'), { tipo: 'girar', grados: 90, volteoH: false, volteoV: false });
    expect([r.ancho, r.alto]).toEqual([100, 300]);
  });
  it('voltea sin cambiar dimensiones', async () => {
    const r = await procesarImagen(await crear(30, 10, 'png'), { tipo: 'girar', grados: 0, volteoH: true, volteoV: true });
    expect([r.ancho, r.alto]).toEqual([30, 10]);
  });
  it('respeta la orientación EXIF al procesar', async () => {
    const jpg = new Uint8Array(await sharp({ create: { width: 200, height: 100, channels: 3, background: '#336699' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer());
    const info = await infoImagen(jpg);
    expect([info.ancho, info.alto]).toEqual([100, 200]); // como se ve
    const r = await procesarImagen(jpg, { tipo: 'girar', grados: 0, volteoH: false, volteoV: false });
    expect([r.ancho, r.alto]).toEqual([100, 200]);
  });
  it('convierte PNG con transparencia a JPG con fondo blanco', async () => {
    const png = new Uint8Array(await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer());
    const r = await procesarImagen(png, { tipo: 'convertir', formato: 'jpeg', calidad: 90, fondo: '#ffffff' });
    expect(r.formato).toBe('jpeg');
    const { data } = await sharp(Buffer.from(r.datos)).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240); // blanco, no negro
  });
  it('convierte SVG a JPG', async () => {
    const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#0a0"/></svg>'));
    const r = await procesarImagen(svg, { tipo: 'convertir', formato: 'jpeg', calidad: 90 });
    expect(r.formato).toBe('jpeg');
    expect(r.ancho).toBeGreaterThanOrEqual(120);
  });
  it('JPG a PNG y a WebP', async () => {
    const jpg = await crear(50, 50, 'jpeg');
    expect((await procesarImagen(jpg, { tipo: 'convertir', formato: 'png' })).formato).toBe('png');
    expect((await procesarImagen(jpg, { tipo: 'convertir', formato: 'webp', calidad: 80 })).formato).toBe('webp');
  });
  it('comprime un JPG ruidoso a menos bytes', async () => {
    const ruido = Buffer.alloc(400 * 400 * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
    const jpg = new Uint8Array(await sharp(ruido, { raw: { width: 400, height: 400, channels: 3 } }).jpeg({ quality: 98 }).toBuffer());
    const r = await procesarImagen(jpg, { tipo: 'comprimir', calidad: 40 });
    expect(r.datos.byteLength).toBeLessThan(jpg.byteLength * 0.6);
  });
  it('comprime PNG con paleta', async () => {
    const png = await crear(200, 200, 'png');
    const r = await procesarImagen(png, { tipo: 'comprimir', calidad: 70 });
    expect(r.formato).toBe('png');
  });
});
