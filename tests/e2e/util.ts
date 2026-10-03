import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';

export async function abrirApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: path.resolve(process.cwd()),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page };
}
