import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { crearPdf, textosPorPagina } from '../util/pdfs';

const dir = carpetaTemporal();
const escribir = (nombre: string, datos: Uint8Array | Buffer) => {
  const ruta = path.join(dir, nombre);
  fs.writeFileSync(ruta, datos);
  return ruta;
};
const leer = (ruta: string) => new Uint8Array(fs.readFileSync(ruta));

test('Unir: respeta el orden y guarda el PDF', async () => {
  const { app, page } = await abrirApp();
  const a = escribir('a.pdf', await crearPdf(2, { texto: (i) => `A${i}` }));
  const b = escribir('b.pdf', await crearPdf(1, { texto: () => 'B1' }));
  const salida = path.join(dir, 'unido.pdf');
  await simularGuardado(app, [salida]);

  await irA(page, 'unir');
  await subir(page, [a, b]);
  await expect(page.getByTestId('fila-orden')).toHaveCount(2);
  // Subir B antes que A con el botón "Subir" de la segunda fila
  await page.getByTestId('fila-orden').nth(1).getByRole('button', { name: 'Subir' }).click();
  await page.getByRole('button', { name: /Unir 2 PDF/ }).click();
  await expect(page.getByTestId('resultado')).toContainText('Archivo guardado');
  expect(await textosPorPagina(leer(salida))).toEqual(['B1', 'A1', 'A2']);
  await page.screenshot({ path: 'tests/capturas/unir.png' });
  await app.close();
});

test('Dividir: rangos → ZIP con un PDF por rango', async () => {
  const { app, page } = await abrirApp();
  const origen = escribir('seis.pdf', await crearPdf(6));
  const salida = path.join(dir, 'dividido.zip');
  await simularGuardado(app, [salida]);

  await irA(page, 'dividir');
  await subir(page, origen);
  await page.getByTestId('campo-rangos').fill('1-2, 5');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('2 archivos PDF');
  const zip = await JSZip.loadAsync(fs.readFileSync(salida));
  expect(Object.keys(zip.files).sort()).toEqual(['seis_p1-2.pdf', 'seis_p5.pdf']);
  const p5 = await zip.file('seis_p5.pdf')!.async('uint8array');
  expect(await textosPorPagina(p5)).toEqual(['Página 5']);
  await app.close();
});

test('Dividir: rango inválido muestra el error en español', async () => {
  const { app, page } = await abrirApp();
  await irA(page, 'dividir');
  await subir(page, escribir('tres.pdf', await crearPdf(3)));
  await page.getByTestId('campo-rangos').fill('9');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('error')).toContainText('no existe');
  await app.close();
});

