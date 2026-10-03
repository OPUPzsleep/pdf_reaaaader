import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extraerPagina, type OperadoresPdf } from '../epub/extraer';
import type { PaginaExtraida, Progreso } from '../epub/tipos';
import { detectarTablas, unirTablasEntrePaginas, type PaginaTablas, type Tabla } from './detectar';
import { analizarNumero, detectarDecimal } from './numeros';
import { crearXlsx, letraDeColumna, type CeldaXlsx, type HojaXlsx } from './xlsx';

export interface OpcionesTablas {
  /** Añade una hoja «Texto» con las líneas que no pertenecen a ninguna tabla */
  incluirTexto: boolean;
  /** Convierte «1.234,50» y «12 %» en números de Excel */
  numeros: boolean;
}

export const OPCIONES_TABLAS_POR_DEFECTO: OpcionesTablas = { incluirTexto: true, numeros: true };

export interface ResumenTablas {
  paginas: number;
  tablas: number;
  filas: number;
  advertencias: string[];
}

/** Convierte las tablas (y opcionalmente el texto) de las páginas ya extraídas en un libro de Excel. */
export async function paginasAXlsx(paginas: PaginaExtraida[], opciones: OpcionesTablas): Promise<{ datos: Uint8Array; resumen: ResumenTablas }> {
  const porPagina: PaginaTablas[] = paginas.map(detectarTablas);
  const tablas = unirTablasEntrePaginas(porPagina);
  const advertencias: string[] = [];

  const celdasTexto = tablas.flatMap((t) => t.filas.flat());
  const decimal = detectarDecimal(celdasTexto);

  const aCelda = (texto: string, negrita: boolean): CeldaXlsx | null => {
    if (!texto) return null;
    if (opciones.numeros && !negrita) {
      const n = analizarNumero(texto, decimal);
      if (n) return { v: n.valor, estilo: n.porcentaje ? 'porcentaje' : undefined };
    }
    return { v: texto, estilo: negrita ? 'negrita' : undefined };
  };

  const hojas: HojaXlsx[] = tablas.map((t: Tabla, i) => ({
    nombre: tablas.length === 1 ? 'Tabla' : `Tabla ${i + 1}`,
    filas: t.filas.map((f, r) => f.map((c) => aCelda(c, t.filasNegrita[r] && r === 0))),
    fusiones: t.fusiones.map(([f, a, b]) => `${letraDeColumna(a)}${f + 1}:${letraDeColumna(b)}${f + 1}`),
  }));

  const lineas = porPagina.flatMap((p) => (p.texto.length ? [[{ v: `Página ${p.indice + 1}`, estilo: 'negrita' as const }], ...p.texto.map((l) => [{ v: l }]), []] : []));
  if (opciones.incluirTexto && lineas.length) hojas.push({ nombre: 'Texto', filas: lineas });

  if (tablas.length === 0) {
    advertencias.push(
      lineas.length
        ? 'No se encontraron tablas con columnas alineadas en este PDF. Se ha guardado el texto en una hoja.'
        : 'No se encontró texto ni tablas. Si el PDF es un escaneo, conviértelo antes con OCR.',
    );
    if (hojas.length === 0) throw new Error(advertencias[0]);
    if (!opciones.incluirTexto) hojas.push({ nombre: 'Texto', filas: lineas });
  }

  return {
    datos: await crearXlsx(hojas),
    resumen: { paginas: paginas.length, tablas: tablas.length, filas: tablas.reduce((a, t) => a + t.filas.length, 0), advertencias },
  };
}

/** Lee el PDF con pdf.js y genera el .xlsx. */
export async function pdfAXlsx(
  doc: PDFDocumentProxy,
  ops: OperadoresPdf,
  opciones: OpcionesTablas,
  progreso?: Progreso,
  cancelado?: () => boolean,
) {
  const paginas: PaginaExtraida[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    if (cancelado?.()) throw new Error('Conversión cancelada.');
    progreso?.((i - 1) / doc.numPages, `Leyendo página ${i} de ${doc.numPages}`);
    const pagina = await doc.getPage(i);
    paginas.push(await extraerPagina(pagina, ops, { imagenes: false }));
    pagina.cleanup();
  }
  progreso?.(0.95, 'Creando el libro de Excel…');
  const r = await paginasAXlsx(paginas, opciones);
  progreso?.(1, 'Listo');
  return r;
}
