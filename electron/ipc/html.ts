import { BrowserWindow, ipcMain } from 'electron';
import sharp, { type Sharp } from 'sharp';
import type { SolicitudHtml } from '../../src/types/api';

const MAX_ALTO = 60_000;
const TROZO = 8_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Abre el contenido en una ventana oculta y aislada (sin Node, con sandbox) y ejecuta `fn`. */
async function conVentana<T>(origen: SolicitudHtml['origen'], ancho: number, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    width: ancho,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let fallo: string | null = null;
    win.webContents.once('did-fail-load', (_e, codigo, descripcion, url, principal) => {
      if (principal && codigo !== -3) fallo = `${descripcion} (${url})`;
    });
    const carga =
      origen.tipo === 'url'
        ? win.loadURL(origen.url)
        : origen.tipo === 'archivo'
          ? win.loadFile(origen.ruta)
          : win.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(origen.html, 'utf8').toString('base64'));
    await Promise.race([
      carga,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('La página tardó demasiado en cargar (60 s).')), 60_000)),
    ]).catch((e) => {
      throw new Error(fallo ? `No se pudo cargar la página: ${fallo}` : e instanceof Error ? e.message : String(e));
    });
    // Fuentes e imágenes diferidas
    await win.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true').catch(() => undefined);
    await esperar(400);
    return await fn(win);
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function validarOrigen(o: SolicitudHtml['origen']) {
  if (o.tipo === 'url' && !/^https?:\/\//i.test(o.url.trim())) {
    throw new Error('La dirección debe empezar por http:// o https://');
  }
  if (o.tipo === 'html' && !o.html.trim()) throw new Error('Pega el código HTML o elige un archivo.');
}

export async function htmlAPdf(s: SolicitudHtml): Promise<Uint8Array> {
  validarOrigen(s.origen);
  const op = s.pdf ?? { tamano: 'A4', horizontal: false, margenMm: 10, fondos: true };
  const m = op.margenMm / 25.4;
  return conVentana(s.origen, 1024, async (win) => {
    const buf = await win.webContents.printToPDF({
      pageSize: op.tamano,
      landscape: op.horizontal,
      printBackground: op.fondos,
      margins: { top: m, bottom: m, left: m, right: m },
      preferCSSPageSize: false,
    });
    return new Uint8Array(buf);
  });
}

export async function htmlAImagen(s: SolicitudHtml): Promise<Uint8Array> {
  validarOrigen(s.origen);
  const op = s.imagen ?? { ancho: 1280, formato: 'png', calidad: 90 };
  const ancho = Math.max(320, Math.min(4000, Math.round(op.ancho)));
  return conVentana(s.origen, ancho, async (win) => {
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    try {
      const alto = Math.min(
        MAX_ALTO,
        Math.max(
          100,
          Number(
            await win.webContents.executeJavaScript(
              'Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)',
            ),
          ),
        ),
      );
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: ancho, height: Math.min(alto, 2000), deviceScaleFactor: 1, mobile: false });
      await esperar(150);
      const trozos: { top: number; buf: Buffer }[] = [];
      for (let y = 0; y < alto; y += TROZO) {
        const h = Math.min(TROZO, alto - y);
        const r = (await dbg.sendCommand('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          fromSurface: true,
          clip: { x: 0, y, width: ancho, height: h, scale: 1 },
        })) as { data: string };
        trozos.push({ top: y, buf: Buffer.from(r.data, 'base64') });
      }
      let img: Sharp;
      if (trozos.length === 1) {
        img = sharp(trozos[0].buf);
      } else {
        img = sharp({ create: { width: ancho, height: alto, channels: 4, background: '#ffffff' } }).composite(
          trozos.map((t) => ({ input: t.buf, left: 0, top: t.top })),
        );
      }
      const out = op.formato === 'jpeg' ? img.flatten({ background: '#ffffff' }).jpeg({ quality: op.calidad, mozjpeg: true }) : img.png();
      return new Uint8Array(await out.toBuffer());
    } finally {
      try {
        dbg.detach();
      } catch {
        /* ya cerrado */
      }
    }
  });
}

export function registrarHtml() {
  ipcMain.handle('html:pdf', (_e, s: SolicitudHtml) => htmlAPdf(s));
  ipcMain.handle('html:imagen', (_e, s: SolicitudHtml) => htmlAImagen(s));
}
