import { PDFDocument } from 'pdf-lib';
import { cargarPdf } from './cargar';

export interface EntradaPdf {
  nombre: string;
  datos: Uint8Array;
}

export async function unirPdfs(entradas: EntradaPdf[], alProgreso?: (f: number) => void): Promise<Uint8Array> {
  if (entradas.length < 2) throw new Error('Elige al menos dos PDF para unir.');
  const salida = await PDFDocument.create();
  for (let i = 0; i < entradas.length; i++) {
    const origen = await cargarPdf(entradas[i].datos, entradas[i].nombre);
    const paginas = await salida.copyPages(origen, origen.getPageIndices());
    paginas.forEach((p) => salida.addPage(p));
    alProgreso?.((i + 1) / entradas.length);
  }
  return salida.save();
}
