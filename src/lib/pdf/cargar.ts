import { PDFDocument } from 'pdf-lib';

/** Carga un PDF con mensajes de error en español (cifrado, dañado). */
export async function cargarPdf(datos: Uint8Array, nombre = 'el archivo'): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(datos, { updateMetadata: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/encrypt/i.test(msg)) {
      throw new Error(`${nombre} está protegido con contraseña. Quita la protección antes de usarlo.`);
    }
    throw new Error(`No se pudo leer ${nombre}: no parece un PDF válido o está dañado.`);
  }
}

export async function contarPaginas(datos: Uint8Array): Promise<number> {
  return (await cargarPdf(datos)).getPageCount();
}
