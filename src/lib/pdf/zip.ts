import JSZip from 'jszip';

export interface ArchivoZip {
  nombre: string;
  datos: Uint8Array;
}

/** Empaqueta archivos en un ZIP (los PDF/JPG ya vienen comprimidos, se almacenan sin recomprimir). */
export async function crearZip(archivos: ArchivoZip[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const usados = new Set<string>();
  for (const a of archivos) {
    let nombre = a.nombre;
    let n = 2;
    while (usados.has(nombre)) nombre = a.nombre.replace(/(\.[^.]+)?$/, ` (${n++})$1`);
    usados.add(nombre);
    zip.file(nombre, a.datos, { binary: true });
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}
