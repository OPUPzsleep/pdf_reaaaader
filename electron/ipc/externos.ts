import { app, ipcMain } from 'electron';
import path from 'node:path';
import type { DestinoOffice, PerfilCompresion } from '../../src/types/api';
import { comprimirPdf, estadoBinarios, officeAPdf, pdfAOffice, pdfAPdfA, type RutasExternas } from '../lib/externos';

export function rutasExternas(): RutasExternas {
  return { recursos: app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources') };
}

const perfilLibreOffice = () => path.join(app.getPath('userData'), 'perfil-libreoffice');

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
  ipcMain.handle('externos:office-a-pdf', async (_e, _id: string, datos: Uint8Array, extension: string) => {
    try {
      return await officeAPdf(rutasExternas(), perfilLibreOffice(), datos, extension);
    } catch (e) {
      throw limpiar(e);
    }
  });
  ipcMain.handle('externos:pdf-a-office', async (_e, _id: string, datos: Uint8Array, destino: DestinoOffice) => {
    try {
      return await pdfAOffice(rutasExternas(), perfilLibreOffice(), datos, destino);
    } catch (e) {
      throw limpiar(e);
    }
  });
}
