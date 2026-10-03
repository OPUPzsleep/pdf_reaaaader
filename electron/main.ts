import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import path from 'node:path';
import { registrarArchivos } from './ipc/files';
import { registrarImagen } from './ipc/image';
import { registrarHtml } from './ipc/html';
import { registrarExternos } from './ipc/externos';
import { registrarIA } from './ipc/ai';

const urlDev = process.env.VITE_DEV_SERVER_URL;
const esDev = !!urlDev;

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
    const interno = urlDev ? url.startsWith(urlDev) : url.startsWith('file://');
    if (!interno) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  if (urlDev) void win.loadURL(urlDev);
  else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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
