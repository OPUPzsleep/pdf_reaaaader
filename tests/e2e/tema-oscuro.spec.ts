import { test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { abrirApp, carpetaTemporal, irA, simularGuardado, subir } from './util';
import { crearPdf } from '../util/pdfs';

// Capturas de varias herramientas en tema oscuro para revisarlas a ojo (no hay aserciones)
test('capturas en tema oscuro', async () => {
  const { app, page } = await abrirApp();
  await page.setViewportSize({ width: 1320, height: 900 });
  await page.evaluate(() => localStorage.setItem('pdfreaaaader-tema', 'oscuro'));
  await page.reload();
  const dir = carpetaTemporal();
  const pdf = path.join(dir, 'doc.pdf');
  fs.writeFileSync(pdf, await crearPdf(6));
  await simularGuardado(app, [path.join(dir, 'x.pdf')]);
  for (const id of ['eliminar-paginas', 'dividir', 'rotar', 'comprimir-pdf', 'pdf-a-excel']) {
    await irA(page, id);
    await subir(page, pdf);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `tests/capturas/oscuro-${id}.png` });
  }
  await page.evaluate(() => (location.hash = '#/'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/capturas/oscuro-home.png' });
  await app.close();
});
