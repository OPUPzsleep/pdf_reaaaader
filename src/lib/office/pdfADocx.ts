// PDF → Word (.docx): texto con formato, títulos, listas, tablas e imágenes, reconstruidos con la maquetación propia.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OperadoresPdf } from '../epub/extraer';
import { metadatosDelPdf } from '../epub';
import { leerDocumentoPdf } from '../epub/lectura';
import { detectarIdioma, limpiarTexto, normalizarIdioma } from '../epub/texto';
import type { Bloque, Progreso, ProveedorRender, RecuadroImagen } from '../epub/tipos';
import type { Tabla } from '../tablas/detectar';
import { escribirDocx, type BloqueDocx, type ImagenDocx } from './docxEscribir';

export interface OpcionesWord {
  titulo: string;
  autor: string;
  idioma: string;
  quitarCabeceras: boolean;
  incluirImagenes: boolean;
  tablas: boolean;
  ocr: boolean;
  idiomaOcr: string;
}

export const OPCIONES_WORD_POR_DEFECTO: OpcionesWord = {
  titulo: '',
  autor: '',
  idioma: 'auto',
  quitarCabeceras: true,
  incluirImagenes: true,
  tablas: true,
  ocr: false,
  idiomaOcr: 'spa+eng',
};

export interface EntradaPdfADocx {
  doc: PDFDocumentProxy;
  ops: OperadoresPdf;
  render: ProveedorRender;
  opciones: OpcionesWord;
  nombreArchivo: string;
  progreso?: Progreso;
  cancelado?: () => boolean;
}

export interface ResumenOffice {
  paginas: number;
  tablas: number;
  imagenes: number;
  idioma: string;
  advertencias: string[];
}

const textoDeSpans = (b: Bloque) => (b.tipo === 'p' || b.tipo === 'li' ? b.spans.map((s) => s.texto).join('') : '');

/** Coloca cada tabla en el orden de lectura: antes del primer bloque que empieza más abajo en su página (o en una página posterior). */
export function insertarTablas(bloques: Bloque[], tablas: Tabla[]): (Bloque | { tipo: 'tabla'; tabla: Tabla })[] {
  const pendientes = [...tablas].sort((a, b) => (a.paginaInicial ?? a.pagina) - (b.paginaInicial ?? b.pagina) || (b.yInicial ?? b.yArriba) - (a.yInicial ?? a.yArriba));
  const salida: (Bloque | { tipo: 'tabla'; tabla: Tabla })[] = [];
  for (const b of bloques) {
    while (pendientes.length) {
      const t = pendientes[0];
      const pag = t.paginaInicial ?? t.pagina;
      const y = t.yInicial ?? t.yArriba;
      if (pag < b.pagina || (pag === b.pagina && y > b.y)) {
        salida.push({ tipo: 'tabla', tabla: t });
        pendientes.shift();
      } else break;
    }
    salida.push(b);
  }
  for (const t of pendientes) salida.push({ tipo: 'tabla', tabla: t });
  return salida;
}

export async function convertirPdfADocx(e: EntradaPdfADocx): Promise<{ datos: Uint8Array; resumen: ResumenOffice }> {
  try {
    return await convertir(e);
  } finally {
    await e.render.liberar?.();
  }
}

async function convertir(e: EntradaPdfADocx): Promise<{ datos: Uint8Array; resumen: ResumenOffice }> {
  const { doc, render, opciones } = e;
  const progreso: Progreso = e.progreso ?? (() => undefined);
  const meta = await metadatosDelPdf(doc);
  const base = e.nombreArchivo.replace(/\.[^.]+$/, '');
  const titulo = limpiarTexto(opciones.titulo.trim() || meta.titulo || base || 'Documento');
  const autor = limpiarTexto(opciones.autor.trim() || meta.autor);

  const lectura = await leerDocumentoPdf({
    doc, ops: e.ops, render, ocr: opciones.ocr, incluirImagenes: opciones.incluirImagenes, quitarCabeceras: opciones.quitarCabeceras, tablas: opciones.tablas,
    fraccionLectura: 0.5, progreso, cancelado: e.cancelado,
    avisoEscaneado: (ocr) => (ocr ? 'Casi no se encontró texto. Revisa el idioma del OCR.' : 'Este PDF parece escaneado (no contiene texto). Activa el OCR para obtener texto editable.'),
  });
  const advertencias = [...lectura.advertencias];
  const comprobar = () => {
    if (e.cancelado?.()) throw new Error('Conversión cancelada.');
  };

  const muestra = lectura.analisis.bloques.slice(0, 200).map(textoDeSpans).join(' ');
  const idioma = opciones.idioma !== 'auto' ? opciones.idioma : (meta.idioma ?? normalizarIdioma(detectarIdioma(muestra)) ?? 'es');

  // Imágenes: se recortan de la página renderizada
  const imagenes = new Map<RecuadroImagen, ImagenDocx>();
  const conImagen = lectura.analisis.bloques.filter((b): b is Extract<Bloque, { tipo: 'img' }> => b.tipo === 'img');
  for (let k = 0; k < conImagen.length; k++) {
    comprobar();
    progreso(0.55 + (k / Math.max(1, conImagen.length)) * 0.3, `Imágenes ${k + 1} de ${conImagen.length}`);
    const r = conImagen[k].imagen;
    try {
      const px = Math.max(200, Math.min(1600, Math.round(r.ancho * 2.5)));
      const out = await render.regionAImagen(conImagen[k].pagina, { x: r.x, y: r.y, ancho: r.ancho, alto: r.alto }, px);
      imagenes.set(r, { datos: out.datos, tipo: out.tipo, ancho: r.ancho, alto: r.alto });
    } catch {
      advertencias.push(`No se pudo extraer una imagen de la página ${conImagen[k].pagina + 1}.`);
    }
  }

  const p0 = lectura.paginas[0];
  const pagina = p0 && p0.ancho > 200 && p0.alto > 200 ? { ancho: p0.ancho, alto: p0.alto } : { ancho: 595.3, alto: 841.9 };
  const margen = Math.min(72, Math.max(36, pagina.ancho * 0.09));

  const bloques: BloqueDocx[] = [];
  for (const b of insertarTablas(lectura.analisis.bloques, lectura.tablas)) {
    if (b.tipo === 'tabla') {
      const t = b.tabla;
      bloques.push({
        tipo: 'tabla',
        tabla: { filas: t.filas, cabecera: t.filasNegrita[0] === true, fusiones: t.fusiones, anchos: t.columnas.map((c) => Math.max(8, c.x1 - c.x0)) },
      });
    } else if (b.tipo === 'p') bloques.push({ tipo: 'p', spans: b.spans, sangria: b.sangria });
    else if (b.tipo === 'h') bloques.push({ tipo: 'h', nivel: b.nivel, texto: b.texto });
    else if (b.tipo === 'li') bloques.push({ tipo: 'li', ordenado: b.ordenado, spans: b.spans });
    else {
      const im = imagenes.get(b.imagen);
      if (im) bloques.push({ tipo: 'img', imagen: im });
    }
  }

  progreso(0.92, 'Creando el documento de Word…');
  const datos = await escribirDocx({ bloques, titulo, autor, idioma, pagina, margen });
  progreso(1, 'Listo');
  const nTablas = lectura.tablas.length;
  if (!lectura.escaneado && nTablas === 0 && opciones.tablas) {
    // Sin aviso: no encontrar tablas es lo normal
  }
  return { datos, resumen: { paginas: doc.numPages, tablas: nTablas, imagenes: imagenes.size, idioma, advertencias } };
}
