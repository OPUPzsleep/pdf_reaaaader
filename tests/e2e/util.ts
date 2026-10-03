import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

export async function abrirApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}

import fs from 'node:fs';
import os from 'node:os';

export function carpetaTemporal(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pdfreaaaader-'));
}

export async function irA(page: Page, id: string) {
  await page.evaluate((i) => {
    location.hash = `#/herramienta/${i}`;
  }, id);
  await page.getByTestId('zona-archivos').first().waitFor();
}

/** Hace que el diálogo "Guardar como" devuelva siempre esta ruta (sin abrir ventana nativa). */
export async function simularGuardado(app: ElectronApplication, rutas: string[]) {
  await app.evaluate(({ dialog }, lista) => {
    const cola = [...lista];
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: cola.shift() ?? cola[0] })) as typeof dialog.showSaveDialog;
  }, rutas);
}

export async function subir(page: Page, rutas: string | string[]) {
  await page.getByTestId('entrada-archivos').first().setInputFiles(rutas);
}
