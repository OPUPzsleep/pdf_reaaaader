import { test, expect } from '@playwright/test';
import { abrirApp } from './util';

test('home: tarjetas, buscador y tema claro/oscuro', async () => {
  const { app, page } = await abrirApp();
  await page.setViewportSize({ width: 1320, height: 840 });

  await expect(page.getByRole('heading', { level: 1 })).toContainText('sin conexión');
  await expect(page.getByTestId('tarjeta-unir')).toBeVisible();
  await expect(page.getByTestId('tarjeta-pdf-a-epub')).toBeVisible();

  // Captura en cada tema (el inicial depende de la preferencia del sistema)
  const html = page.locator('html');
  const inicial = await html.getAttribute('data-theme');
  await page.screenshot({ path: `tests/capturas/home-${inicial === 'light' ? 'claro' : 'oscuro'}.png` });
  await page.getByTestId('alternar-tema').click();
  const cambiado = await html.getAttribute('data-theme');
  expect(cambiado).not.toBe(inicial);
  await page.screenshot({ path: `tests/capturas/home-${cambiado === 'light' ? 'claro' : 'oscuro'}.png` });

  // El tema se recuerda tras recargar
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', cambiado!);

  // Buscador
  await page.getByLabel('Buscar herramienta').fill('epub');
  await expect(page.getByRole('option', { name: /PDF a EPUB/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/herramienta\/pdf-a-epub/);

  await app.close();
});
