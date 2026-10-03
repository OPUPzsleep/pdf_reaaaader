import { PDFDocument, degrees } from 'pdf-lib';
import { cargarPdf } from './cargar';

/** Conserva solo las páginas indicadas (índices base 0), en el orden dado. */
export async function extraerPaginas(datos: Uint8Array, indices: number[]): Promise<Uint8Array> {
  if (indices.length === 0) throw new Error('Elige al menos una página.');
  const origen = await cargarPdf(datos);
  const salida = await PDFDocument.create();
  const copiadas = await salida.copyPages(origen, indices);
  copiadas.forEach((p) => salida.addPage(p));
  return salida.save();
}

/** Elimina las páginas indicadas (índices base 0). */
export async function eliminarPaginas(datos: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const origen = await cargarPdf(datos);
  const total = origen.getPageCount();
  const quitar = new Set(indices);
  if (quitar.size === 0) throw new Error('Elige al menos una página para eliminar.');
  if (quitar.size >= total) throw new Error('No puedes eliminar todas las páginas del PDF.');
  const conservar = origen.getPageIndices().filter((i) => !quitar.has(i));
  return extraerPaginas(datos, conservar);
}

export interface PasoOrden {
  /** Posición del PDF de origen dentro de `fuentes` */
  fuente: number;
  /** Página de origen (base 0) */
  pagina: number;
  /** Giro adicional en grados (múltiplo de 90) */
  rotacion: number;
}

/** Construye un PDF nuevo siguiendo el plan: reordenar, girar, borrar y mezclar páginas de varios PDF. */
export async function reordenarPaginas(fuentes: Uint8Array[], plan: PasoOrden[]): Promise<Uint8Array> {
  if (plan.length === 0) throw new Error('El PDF resultante no tendría páginas.');
  const docs = await Promise.all(fuentes.map((f) => cargarPdf(f)));
  const salida = await PDFDocument.create();
  for (const paso of plan) {
    const [pagina] = await salida.copyPages(docs[paso.fuente], [paso.pagina]);
    if (paso.rotacion % 360 !== 0) {
      const actual = pagina.getRotation().angle;
      pagina.setRotation(degrees((((actual + paso.rotacion) % 360) + 360) % 360));
    }
    salida.addPage(pagina);
  }
  return salida.save();
}