test('Eliminar páginas: por rango y por clic en miniatura', async () => {
  const { app, page } = await abrirApp();
  const origen = escribir('cinco.pdf', await crearPdf(5));
  const salida = path.join(dir, 'sin.pdf');
  await simularGuardado(app, [salida]);

  await irA(page, 'eliminar-paginas');
  await subir(page, origen);
  await expect(page.getByTestId('miniatura-pagina')).toHaveCount(5);
  await page.getByTestId('campo-rango').fill('2-3');
  await expect(page.getByTestId('miniatura-pagina').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('miniatura-pagina').nth(4).click(); // añade la 5 con un clic
  await expect(page.getByTestId('campo-rango')).toHaveValue('2-3, 5');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('2 páginas restantes');
  expect(await textosPorPagina(leer(salida))).toEqual(['Página 1', 'Página 4']);
  await page.screenshot({ path: 'tests/capturas/eliminar-paginas.png' });
  await app.close();
});

test('Eliminar páginas: vista previa emergente de la página que se elimina', async () => {
  const { app, page } = await abrirApp();
  const origen = escribir('seis.pdf', await crearPdf(6));
  const salida = path.join(dir, 'sin-previa.pdf');
  await simularGuardado(app, [salida]);

  await irA(page, 'eliminar-paginas');
  await subir(page, origen);
  const miniaturas = page.getByTestId('miniatura-pagina');
  await expect(miniaturas).toHaveCount(6);
  const vista = page.getByTestId('vista-pagina');

  // La lupa de la miniatura abre la página en grande, ya dibujada, sin marcarla
  await page.getByTestId('ver-pagina').nth(2).click();
  await expect(vista).toBeVisible();
  await expect(vista).toContainText('Página 3 de 6');
  await expect(page.getByTestId('vista-estado')).toHaveText('Se conservará');
  await expect(page.getByTestId('vista-lienzo')).not.toHaveClass(/cargando/);
  const caja = await page.getByTestId('vista-lienzo').boundingBox();
  expect(caja!.width).toBeGreaterThan(300); // mucho mayor que la miniatura de 130 px
  await expect(miniaturas.nth(2)).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: 'tests/capturas/vista-previa-pagina.png' });

  // Desde la ventana se marca la página y se navega con las flechas del teclado
  await page.getByTestId('vista-alternar').click();
  await expect(page.getByTestId('vista-estado')).toHaveText('Se eliminará');
  await expect(page.getByTestId('vista-alternar')).toContainText('No eliminar esta página');
  await expect(miniaturas.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'tests/capturas/vista-previa-eliminar.png' });
  await page.keyboard.press('ArrowRight');
  await expect(vista).toContainText('Página 4 de 6');
  await expect(page.getByTestId('vista-estado')).toHaveText('Se conservará');
  await page.getByTestId('vista-anterior').click();
  await expect(vista).toContainText('Página 3 de 6');
  await expect(page.getByTestId('vista-estado')).toHaveText('Se eliminará');

  // Esc cierra y la selección se mantiene
  await page.keyboard.press('Escape');
  await expect(vista).toHaveCount(0);
  await expect(page.getByTestId('campo-rango')).toHaveValue('3');

  // «Revisar selección» recorre solo las páginas elegidas
  await page.getByTestId('campo-rango').fill('2, 5');
  await page.getByTestId('revisar-seleccion').click();
  await expect(vista).toContainText('Página 2 de 6');
  await expect(vista).toContainText('1 de 2');
  await page.getByTestId('vista-siguiente').click();
  await expect(vista).toContainText('Página 5 de 6');
  await expect(page.getByTestId('vista-siguiente')).toBeDisabled();
  await page.getByTestId('vista-cerrar').click();
  await expect(vista).toHaveCount(0);

  // La opción se recuerda entre sesiones: pase lo que pase, se deja como estaba para no afectar a las demás pruebas
  const alClic = page.getByLabel('Ver la página en grande al hacer clic en una miniatura');
  try {
    // Con la opción activada, el clic en la miniatura abre la vista previa en vez de marcar
    await alClic.check();
    await miniaturas.nth(0).click();
    await expect(vista).toContainText('Página 1 de 6');
    await expect(miniaturas.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('vista-alternar').click();
    await expect(miniaturas.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('campo-rango')).toHaveValue('1-2, 5');

    await page.getByTestId('accion').click();
    await expect(page.getByTestId('resultado')).toContainText('3 páginas restantes');
    expect(await textosPorPagina(leer(salida))).toEqual(['Página 3', 'Página 4', 'Página 6']);
  } finally {
    await alClic.uncheck();
  }
  await app.close();
});

test('Extraer páginas', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'extraido.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'extraer-paginas');
  await subir(page, escribir('cuatro.pdf', await crearPdf(4)));
  await page.getByTestId('campo-rango').fill('4, 1');
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  expect(await textosPorPagina(leer(salida))).toEqual(['Página 1', 'Página 4']);
  await app.close();
});

