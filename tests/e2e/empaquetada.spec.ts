import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { crearPdf, textosPorPagina } from '../util/pdfs';
import { crearLibroPdf, hayLibreOffice } from '../util/libro';
import { leerEpub } from '../util/epub';
import { crearDocumentoPdf, crearPresentacionPdf } from '../util/documento';
import JSZip from 'jszip';

// Estas pruebas solo tienen sentido contra la app empaquetada: PDFREAAAADER_EXE=release/linux-unpacked/pdf_reaaaader
test.skip(!process.env.PDFREAAAADER_EXE, 'se ejecutan con PDFREAAAADER_EXE apuntando a la app empaquetada');

const dir = carpetaTemporal();
const leer = (r: string) => new Uint8Array(fs.readFileSync(r));

test('la app empaquetada arranca y muestra la home', async () => {
  const { app, page } = await abrirApp();
  await expect(page.getByTestId('tarjeta-unir')).toBeVisible();
  expect(page.url()).toMatch(/^app:\/\/local\//);
  await page.screenshot({ path: 'tests/capturas/empaquetada-home.png' });
  await app.close();
});

test('empaquetada: unir PDF (pdf.js desde el asar)', async () => {
  const { app, page } = await abrirApp();
  const a = path.join(dir, 'a.pdf');
  const b = path.join(dir, 'b.pdf');
  fs.writeFileSync(a, await crearPdf(2, { texto: (i) => `A${i}` }));
  fs.writeFileSync(b, await crearPdf(1, { texto: () => 'B1' }));
  const salida = path.join(dir, 'unido.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'unir');
  await subir(page, [a, b]);
  await expect(page.locator('.fila-orden canvas').first()).toBeVisible();
  await page.getByRole('button', { name: /Unir 2 PDF/ }).click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  expect(await textosPorPagina(leer(salida))).toEqual(['A1', 'A2', 'B1']);
  await app.close();
});

test('empaquetada: imágenes con sharp (módulo nativo fuera del asar)', async () => {
  const { app, page } = await abrirApp();
  const origen = path.join(dir, 'g.png');
  fs.writeFileSync(origen, await sharp({ create: { width: 300, height: 100, channels: 3, background: '#cc3333' } }).png().toBuffer());
  const salida = path.join(dir, 'g_redimensionada.png');
  await simularGuardado(app, [salida]);
  await irA(page, 'redimensionar');
  await subir(page, origen);
  await page.getByLabel('Ancho (px)').fill('150');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const m = await sharp(salida).metadata();
  expect([m.width, m.height]).toEqual([150, 50]);
  await app.close();
});

test('empaquetada: PDF a EPUB y OCR sin conexión', async () => {
  test.skip(!hayLibreOffice, 'hace falta LibreOffice para generar el PDF de prueba');
  const { app, page } = await abrirApp();
  const origen = path.join(dir, 'libro.pdf');
  fs.writeFileSync(origen, await crearLibroPdf('normal'));
  const salida = path.join(dir, 'libro.epub');
  await simularGuardado(app, [salida]);
  await irA(page, 'pdf-a-epub');
  await subir(page, origen);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('3 capítulos', { timeout: 90_000 });
  const { archivos } = await leerEpub(leer(salida));
  expect(archivos.filter((x) => /cap\d+\.xhtml$/.test(x))).toHaveLength(3);
  await app.close();
});

test('empaquetada: los programas externos se encuentran en la carpeta resources', async () => {
  const { app, page } = await abrirApp();
  const estado = await page.evaluate(() => window.api!.externos.estado());
  const por = Object.fromEntries(estado.map((e) => [e.id, e]));
  // Los modelos y Real-ESRGAN se copian a resources/ (extraResources) si estaban descargados al empaquetar
  if (fs.existsSync(path.resolve('resources/models/isnet-general-use.onnx'))) {
    expect(por['modelo-fondo'].disponible).toBe(true);
    expect(por['modelo-fondo'].ruta).toContain(`${path.sep}resources${path.sep}`);
  }
  if (fs.existsSync(path.resolve('resources/realesrgan'))) expect(por['realesrgan'].disponible).toBe(true);
  await app.close();
});

test('empaquetada: quitar fondo con onnxruntime desde el asar', async () => {
  test.skip(!fs.existsSync(path.resolve('resources/models/isnet-general-use.onnx')), 'falta el modelo');
  const { app, page } = await abrirApp();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d9e4ee"/><circle cx="200" cy="150" r="95" fill="#d2342a"/></svg>`;
  const origen = path.join(dir, 'bola.jpg');
  fs.writeFileSync(origen, await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer());
  const salida = path.join(dir, 'bola_sin-fondo.png');
  await simularGuardado(app, [salida]);
  await irA(page, 'eliminar-fondo');
  await subir(page, origen);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  const { data, info } = await sharp(salida).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(data[(150 * info.width + 200) * 4 + 3]).toBeGreaterThan(200);
  expect(data[(10 * info.width + 10) * 4 + 3]).toBeLessThan(60);
  await app.close();
});

test('empaquetada: Ghostscript incluido comprime un PDF', async () => {
  test.skip(!fs.existsSync(path.resolve('resources/ghostscript')), 'falta Ghostscript en resources/ghostscript');
  const { app, page } = await abrirApp();
  const ruido = Buffer.alloc(1200 * 900 * 3);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create();
  const img = await d.embedJpg(await sharp(ruido, { raw: { width: 1200, height: 900, channels: 3 } }).jpeg({ quality: 95 }).toBuffer());
  d.addPage([595, 842]).drawImage(img, { x: 20, y: 300, width: 555, height: 416 });
  const origen = path.join(dir, 'pesado.pdf');
  fs.writeFileSync(origen, await d.save());
  const salida = path.join(dir, 'pesado_comprimido.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'comprimir-pdf');
  await expect(page.getByTestId('falta-binario')).toHaveCount(0);
  await subir(page, origen);
  await page.getByRole('radio', { name: 'Compresión máxima' }).click();
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  expect(fs.statSync(salida).size).toBeLessThan(fs.statSync(origen).size * 0.7);
  await app.close();
});

test('empaquetada: Word, Excel y PowerPoint a PDF con los motores propios (Chromium imprime el PDF)', async () => {
  test.setTimeout(240_000);
  const { app, page } = await abrirApp();
  const fixtures = path.resolve('tests/fixtures/office');
  const casos: [string, string, string, string][] = [
    ['word-a-pdf', 'informe.docx', 'informe.pdf', 'Informe trimestral de ventas'],
    ['excel-a-pdf', 'libro.xlsx', 'libro.pdf', '1.234.567'],
    ['powerpoint-a-pdf', 'presentacion.pptx', 'presentacion.pdf', 'Plan de lanzamiento'],
  ];
  for (const [herramienta, entrada, salida, esperado] of casos) {
    const destino = path.join(dir, salida);
    await simularGuardado(app, [destino]);
    await irA(page, herramienta);
    await expect(page.getByTestId('falta-binario')).toHaveCount(0);
    await subir(page, path.join(fixtures, entrada));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    expect((await textosPorPagina(leer(destino))).join('\n')).toContain(esperado);
  }
  await app.close();
});

test('empaquetada: Word → PDF → EPUB encadenado dentro de la app', async () => {
  test.setTimeout(240_000);
  const { app, page } = await abrirApp();
  const pdf = path.join(dir, 'cadena.pdf');
  await simularGuardado(app, [pdf]);
  await irA(page, 'word-a-pdf');
  await subir(page, path.resolve('tests/fixtures/office/informe.docx'));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });

  const epub = path.join(dir, 'cadena.epub');
  await simularGuardado(app, [epub]);
  await irA(page, 'pdf-a-epub');
  await subir(page, pdf);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  const { zip, archivos } = await leerEpub(leer(epub));
  let plano = '';
  for (const a of archivos.filter((x) => /\.xhtml$/.test(x))) plano += ' ' + (await zip.file(a)!.async('string')).replace(/<[^>]+>/g, ' ');
  plano = plano.replace(/\s+/g, ' ');
  expect(plano).toContain('Informe trimestral de ventas');
  expect(plano).toContain('Preparar los datos');
  await app.close();
});

test('empaquetada: PDF a Word y PDF a PowerPoint (pdf.js y canvas dentro de la app)', async () => {
  test.setTimeout(240_000);
  const { app, page } = await abrirApp();
  const docx = path.join(dir, 'salida.docx');
  const pdfDoc = path.join(dir, 'doc.pdf');
  fs.writeFileSync(pdfDoc, await crearDocumentoPdf());
  await simularGuardado(app, [docx]);
  await irA(page, 'pdf-a-word');
  await subir(page, pdfDoc);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('resumen-word')).toContainText('Tablas: 1');
  const zw = await JSZip.loadAsync(fs.readFileSync(docx));
  const xml = await zw.file('word/document.xml')!.async('string');
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('<w:drawing>');
  expect(xml.replace(/<[^>]+>/g, ' ')).toContain('Informe de resultados');

  const pptx = path.join(dir, 'salida.pptx');
  const pdfPres = path.join(dir, 'pres.pdf');
  fs.writeFileSync(pdfPres, await crearPresentacionPdf());
  await simularGuardado(app, [pptx]);
  await irA(page, 'pdf-a-powerpoint');
  await subir(page, pdfPres);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('resumen-pptx')).toContainText('Cuadros de texto editables: 5');
  const zp = await JSZip.loadAsync(fs.readFileSync(pptx));
  const s1 = await zp.file('ppt/slides/slide1.xml')!.async('string');
  expect(s1).toContain('Plan de lanzamiento');
  expect(s1).toMatch(/srgbClr val="FFFFFF"/); // el color del título se averigua dibujando la página con y sin texto
  await app.close();
});
