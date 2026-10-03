import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ampliar, quitarFondo, MAX_PIXELES_AMPLIAR } from '../electron/lib/ia';
import { localizarModeloFondo, localizarRealEsrgan } from '../electron/lib/externos';

const rutas = { recursos: path.resolve('resources') };
const hayModelo = !!localizarModeloFondo(rutas);
const hayEsrgan = !!localizarRealEsrgan(rutas);

/** Un objeto claro (balón) sobre un fondo liso. */
async function imagenConObjeto() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <rect width="400" height="300" fill="#d9e4ee"/>
    <ellipse cx="200" cy="270" rx="110" ry="14" fill="#b7c4d0"/>
    <circle cx="200" cy="150" r="95" fill="#d2342a"/>
    <path d="M110 120 Q200 60 290 120" stroke="#fff" stroke-width="10" fill="none"/>
    <path d="M110 180 Q200 240 290 180" stroke="#fff" stroke-width="10" fill="none"/>
  </svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer());
}

describe.skipIf(!hayModelo)('Quitar fondo', () => {
  it('deja opaco el objeto y transparente el fondo', async () => {
    const png = await quitarFondo(rutas, await imagenConObjeto());
    const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([400, 300]);
    expect(info.channels).toBe(4);
    const alfa = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
    expect(alfa(200, 150)).toBeGreaterThan(200); // centro del balón
    expect(alfa(200, 30)).toBeLessThan(60); // fondo justo encima del balón (el recorte debe ajustarse a la forma)
    expect(alfa(10, 10)).toBeLessThan(60); // esquina de fondo
    expect(alfa(390, 20)).toBeLessThan(60);
    fs.writeFileSync('tests/capturas/sin-fondo.png', png);
  }, 180_000);

  it('rechaza archivos que no son imágenes', async () => {
    await expect(quitarFondo(rutas, new Uint8Array([1, 2, 3]))).rejects.toThrow(/no compatible/);
  });

  it('sin modelo avisa de cómo conseguirlo', async () => {
    await expect(quitarFondo({ recursos: path.resolve('no-existe') }, await imagenConObjeto())).rejects.toThrow(/fetch-binaries/);
  });
});

describe.skipIf(!hayEsrgan)('Ampliar', () => {
  it('amplía x2 una imagen pequeña con Real-ESRGAN', async () => {
    const pequena = new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a7bd5' } }).png().toBuffer());
    const progresos: number[] = [];
    const png = await ampliar(rutas, pequena, 2, 'foto', (f) => progresos.push(f));
    const m = await sharp(Buffer.from(png)).metadata();
    expect([m.width, m.height]).toEqual([80, 60]);
    expect(progresos.length).toBeGreaterThan(0);
  }, 300_000);

  it('rechaza imágenes demasiado grandes sin llamar al motor', async () => {
    const grande = new Uint8Array(await sharp({ create: { width: 3200, height: 2600, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer());
    expect(3200 * 2600).toBeGreaterThan(MAX_PIXELES_AMPLIAR);
    await expect(ampliar(rutas, grande, 4, 'foto')).rejects.toThrow(/demasiado grande/);
  }, 60_000);

  it('sin el programa avisa de cómo conseguirlo', async () => {
    await expect(ampliar({ recursos: path.resolve('no-existe') }, new Uint8Array([1]), 2, 'foto')).rejects.toThrow(/fetch-binaries|Real-ESRGAN/);
  });
});
