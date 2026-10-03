import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { textosPorPagina } from '../util/pdfs';

const dir = carpetaTemporal();
const escribir = (nombre: string, datos: Uint8Array | Buffer | string) => {
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, datos);
  return ruta;
};
const meta = (ruta: string) => sharp(ruta).metadata();

const png = async (w: number, h: number, color = '#cc3333') =>
  sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();

test('Redimensionar: ancho en píxeles conservando proporción', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'redim.png');
  await simularGuardado(app, [salida]);
  await irA(page, 'redimensionar');
  await subir(page, escribir('grande.png', await png(400, 200)));
  await page.getByLabel('Ancho (px)').fill('100');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('redimensionada');
  const m = await meta(salida);
  expect([m.width, m.height]).toEqual([100, 50]);
  await page.screenshot({ path: 'tests/capturas/redimensionar.png' });
  await app.close();
});

test('Redimensionar: pide una medida si no hay ninguna', async () => {
  const { app, page } = await abrirApp();
  await irA(page, 'redimensionar');
  await subir(page, escribir('x.png', await png(50, 50)));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('error')).toContainText('Escribe un ancho');
  await app.close();
});

test('Recortar: selección con el ratón', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'recorte.png');
  await simularGuardado(app, [salida]);
  await irA(page, 'recortar');
  await subir(page, escribir('base.png', await png(600, 400, '#3366cc')));
  const img = page.getByAltText('Imagen a recortar');
  await expect(img).toBeVisible();
  const caja = (await img.boundingBox())!;
  await page.mouse.move(caja.x + caja.width * 0.25, caja.y + caja.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.75, caja.y + caja.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('medidas-recorte')).toContainText('Recorte:');
  await page.screenshot({ path: 'tests/capturas/recortar.png' });
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const m = await meta(salida);
  // La mitad del ancho y del alto, con tolerancia de redondeo
  expect(Math.abs(m.width! - 300)).toBeLessThanOrEqual(4);
  expect(Math.abs(m.height! - 200)).toBeLessThanOrEqual(4);
  await app.close();
});

test('Girar imagen 90° intercambia las medidas', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'girada.png');
  await simularGuardado(app, [salida]);
  await irA(page, 'girar-imagen');
  await subir(page, escribir('g.png', await png(300, 100)));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const m = await meta(salida);
  expect([m.width, m.height]).toEqual([100, 300]);
  await app.close();
});

test('Convertir a JPG: PNG y SVG → ZIP', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'jpgs.zip');
  await simularGuardado(app, [salida]);
  const svg = escribir('dibujo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#0a0"/></svg>');
  await irA(page, 'convertir-a-jpg');
  await subir(page, [escribir('foto.png', await png(60, 60)), svg]);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('2 imágenes');
  const zip = await JSZip.loadAsync(fs.readFileSync(salida));
  expect(Object.keys(zip.files).sort()).toEqual(['dibujo.jpg', 'foto.jpg']);
  expect((await sharp(await zip.file('foto.jpg')!.async('nodebuffer')).metadata()).format).toBe('jpeg');
  await app.close();
});

test('JPG a PNG: un archivo suelto y un lote en ZIP', async () => {
  const { app, page } = await abrirApp();
  const unico = path.join(dir, 'foto.png');
  await simularGuardado(app, [unico]);
  const jpg = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
  await irA(page, 'jpg-a-png');
  await subir(page, escribir('foto.jpg', await jpg(70, 50, '#3366cc')));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const m = await meta(unico);
  expect([m.format, m.width, m.height]).toEqual(['png', 70, 50]);

  // Varios JPG: un ZIP con un PNG por cada uno (y también acepta .jpeg)
  const lote = path.join(dir, 'pngs.zip');
  await simularGuardado(app, [lote]);
  await page.getByRole('button', { name: 'Quitar foto.jpg' }).click();
  await subir(page, [escribir('uno.jpg', await jpg(30, 30, '#cc0000')), escribir('dos.jpeg', await jpg(40, 20, '#00cc00'))]);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('2 imágenes');
  const zip = await JSZip.loadAsync(fs.readFileSync(lote));
  expect(Object.keys(zip.files).sort()).toEqual(['dos.png', 'uno.png']);
  expect((await sharp(await zip.file('dos.png')!.async('nodebuffer')).metadata()).format).toBe('png');
  await app.close();
});

