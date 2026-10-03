import { PDFDocument } from 'pdf-lib';
import { cargarPdf } from './cargar';
import { parsearGrupos } from './rangos';

export type ModoDivision =
  | { tipo: 'rangos'; texto: string }
  | { tipo: 'cada'; n: number }
  | { tipo: 'una' };

export interface Parte {
  /** Sufijo para el nombre del archivo: "p1-3", "p5"… */
  etiqueta: string;
  datos: Uint8Array;
}

async function crearParte(origen: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const salida = await PDFDocument.create();
  const copiadas = await salida.copyPages(origen, indices);
  copiadas.forEach((p) => salida.addPage(p));
  return salida.save();
}

function etiquetaDe(indices: number[]): string {
  const a = indices[0] + 1;
  const b = indices[indices.length - 1] + 1;
  return a === b ? `p${a}` : `p${a}-${b}`;
}

export async function dividirPdf(datos: Uint8Array, modo: ModoDivision, alProgreso?: (f: number) => void): Promise<Parte[]> {
  const origen = await cargarPdf(datos);
  const total = origen.getPageCount();
  let grupos: number[][];
  if (modo.tipo === 'rangos') {
    grupos = parsearGrupos(modo.texto, total);
  } else if (modo.tipo === 'cada') {
    const n = Math.floor(modo.n);
    if (!(n >= 1)) throw new Error('El número de páginas por parte debe ser 1 o más.');
    grupos = [];
    for (let i = 0; i < total; i += n) grupos.push(Array.from({ length: Math.min(n, total - i) }, (_, k) => i + k));
  } else {
    grupos = Array.from({ length: total }, (_, i) => [i]);
  }
  const partes: Parte[] = [];
  for (let i = 0; i < grupos.length; i++) {
    partes.push({ etiqueta: etiquetaDe(grupos[i]), datos: await crearParte(origen, grupos[i]) });
    alProgreso?.((i + 1) / grupos.length);
  }
  return partes;
}
