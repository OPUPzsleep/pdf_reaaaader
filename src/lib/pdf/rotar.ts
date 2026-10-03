import { degrees } from 'pdf-lib';
import { cargarPdf } from './cargar';

export type Giro = 90 | 180 | 270;

/** Gira (sumando al giro existente) todas las páginas, o solo las indicadas (base 0). */
export async function rotarPdf(datos: Uint8Array, grados: Giro, indices?: number[]): Promise<Uint8Array> {
  const doc = await cargarPdf(datos);
  const paginas = doc.getPages();
  const objetivo = indices ? new Set(indices) : null;
  paginas.forEach((p, i) => {
    if (objetivo && !objetivo.has(i)) return;
    const actual = p.getRotation().angle;
    p.setRotation(degrees((((actual + grados) % 360) + 360) % 360));
  });
  return doc.save();
}