test('PNG a JPG: la transparencia se rellena con el color de fondo elegido', async () => {
  const { app, page } = await abrirApp();
  // PNG de 40×40 totalmente transparente salvo un cuadrado rojo opaco en la esquina superior izquierda
  const rojo = await sharp({ create: { width: 10, height: 10, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const origen = escribir(
    'transparente.png',
    await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: rojo, left: 0, top: 0 }])
      .png()
      .toBuffer(),
  );
  const pixel = async (ruta: string, x: number, y: number) => {
    const { data, info } = await sharp(ruta).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  // Por defecto, fondo blanco
  const blanco = path.join(dir, 'transparente.jpg');
  await simularGuardado(app, [blanco]);
  await irA(page, 'png-a-jpg');
  await subir(page, origen);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const m = await meta(blanco);
  expect([m.format, m.width, m.height, m.hasAlpha]).toEqual(['jpeg', 40, 40, false]);
  const [r0, g0, b0] = await pixel(blanco, 35, 35);
  expect(Math.min(r0, g0, b0)).toBeGreaterThan(240); // blanco
  const [r1, g1, b1] = await pixel(blanco, 3, 3);
  expect(r1).toBeGreaterThan(200); // el cuadrado rojo se conserva
  expect(g1).toBeLessThan(60);
  expect(b1).toBeLessThan(60);

  // Con otro color de fondo y menos calidad
  const verde = path.join(dir, 'transparente_verde.jpg');
  await simularGuardado(app, [verde]);
  await page.getByRole('button', { name: 'Quitar transparente.png' }).click();
  await subir(page, origen);
  await page.getByTestId('fondo').fill('#00ff00');
  await page.getByTestId('calidad').fill('70');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const [r2, g2, b2] = await pixel(verde, 35, 35);
  expect(g2).toBeGreaterThan(220);
  expect(r2).toBeLessThan(60);
  expect(b2).toBeLessThan(60);
  await app.close();
});

test('Convertir desde JPG a WebP', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'foto.webp');
  await simularGuardado(app, [salida]);
  await irA(page, 'convertir-desde-jpg');
  await subir(page, escribir('foto.jpg', await sharp({ create: { width: 64, height: 64, channels: 3, background: '#884400' } }).jpeg().toBuffer()));
  await page.getByRole('radio', { name: 'WebP' }).click();
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  expect((await meta(salida)).format).toBe('webp');
  await app.close();
});

test('Comprimir imagen: muestra la comparación y reduce el peso', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'ruido_comprimida.jpg');
  await simularGuardado(app, [salida]);
  const ruido = Buffer.alloc(500 * 500 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
  const original = escribir('ruido.jpg', await sharp(ruido, { raw: { width: 500, height: 500, channels: 3 } }).jpeg({ quality: 98 }).toBuffer());
  await irA(page, 'comprimir-imagen');
  await subir(page, original);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('tabla-comparacion')).toBeVisible();
  expect(fs.statSync(salida).size).toBeLessThan(fs.statSync(original).size * 0.7);
  await page.screenshot({ path: 'tests/capturas/comprimir-imagen.png' });
  await app.close();
});

test('HTML a PDF con código pegado', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'pagina.pdf');
  await simularGuardado(app, [salida]);
  await page.evaluate(() => (location.hash = '#/herramienta/html-a-pdf'));
  await page.getByRole('radio', { name: 'Pegar código' }).click();
  await page.getByTestId('campo-html').fill('<html><body style="font-family:sans-serif"><h1>Hola mundo</h1><p>Segunda línea de prueba</p></body></html>');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 30_000 });
  const datos = new Uint8Array(fs.readFileSync(salida));
  expect((await PDFDocument.load(datos)).getPageCount()).toBe(1);
  expect((await textosPorPagina(datos))[0]).toContain('Hola mundo');
  await app.close();
});

test('HTML a PDF: URL inválida da un error claro', async () => {
  const { app, page } = await abrirApp();
  await page.evaluate(() => (location.hash = '#/herramienta/html-a-pdf'));
  await page.getByTestId('campo-url').fill('http://127.0.0.1:1/no-existe');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('error')).toContainText('No se pudo cargar', { timeout: 30_000 });
  await app.close();
});

test('HTML a imagen: captura la página completa, incluso muy alta', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'captura.png');
  await simularGuardado(app, [salida]);
  await page.evaluate(() => (location.hash = '#/herramienta/html-a-imagen'));
  await page.getByRole('radio', { name: 'Pegar código' }).click();
  // 20000 px de alto: obliga a capturar por trozos y unirlos. Franja roja arriba, azul abajo.
  await page.getByTestId('campo-html').fill(
    '<html><body style="margin:0"><div style="height:10000px;background:#ff0000"></div><div style="height:10000px;background:#0000ff"></div></body></html>',
  );
  await page.getByLabel(/Ancho de la ventana/).fill('800');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
  const m = await meta(salida);
  expect(m.width).toBe(800);
  expect(m.height).toBe(20000);
  const px = async (y: number) => (await sharp(salida).extract({ left: 400, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer()).toJSON().data;
  expect(await px(100)).toEqual([255, 0, 0]);
  expect(await px(19900)).toEqual([0, 0, 255]);
  await app.close();
});

test('Escanea a PDF: cámara simulada + fotos importadas con filtro B/N', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'escaneo.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'escanear');
  await page.getByTestId('activar-camara').click();
  await expect(page.getByTestId('video-camara')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => page.getByTestId('video-camara').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.getByTestId('capturar').click();
  await page.getByTestId('capturar').click();
  await expect(page.getByTestId('fila-orden')).toHaveCount(2);
  await subir(page, escribir('hoja.png', await png(200, 300, '#dddddd')));
  await expect(page.getByTestId('fila-orden')).toHaveCount(3);
  await page.getByRole('radio', { name: 'Blanco y negro' }).click();
  await page.getByTestId('aplicar-todas').click();
  await page.screenshot({ path: 'tests/capturas/escanear.png' });
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('3 páginas', { timeout: 30_000 });
  expect((await PDFDocument.load(new Uint8Array(fs.readFileSync(salida)))).getPageCount()).toBe(3);
  await app.close();
});
