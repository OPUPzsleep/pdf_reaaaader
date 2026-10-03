import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFArray } from 'pdf-lib';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { crearPdf, textosPorPagina } from '../util/pdfs';
import { crearOffice, crearPdfDesdeOdf, hayGhostscript, NS_ODF } from '../util/office';
import { hayLibreOffice } from '../util/libro';

const dir = carpetaTemporal();
const escribir = (nombre: string, datos: Uint8Array | Buffer) => {
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, datos);
  return ruta;
};
const leer = (r: string) => new Uint8Array(fs.readFileSync(r));

test.describe('Ghostscript', () => {
  test.skip(!hayGhostscript, 'Ghostscript no está instalado');

  test('Comprimir PDF: tabla de ahorro y PDF más pequeño', async () => {
    const { app, page } = await abrirApp();
    const ruido = Buffer.alloc(1600 * 1200 * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(await sharp(ruido, { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer());
    const p = doc.addPage([595, 842]);
    p.drawImage(img, { x: 20, y: 300, width: 555, height: 416 });
    p.drawText('Texto que debe seguir seleccionable', { x: 40, y: 200, size: 18 });
    const origen = escribir('pesado.pdf', await doc.save());
    const salida = path.join(dir, 'pesado_comprimido.pdf');
    await simularGuardado(app, [salida]);

    await irA(page, 'comprimir-pdf');
    await subir(page, origen);
    await page.getByRole('radio', { name: 'Compresión máxima' }).click();
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('tabla-comparacion')).toBeVisible({ timeout: 60_000 });
    expect(fs.statSync(salida).size).toBeLessThan(fs.statSync(origen).size * 0.6);
    expect((await textosPorPagina(leer(salida)))[0]).toContain('Texto que debe seguir seleccionable');
    await page.screenshot({ path: 'tests/capturas/comprimir-pdf.png' });
    await app.close();
  });

  test('PDF a PDF/A', async () => {
    const { app, page } = await abrirApp();
    const salida = path.join(dir, 'doc_pdfa.pdf');
    await simularGuardado(app, [salida]);
    await irA(page, 'pdf-a-pdfa');
    await subir(page, escribir('doc.pdf', await crearPdf(2)));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
    const d = await PDFDocument.load(leer(salida));
    expect(d.catalog.lookup(PDFName.of('OutputIntents'), PDFArray).size()).toBeGreaterThan(0);
    await app.close();
  });

  test('si Ghostscript no está, la herramienta lo avisa', async () => {
    const { app, page } = await abrirApp({ PATH: '/nonexistent', PDFREAAAADER_GS: '' });
    await irA(page, 'comprimir-pdf');
    await expect(page.getByTestId('falta-binario')).toContainText('Ghostscript no está disponible');
    await page.screenshot({ path: 'tests/capturas/falta-binario.png' });
    await app.close();
  });
});

test.describe('LibreOffice', () => {
  test.skip(!hayLibreOffice, 'LibreOffice no está instalado');

  test('Word a PDF', async () => {
    const { app, page } = await abrirApp();
    const salida = path.join(dir, 'informe.pdf');
    await simularGuardado(app, [salida]);
    await irA(page, 'word-a-pdf');
    await subir(page, escribir('informe.docx', crearOffice('docx')));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    expect((await textosPorPagina(leer(salida)))[0]).toContain('Informe trimestral de ventas');
    await app.close();
  });

  test('Excel a PDF y PowerPoint a PDF', async () => {
    const { app, page } = await abrirApp();
    const s1 = path.join(dir, 'ventas.pdf');
    await simularGuardado(app, [s1]);
    await irA(page, 'excel-a-pdf');
    await subir(page, escribir('ventas.xlsx', crearOffice('xlsx')));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    expect((await textosPorPagina(leer(s1)))[0]).toContain('Manzanas');

    const s2 = path.join(dir, 'plan.pdf');
    await simularGuardado(app, [s2]);
    await irA(page, 'powerpoint-a-pdf');
    await subir(page, escribir('plan.pptx', crearOffice('pptx')));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    expect(await textosPorPagina(leer(s2))).toHaveLength(2);
    await app.close();
  });

  test('PDF a Word y PDF a PowerPoint', async () => {
    const { app, page } = await abrirApp();
    const pdfDoc = crearPdfDesdeOdf('informe.fodt', `<?xml version="1.0" encoding="UTF-8"?><office:document ${NS_ODF} office:mimetype="application/vnd.oasis.opendocument.text"><office:body><office:text><text:p>Documento de prueba para convertir a Word</text:p></office:text></office:body></office:document>`);
    const o1 = path.join(dir, 'doc.docx');
    await simularGuardado(app, [o1]);
    await irA(page, 'pdf-a-word');
    await subir(page, escribir('doc.pdf', pdfDoc));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    const zip = await JSZip.loadAsync(fs.readFileSync(o1));
    expect((await zip.file('word/document.xml')!.async('string')).replace(/<[^>]+>/g, '')).toContain('Documento de prueba');

    const o2 = path.join(dir, 'doc.pptx');
    await simularGuardado(app, [o2]);
    await irA(page, 'pdf-a-powerpoint');
    await subir(page, path.join(dir, 'doc.pdf'));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    const pz = await JSZip.loadAsync(fs.readFileSync(o2));
    expect(Object.keys(pz.files).some((f) => /^ppt\/slides\/slide1\.xml$/.test(f))).toBe(true);
    await app.close();
  });

  test('PDF a Excel extrae las tablas con el motor propio', async () => {
    const { app, page } = await abrirApp();
    const fods = `<?xml version="1.0" encoding="UTF-8"?><office:document ${NS_ODF} office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet><table:table table:name="V">${[['Producto', 'Unidades', 'Precio'], ['Manzanas', '120', '1,50'], ['Peras', '80', '2,25'], ['Uvas', '45', '3,10']].map((r) => `<table:table-row>${r.map((c) => `<table:table-cell office:value-type="string"><text:p>${c}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}</table:table></office:spreadsheet></office:body></office:document>`;
    const salida = path.join(dir, 'tabla.xlsx');
    await simularGuardado(app, [salida]);
    await irA(page, 'pdf-a-excel');
    await subir(page, escribir('tabla.pdf', crearPdfDesdeOdf('tabla.fods', fods)));
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('notas')).toContainText('1 tabla');
    const zip = await JSZip.loadAsync(fs.readFileSync(salida));
    const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(hoja).toContain('Manzanas');
    expect(hoja).toContain('<v>120</v>');
    expect(hoja).toContain('<v>1.5</v>');
    await page.screenshot({ path: 'tests/capturas/pdf-a-excel.png' });
    await app.close();
  });
});

test.describe('IA de imágenes', () => {
  const recursos = path.resolve('resources');
  const hayModelo = fs.existsSync(path.join(recursos, 'models', 'isnet-general-use.onnx'));
  const hayEsrgan = fs.existsSync(path.join(recursos, 'realesrgan', 'realesrgan-ncnn-vulkan')) || fs.existsSync(path.join(recursos, 'realesrgan', 'realesrgan-ncnn-vulkan.exe'));

  test('Eliminar fondo', async () => {
    test.skip(!hayModelo, 'falta el modelo ISNet en resources/models');
    const { app, page } = await abrirApp();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#d9e4ee"/><circle cx="200" cy="150" r="95" fill="#d2342a"/></svg>`;
    const origen = escribir('bola.jpg', await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer());
    const salida = path.join(dir, 'bola_sin-fondo.png');
    await simularGuardado(app, [salida]);
    await irA(page, 'eliminar-fondo');
    await subir(page, origen);
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 120_000 });
    const { data, info } = await sharp(salida).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[(150 * info.width + 200) * 4 + 3]).toBeGreaterThan(200);
    expect(data[(10 * info.width + 10) * 4 + 3]).toBeLessThan(60);
    await page.screenshot({ path: 'tests/capturas/eliminar-fondo.png' });
    await app.close();
  });

  test('Ampliar x2 con Real-ESRGAN (barra de progreso)', async () => {
    test.skip(!hayEsrgan, 'falta realesrgan en resources/realesrgan');
    test.setTimeout(240_000);
    const { app, page } = await abrirApp();
    const origen = escribir('mini.png', await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3a7bd5' } }).png().toBuffer());
    const salida = path.join(dir, 'mini_x2.png');
    await simularGuardado(app, [salida]);
    await irA(page, 'ampliar');
    await subir(page, origen);
    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 200_000 });
    const m = await sharp(salida).metadata();
    expect([m.width, m.height]).toEqual([80, 60]);
    await app.close();
  });
});
