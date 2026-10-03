import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface OpcionesPdfPrueba {
  rotaciones?: Record<number, number>;
  tamano?: [number, number];
  /** Texto de cada página (por defecto "Página i") */
  texto?: (i: number) => string;
}

/** Crea un PDF de n páginas; cada una dice "Página i" para poder comprobar el orden. */
export async function crearPdf(n: number, op: OpcionesPdfPrueba = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const p = doc.addPage(op.tamano ?? [300, 400]);
    p.drawText(op.texto ? op.texto(i) : `Página ${i}`, { x: 40, y: p.getHeight() / 2, size: 24, font: fuente });
    if (op.rotaciones?.[i - 1]) p.setRotation(degrees(op.rotaciones[i - 1]));
  }
  return doc.save();
}

export async function abrirConPdfjs(datos: Uint8Array) {
  return pdfjs.getDocument({ data: datos.slice(), useSystemFonts: true, verbosity: 0 }).promise;
}

export interface ElementoTexto {
  texto: string;
  x: number;
  y: number;
  /** Transformación completa [a,b,c,d,e,f] */
  matriz: number[];
}

/** Texto de cada página (concatenado) para comprobar contenido y orden. */
export async function textosPorPagina(datos: Uint8Array): Promise<string[]> {
  const doc = await abrirConPdfjs(datos);
  const salida: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const c = await pagina.getTextContent();
    salida.push(c.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' ').trim());
  }
  return salida;
}

export async function elementosDePagina(datos: Uint8Array, pagina: number): Promise<ElementoTexto[]> {
  const doc = await abrirConPdfjs(datos);
  const p = await doc.getPage(pagina);
  const c = await p.getTextContent();
  return c.items.flatMap((it) =>
    'str' in it && it.str.trim()
      ? [{ texto: it.str, x: it.transform[4], y: it.transform[5], matriz: it.transform as number[] }]
      : [],
  );
}
