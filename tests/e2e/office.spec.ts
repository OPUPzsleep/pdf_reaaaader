import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { textosPorPagina } from '../util/pdfs';
import { FIXTURES } from '../util/ooxml';

const dir = carpetaTemporal();
const leer = (r: string) => new Uint8Array(fs.readFileSync(r));
const fixture = (n: string) => path.join(FIXTURES, n);

test('Word a PDF con el motor propio: páginas A4 y apaisada, texto y pie con numeración', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'informe.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'word-a-pdf');
  await expect(page.getByTestId('falta-binario')).toHaveCount(0);
  await subir(page, fixture('informe.docx'));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
  const pdf = leer(salida);
  const textos = await textosPorPagina(pdf);
  expect(textos).toHaveLength(4);
  expect(textos[0]).toContain('Informe trimestral de ventas');
  expect(textos[0]).toContain('Informe confidencial');
  expect(textos[0]).toContain('Página 1 de 4');
  expect(textos[3]).toContain('Página 4 de 4');
  expect(textos[1]).toContain('Índice con tabulador');
  const doc = await PDFDocument.load(pdf);
  const [a, b] = [doc.getPage(0).getSize(), doc.getPage(3).getSize()];
  expect(Math.round(a.width)).toBe(595);
  expect(Math.round(a.height)).toBe(842);
  expect(Math.round(b.width)).toBe(842); // la última sección es apaisada
  await page.screenshot({ path: 'tests/capturas/word-a-pdf.png' });
  await app.close();
});

test('Excel a PDF: formatos de número y fecha, y CSV', async () => {
  const { app, page } = await abrirApp();
  const s1 = path.join(dir, 'libro.pdf');
  await simularGuardado(app, [s1]);
  await irA(page, 'excel-a-pdf');
  await subir(page, fixture('libro.xlsx'));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
  const t = (await textosPorPagina(leer(s1))).join('\n');
  for (const s of ['Informe de ventas 2024', '15/01/2024', '1.234.567', '13,00 €', '25,5%', 'VERDADERO']) expect(t).toContain(s);

  const csv = path.join(dir, 'datos.csv');
  fs.writeFileSync(csv, 'Nombre;Importe\nAna;1.250,50\n"Luis; el grande";980\n');
  const s2 = path.join(dir, 'datos.pdf');
  await simularGuardado(app, [s2]);
  await irA(page, 'excel-a-pdf');
  await subir(page, csv);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
  const t2 = (await textosPorPagina(leer(s2))).join('\n');
  expect(t2).toContain('Luis; el grande');
  expect(t2).toContain('1.250,50');
  await app.close();
});

test('PowerPoint a PDF: una página por diapositiva con el tamaño de la presentación', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'presentacion.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'powerpoint-a-pdf');
  await subir(page, fixture('presentacion.pptx'));
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible({ timeout: 60_000 });
  const pdf = leer(salida);
  const textos = await textosPorPagina(pdf);
  expect(textos).toHaveLength(5);
  expect(textos[0]).toContain('Plan de lanzamiento');
  expect(textos[1]).toContain('Reforzar la marca');
  expect(textos[4]).toContain('¡Gracias!');
  const doc = await PDFDocument.load(pdf);
  expect(Math.round(doc.getPage(0).getSize().width)).toBe(960);
  expect(Math.round(doc.getPage(0).getSize().height)).toBe(540);
  await page.screenshot({ path: 'tests/capturas/powerpoint-a-pdf.png' });
  await app.close();
});

test('los formatos antiguos (.doc) se explican en pantalla', async () => {
  const { app, page } = await abrirApp();
  const viejo = path.join(dir, 'viejo.doc');
  fs.writeFileSync(viejo, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]));
  await simularGuardado(app, [path.join(dir, 'viejo.pdf')]);
  await irA(page, 'word-a-pdf');
  await subir(page, viejo);
  await page.getByTestId('accion').click();
  await expect(page.getByRole('alert')).toContainText('guárdalo como .docx');
  await app.close();
});
