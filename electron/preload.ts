import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PdfreaaaaderApi, ProgresoEvento } from '../src/types/api';

const api: PdfreaaaaderApi = {
  esElectron: true,
  version: ipcRenderer.sendSync('app:version') as string,
  guardarArchivo: (op) => ipcRenderer.invoke('archivo:guardar', op),
  mostrarEnCarpeta: (ruta) => ipcRenderer.invoke('archivo:mostrar', ruta),
  rutaDeArchivo: (file) => webUtils.getPathForFile(file),
  imagen: {
    procesar: (s) => ipcRenderer.invoke('imagen:procesar', s),
    info: (datos) => ipcRenderer.invoke('imagen:info', datos),
  },
  html: {
    aPdf: (s) => ipcRenderer.invoke('html:pdf', s),
    aImagen: (s) => ipcRenderer.invoke('html:imagen', s),
  },
  externos: {
    estado: () => ipcRenderer.invoke('externos:estado'),
    comprimirPdf: (id, datos, perfil) => ipcRenderer.invoke('externos:comprimir', id, datos, perfil),
    pdfAPdfA: (id, datos) => ipcRenderer.invoke('externos:pdfa', id, datos),
    officeAPdf: (id, datos, ext) => ipcRenderer.invoke('externos:office-a-pdf', id, datos, ext),
    pdfAOffice: (id, datos, destino) => ipcRenderer.invoke('externos:pdf-a-office', id, datos, destino),
  },
  ia: {
    quitarFondo: (id, datos) => ipcRenderer.invoke('ia:quitar-fondo', id, datos),
    ampliar: (id, datos, escala, tipo) => ipcRenderer.invoke('ia:ampliar', id, datos, escala, tipo),
  },
  alProgreso(cb) {
    const handler = (_: unknown, e: ProgresoEvento) => cb(e);
    ipcRenderer.on('progreso', handler);
    return () => ipcRenderer.removeListener('progreso', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
