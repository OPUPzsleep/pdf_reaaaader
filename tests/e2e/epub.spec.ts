import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { crearLibroPdf, hayLibreOffice } from '../util/libro';
import { hayEpubcheck, leerEpub, validarConEpubcheck } from '../util/epub';

const dir = carpetaTemporal();
const leer = (r: string) => new Uint8Array(fs.readFileSync(r));

test.describe('PDF a EPUB en la app', () => {
  test.skip(!hayLibreOffice, 'hace falta LibreOffice para generar el PDF de prueba');

  test('convierte un libro real: capítulos, metadatos y EPUB válido', async () => {
    const { app, page } = await abrirApp();
    await page.setViewportSize({ width: 1320, height: 1000 });
    const origen = path.join(dir, 'cuaderno.pdf');
    fs.writeFileSync(origen, await crearLibroPdf('normal'));
    const salida = path.join(dir, 'cuaderno.epub');
    await simularGuardado(app, [salida]);

    await irA(page, 'pdf-a-epub');
    await subir(page, origen);
    await expect(page.getByTestId('campo-titulo')).toHaveAttribute('placeholder', 'El cuaderno azul');
    await expect(page.getByTestId('campo-autor')).toHaveAttribute('placeholder', 'Ana Prueba');
    await page.screenshot({ path: 'tests/capturas/pdf-a-epub.png' });
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toContainText('3 capítulos', { timeout: 60_000 });
    await expect(page.getByTestId('resumen-epub')).toContainText('marcadores del PDF');
    await page.screenshot({ path: 'tests/capturas/pdf-a-epub-listo.png', fullPage: false });

    const epub = leer(salida);
    const { texto, archivos } = await leerEpub(epub);
    expect(archivos.filter((a) => /cap\d+\.xhtml$/.test(a))).toHaveLength(3);
    expect(await texto('OEBPS/content.opf')).toContain('<dc:title>El cuaderno azul</dc:title>');
    expect(await texto('OEBPS/cap003.xhtml')).toContain('<figure class="imagen">');
    if (hayEpubcheck) {
      const informe = validarConEpubcheck(epub);
      expect(informe.errores, informe.errores.join('\n')).toEqual([]);
    }
    await app.close();
  });

  test('modo de diseño fijo y metadatos editados', async () => {
    const { app, page } = await abrirApp();
    const origen = path.join(dir, 'cuaderno2.pdf');
    fs.writeFileSync(origen, await crearLibroPdf('normal'));
    const salida = path.join(dir, 'fijo.epub');
    await simularGuardado(app, [salida]);
    await irA(page, 'pdf-a-epub');
    await subir(page, origen);
    await page.getByRole('radio', { name: /Diseño fijo/ }).click();
    await page.getByTestId('campo-titulo').fill('Mi libro fijo');
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 90_000 });
    const { texto, archivos } = await leerEpub(leer(salida));
    expect(archivos.filter((a) => /img\/p\d+\.jpg$/.test(a))).toHaveLength(8);
    const opf = await texto('OEBPS/content.opf');
    expect(opf).toContain('pre-paginated');
    expect(opf).toContain('<dc:title>Mi libro fijo</dc:title>');
    if (hayEpubcheck) expect(validarConEpubcheck(leer(salida)).errores).toEqual([]);
    await app.close();
  });
});

test('OCR dentro de la app empaquetada (worker y wasm sin conexión)', async () => {
  // Página escaneada: solo una imagen con texto
  const w = 1240;
  const h = 1754;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#111';
  const fuente = GlobalFonts.has('DejaVu Sans') ? 'DejaVu Sans' : 'sans-serif';
  ctx.font = `bold 64px "${fuente}"`;
  ctx.fillText('The Bright Morning', 120, 220);
  ctx.font = `38px "${fuente}"`;
  ['The morning was bright and the streets were quiet when', 'Anna opened the old wooden door of the little bakery.', 'She lit the oven and began to prepare the bread.'].forEach((l, i) => ctx.fillText(l, 120, 360 + i * 58));
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(canvas.toBuffer('image/png'));
  doc.addPage([595.28, 841.89]).drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  const origen = path.join(dir, 'escaneo.pdf');
  fs.writeFileSync(origen, await doc.save());

  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'escaneo.epub');
  await simularGuardado(app, [salida]);
  await irA(page, 'pdf-a-epub');
  await subir(page, origen);
  await page.getByRole('checkbox', { name: /OCR/ }).check();
  await page.getByRole('radio', { name: 'Inglés', exact: true }).click();
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  const { texto } = await leerEpub(leer(salida));
  const cap = (await texto('OEBPS/cap001.xhtml')).replace(/<[^>]+>/g, ' ');
  expect(cap).toMatch(/Bright Morning/i);
  expect(cap).toMatch(/bakery/i);
  await expect(page.getByTestId('resumen-epub')).toContainText('OCR');
  await app.close();
});
