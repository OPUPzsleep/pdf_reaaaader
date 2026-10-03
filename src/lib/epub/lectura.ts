// Lectura y análisis de un PDF (texto con posiciones, OCR, tablas, orden de lectura): lo comparten EPUB, Word y PowerPoint.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { detectarTablas, unirTablasEntrePaginas, type Tabla } from '../tablas/detectar';
import { extraerPagina, type OperadoresPdf } from './extraer';
import { analizarDocumento, type DocumentoAnalizado } from './layout';
import type { PaginaExtraida, Progreso, ProveedorRender } from './tipos';

export interface EntradaLectura {
  doc: PDFDocumentProxy;
  ops: OperadoresPdf;
  render: ProveedorRender;
  ocr: boolean;
  incluirImagenes: boolean;
  quitarCabeceras: boolean;
  /** Detectar tablas y sacarlas del flujo de texto */
  tablas?: boolean;
  /** Parte de la barra de progreso que ocupa la lectura (0–1) */
  fraccionLectura?: number;
  progreso?: Progreso;
  cancelado?: () => boolean;
  /** Texto del aviso para los PDF escaneados (depende de cada herramienta) */
  avisoEscaneado?: (ocr: boolean) => string;
}

export interface Lectura {
  paginas: PaginaExtraida[];
  analisis: DocumentoAnalizado;
  tablas: Tabla[];
  escaneado: boolean;
  paginasConOcr: number;
  advertencias: string[];
}

function comprobar(c?: () => boolean) {
  if (c?.()) throw new Error('Conversión cancelada.');
}

/** Quita de la página los fragmentos de texto que pertenecen a las tablas (se escribirán como tablas) */
function sacarTablas(pagina: PaginaExtraida, tablas: Tabla[]) {
  for (const t of tablas) {
    const x0 = Math.min(...t.columnas.map((c) => c.x0)) - 3;
    const x1 = Math.max(...t.columnas.map((c) => c.x1)) + 3;
    pagina.fragmentos = pagina.fragmentos.filter((f) => !(f.y <= t.yArriba + 3 && f.y >= t.yAbajo - 3 && f.x + f.ancho >= x0 && f.x <= x1));
  }
}

export async function leerDocumentoPdf(e: EntradaLectura): Promise<Lectura> {
  const total = e.doc.numPages;
  const progreso: Progreso = e.progreso ?? (() => undefined);
  const parte = e.fraccionLectura ?? 0.5;
  const paginas: PaginaExtraida[] = [];
  const advertencias: string[] = [];
  let paginasConOcr = 0;
  for (let i = 1; i <= total; i++) {
    comprobar(e.cancelado);
    progreso(((i - 1) / total) * parte, `Leyendo página ${i} de ${total}`);
    const pagina = await e.doc.getPage(i);
    const extraida = await extraerPagina(pagina, e.ops, { imagenes: e.incluirImagenes });
    pagina.cleanup();
    const sinTexto = extraida.fragmentos.every((f) => !f.texto.trim());
    if (sinTexto && e.ocr && e.render.ocrPagina) {
      progreso(((i - 1) / total) * parte, `Reconociendo texto (OCR) en la página ${i} de ${total}`);
      extraida.fragmentos = await e.render.ocrPagina(i - 1);
      extraida.ocr = true;
      paginasConOcr++;
      // Si hay texto reconocido, la imagen de página completa ya no es necesaria
      if (extraida.fragmentos.length) extraida.imagenes = [];
    }
    paginas.push(extraida);
  }

  progreso(parte, 'Analizando el texto…');
  let tablas: Tabla[] = [];
  if (e.tablas) {
    const porPagina = paginas.map((p) => detectarTablas(p, { fusionarMarcadores: true }));
    tablas = unirTablasEntrePaginas(porPagina);
    porPagina.forEach((p, i) => sacarTablas(paginas[i], p.tablas));
  }
  const analisis = analizarDocumento(paginas, { quitarCabeceras: e.quitarCabeceras, incluirImagenes: e.incluirImagenes });
  const escaneado = analisis.caracteres + tablas.reduce((a, t) => a + t.filas.flat().join('').length, 0) < total * 20;
  if (escaneado && e.avisoEscaneado) advertencias.push(e.avisoEscaneado(e.ocr));
  if (paginasConOcr > 0) advertencias.push(`Se aplicó OCR en ${paginasConOcr} página${paginasConOcr === 1 ? '' : 's'}: revisa el texto, puede contener errores.`);
  return { paginas, analisis, tablas, escaneado, paginasConOcr, advertencias };
}
