import { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registrarArchivos } from './ipc/files';
import { registrarImagen } from './ipc/image';
import { registrarHtml } from './ipc/html';
import { registrarExternos } from './ipc/externos';
import { registrarIA } from './ipc/ai';

const urlDev = process.env.VITE_DEV_SERVER_URL;
const esDev = !!urlDev;
const ORIGEN_APP = 'app://local';

// La versión empaquetada se sirve por un esquema propio (app://) en vez de file://, para que
// funcionen fetch, workers y wasm (pdf.js, tesseract.js, onnxruntime) como en un sitio web normal.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function servirApp() {
  const raiz = path.join(__dirname, '..', 'dist');
  protocol.handle('app', (peticion) => {
    const url = new URL(peticion.url);
    let ruta = decodeURIComponent(url.pathname);
    if (ruta === '/' || ruta === '') ruta = '/index.html';
    const absoluta = path.normalize(path.join(raiz, ruta));
    if (!absoluta.startsWith(raiz)) return new Response('Prohibido', { status: 403 });
    return net.fetch(pathToFileURL(absoluta).toString());
  });
}

function crearVentana() {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 920,
    minHeight: 620,
    show: false,
    title: 'pdfreaaaader',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Los enlaces externos se abren en el navegador del sistema, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const interno = urlDev ? url.startsWith(urlDev) : url.startsWith(ORIGEN_APP);
    if (!interno) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  if (urlDev) void win.loadURL(urlDev);
  else void win.loadURL(`${ORIGEN_APP}/index.html`);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  ipcMain.on('app:version', (e) => {
    e.returnValue = app.getVersion();
  });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(
      esDev
        ? Menu.buildFromTemplate([
            { label: 'Archivo', submenu: [{ role: 'quit', label: 'Salir' }] },
            { label: 'Ver', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
          ])
        : null,
    );
    if (!esDev) servirApp();
    registrarArchivos();
    registrarImagen();
    registrarHtml();
    registrarExternos();
    registrarIA();
    crearVentana();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) crearVentana();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
