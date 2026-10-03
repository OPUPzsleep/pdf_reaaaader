import { app, ipcMain } from 'electron';
import path from 'node:path';
import type { PerfilCompresion } from '../../src/types/api';
import { comprimirPdf, estadoBinarios, pdfAPdfA, type RutasExternas } from '../lib/externos';

export function rutasExternas(): RutasExternas {
  return { recursos: app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources') };
}

/** Quita el prefijo «Error invoking remote method» que Electron añade a los errores del proceso principal. */
const limpiar = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

export function registrarExternos() {
  ipcMain.handle('externos:estado', () => estadoBinarios(rutasExternas()));
  ipcMain.handle('externos:comprimir', async (_e, _id: string, datos: Uint8Array, perfil: PerfilCompresion) => {
    try {
      return await comprimirPdf(rutasExternas(), datos, perfil);
    } catch (e) {
      throw limpiar(e);
    }
  });
  ipcMain.handle('externos:pdfa', async (_e, _id: string, datos: Uint8Array) => {
    try {
      return await pdfAPdfA(rutasExternas(), datos);
    } catch (e) {
      throw limpiar(e);
    }
  });
}
