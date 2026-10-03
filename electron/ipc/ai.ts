import { ipcMain } from 'electron';
import { ampliar, quitarFondo } from '../lib/ia';
import { rutasExternas } from './externos';

export function registrarIA() {
  ipcMain.handle('ia:quitar-fondo', async (e, id: string, datos: Uint8Array) => {
    e.sender.send('progreso', { id, fraccion: -1, mensaje: 'Quitando el fondo…' });
    return quitarFondo(rutasExternas(), datos);
  });
  ipcMain.handle('ia:ampliar', async (e, id: string, datos: Uint8Array, escala: 2 | 3 | 4, tipo: 'foto' | 'ilustracion') =>
    ampliar(rutasExternas(), datos, escala, tipo, (fraccion) => {
      if (!e.sender.isDestroyed()) e.sender.send('progreso', { id, fraccion, mensaje: `Ampliando… ${Math.round(fraccion * 100)} %` });
    }),
  );
}
