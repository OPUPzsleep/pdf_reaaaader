// Arranca Vite, compila el proceso principal en modo watch y abre Electron cuando Vite responde.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const URL_DEV = 'http://localhost:5173';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const hijos = [];

function lanzar(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === npx, ...opts });
  hijos.push(p);
  return p;
}

lanzar(npx, ['vite']);
lanzar('node', ['scripts/build-electron.mjs', '--watch']);

async function esperarVite() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(URL_DEV);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Vite no respondió a tiempo');
}

await esperarVite();
const el = lanzar(electronBin, ['.'], { env: { ...process.env, VITE_DEV_SERVER_URL: URL_DEV } });
el.on('exit', () => {
  for (const h of hijos) h.kill();
  process.exit(0);
});
