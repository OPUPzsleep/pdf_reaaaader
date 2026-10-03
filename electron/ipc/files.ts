import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GuardarOpciones, ResultadoGuardar } from '../../src/types/api';

export function registrarArchivos() {
  ipcMain.handle('archivo:guardar', async (e, op: GuardarOpciones): Promise<ResultadoGuardar> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const ext = path.extname(op.nombrePorDefecto).replace('.', '');
    const filtros = op.filtros ?? (ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined);
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: op.nombrePorDefecto,
      filters: filtros,
    });
    if (r.canceled || !r.filePath) return { guardado: false };
    await fs.writeFile(r.filePath, Buffer.from(op.datos));
    return { guardado: true, ruta: r.filePath };
  });

  ipcMain.handle('archivo:mostrar', (_e, ruta: string) => {
    shell.showItemInFolder(ruta);
  });
}