test('Ordenar: girar, eliminar y reordenar páginas', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'ordenado.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'ordenar');
  await subir(page, escribir('tres-ord.pdf', await crearPdf(3)));
  await expect(page.getByTestId('celda-pagina')).toHaveCount(3);
  const celdas = page.getByTestId('celda-pagina');
  await celdas.nth(0).getByRole('button', { name: 'Girar a la derecha' }).click();
  await celdas.nth(1).getByRole('button', { name: 'Eliminar página' }).click();
  await expect(celdas).toHaveCount(2);
  // Arrastrar la primera sobre la segunda
  const a = await celdas.nth(0).boundingBox();
  const b = await celdas.nth(1).boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + 30);
  await page.mouse.down();
  await page.mouse.move(a!.x + a!.width / 2 + 40, a!.y + 40, { steps: 5 });
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.screenshot({ path: 'tests/capturas/ordenar.png' });
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('2 páginas');
  const doc = await PDFDocument.load(leer(salida));
  expect(doc.getPageCount()).toBe(2);
  expect(await textosPorPagina(leer(salida))).toEqual(['Página 3', 'Página 1']);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90]);
  await app.close();
});

test('Rotar PDF', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'girado.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'rotar');
  await subir(page, escribir('r.pdf', await crearPdf(2)));
  await page.getByRole('radio', { name: '180°' }).click();
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const doc = await PDFDocument.load(leer(salida));
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([180, 180]);
  await app.close();
});

test('Números de página: vista previa y resultado', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'numerado.pdf');
  await simularGuardado(app, [salida]);
  await irA(page, 'numeros-de-pagina');
  await subir(page, escribir('n.pdf', await crearPdf(3)));
  await page.getByRole('radio', { name: 'Página n de N' }).click();
  await page.getByTestId('pos-sup-der').click();
  await expect(page.locator('.columna-vista canvas')).toBeVisible();
  await page.screenshot({ path: 'tests/capturas/numeros.png' });
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toBeVisible();
  const t = await textosPorPagina(leer(salida));
  expect(t[0]).toContain('Página 1 de 3');
  expect(t[2]).toContain('Página 3 de 3');
  await app.close();
});

test('JPG a PDF', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'imagenes.pdf');
  await simularGuardado(app, [salida]);
  const jpg = escribir('foto.jpg', await sharp({ create: { width: 300, height: 200, channels: 3, background: '#cc3333' } }).jpeg().toBuffer());
  const png = escribir('logo.png', await sharp({ create: { width: 100, height: 100, channels: 4, background: '#33cc33' } }).png().toBuffer());
  const webp = escribir('web.webp', await sharp({ create: { width: 120, height: 80, channels: 3, background: '#3333cc' } }).webp().toBuffer());
  await irA(page, 'jpg-a-pdf');
  await subir(page, [jpg, png, webp]);
  await expect(page.getByTestId('fila-orden')).toHaveCount(3);
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('3 imágenes');
  expect((await PDFDocument.load(leer(salida))).getPageCount()).toBe(3);
  await app.close();
});

test('PDF a JPG: una imagen por página dentro de un ZIP', async () => {
  const { app, page } = await abrirApp();
  const salida = path.join(dir, 'paginas.zip');
  await simularGuardado(app, [salida]);
  await irA(page, 'pdf-a-jpg');
  await subir(page, escribir('p3.pdf', await crearPdf(3)));
  await page.getByRole('radio', { name: '72', exact: true }).click();
  await page.getByTestId('accion').click();
  await expect(page.getByTestId('resultado')).toContainText('3 imágenes');
  const zip = await JSZip.loadAsync(fs.readFileSync(salida));
  expect(Object.keys(zip.files).sort()).toEqual(['p3_pagina-01.jpg', 'p3_pagina-02.jpg', 'p3_pagina-03.jpg']);
  const meta = await sharp(await zip.file('p3_pagina-01.jpg')!.async('nodebuffer')).metadata();
  expect([meta.width, meta.height]).toEqual([300, 400]);
  await app.close();
});
