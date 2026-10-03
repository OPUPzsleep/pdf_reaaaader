import { ipcMain } from 'electron';
import { infoImagen, procesarImagen } from '../lib/imagen';
import type { SolicitudImagen } from '../../src/types/api';

export function registrarImagen() {
  ipcMain.handle('imagen:procesar', async (_e, s: SolicitudImagen) => {
    try {
      return await procesarImagen(s.datos, s.operacion);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unsupported image format|Input buffer contains unsupported/i.test(msg)) {
        throw new Error('Formato de imagen no compatible o archivo dañado.');
      }
      throw new Error(msg);
    }
  });
  ipcMain.handle('imagen:info', (_e, datos: Uint8Array) => infoImagen(datos));
}
