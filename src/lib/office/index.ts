// Punto de entrada de los conversores de Office propios (sin LibreOffice ni Microsoft Office).
import { Paquete } from './comun';
import { csvAHtml } from './csv';
import { docxAHtml, type ResultadoOffice } from './docx';
import { pptxAHtml } from './pptx';
import { xlsxAHtml } from './xlsx';

export type { ResultadoOffice } from './docx';
export type TipoOffice = 'word' | 'excel' | 'powerpoint';

const POR_EXTENSION: Record<string, TipoOffice> = {
  docx: 'word', docm: 'word', dotx: 'word', dotm: 'word',
  xlsx: 'excel', xlsm: 'excel', xltx: 'excel', xltm: 'excel', csv: 'excel',
  pptx: 'powerpoint', pptm: 'powerpoint', ppsx: 'powerpoint', potx: 'powerpoint',
};

const ANTIGUOS: Record<string, string> = { doc: 'Word (.doc)', xls: 'Excel (.xls)', ppt: 'PowerPoint (.ppt)', rtf: 'RTF', odt: 'OpenDocument (.odt)', ods: 'OpenDocument (.ods)', odp: 'OpenDocument (.odp)' };

export const EXTENSIONES_OFFICE: Record<TipoOffice, string[]> = {
  word: ['docx', 'docm', 'dotx', 'doc', 'rtf', 'odt'],
  excel: ['xlsx', 'xlsm', 'xltx', 'csv', 'xls', 'ods'],
  powerpoint: ['pptx', 'pptm', 'ppsx', 'potx', 'ppt', 'odp'],
};

const extensionDe = (nombre: string) => (nombre.split('.').pop() ?? '').toLowerCase();

/** Convierte un documento de Word, Excel o PowerPoint en un HTML listo para imprimir a PDF. */
export async function officeAHtml(datos: Uint8Array, nombre: string, esperado?: TipoOffice): Promise<ResultadoOffice> {
  const ext = extensionDe(nombre);
  const ole = datos.length > 8 && datos[0] === 0xd0 && datos[1] === 0xcf && datos[2] === 0x11 && datos[3] === 0xe0;
  const antiguo = ANTIGUOS[ext];
  if (antiguo || ole) {
    const sugerencia = ext === 'doc' ? '.docx' : ext === 'xls' ? '.xlsx' : ext === 'ppt' ? '.pptx' : ext === 'odt' ? '.docx' : ext === 'ods' ? '.xlsx' : ext === 'odp' ? '.pptx' : 'el formato actual (.docx, .xlsx o .pptx)';
    throw new Error(`«${nombre}» está en formato ${antiguo ?? 'antiguo de Office'}, que esta herramienta no puede leer sin Office. Ábrelo en tu programa y guárdalo como ${sugerencia}; después conviértelo aquí.`);
  }
  let tipo: TipoOffice | undefined = POR_EXTENSION[ext];
  if (ext === 'csv') return csvAHtml(datos);
  if (!tipo) {
    // Sin extensión conocida: se mira dentro del archivo
    const p = await Paquete.abrir(datos);
    tipo = p.tiene('word/document.xml') ? 'word' : p.tiene('xl/workbook.xml') ? 'excel' : p.tiene('ppt/presentation.xml') ? 'powerpoint' : undefined;
  }
  if (!tipo) throw new Error(`«${nombre}» no es un documento de Word, Excel o PowerPoint reconocible.`);
  if (esperado && tipo !== esperado) {
    const nombres: Record<TipoOffice, string> = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };
    throw new Error(`«${nombre}» es un documento de ${nombres[tipo]}, no de ${nombres[esperado]}. Usa la herramienta «${nombres[tipo]} a PDF».`);
  }
  if (tipo === 'word') return docxAHtml(datos);
  if (tipo === 'excel') return xlsxAHtml(datos);
  return pptxAHtml(datos);
}
