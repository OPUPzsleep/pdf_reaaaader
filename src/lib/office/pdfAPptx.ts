// PDF → PowerPoint (.pptx): una diapositiva por página, con el fondo original y el texto en cuadros editables encima.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { metadatosDelPdf } from '../epub';
import type { OperadoresPdf } from '../epub/extraer';
import { agruparPorY } from '../epub/layout';
import { leerDocumentoPdf } from '../epub/lectura';
import { limpiarTexto } from '../epub/texto';
import type { Fragmento, PaginaExtraida, Progreso, ProveedorRender } from '../epub/tipos';
import { colorDeRegion, type Rgba } from './colorTexto';
import type { ResumenOffice } from './pdfADocx';
import { escribirPptx, fuentePptx, type CajaTextoPptx, type DiapositivaPptx, type LineaPptx, type RunPptx } from './pptxEscribir';

export type ModoPowerpoint = 'editable' | 'imagen';

export interface OpcionesPowerpoint {
  modo: ModoPowerpoint;
  titulo: string;
  autor: string;
  ocr: boolean;
  idiomaOcr: string;
}

export const OPCIONES_POWERPOINT_POR_DEFECTO: OpcionesPowerpoint = { modo: 'editable', titulo: '', autor: '', ocr: false, idiomaOcr: 'spa+eng' };

export interface EntradaPdfAPptx {
  doc: PDFDocumentProxy;
  ops: OperadoresPdf;
  render: ProveedorRender;
  opciones: OpcionesPowerpoint;
  nombreArchivo: string;
  progreso?: Progreso;
  cancelado?: () => boolean;
}

/** Ancho en píxeles de los fondos de las diapositivas */
const ANCHO_FONDO = 1800;
/** Ancho en píxeles de las páginas que se comparan para averiguar el color del texto */
const ANCHO_COLOR = 1100;

interface Segmento {
  x0: number;
  x1: number;
  y: number;
  tam: number;
  frags: Fragmento[];
}

/** Separa cada línea en tramos: un hueco ancho entre fragmentos (columnas, celdas) indica textos distintos. */
function segmentosDe(frags: Fragmento[]): Segmento[] {
  const salida: Segmento[] = [];
  for (const g of agruparPorY(frags)) {
    const orden = g.frags.filter((f) => limpiarTexto(f.texto).trim()).sort((a, b) => a.x - b.x);
    let actual: Segmento | null = null;
    for (const f of orden) {
      if (actual && f.x - actual.x1 <= Math.max(actual.tam, f.tam) * 1.5) {
        actual.frags.push(f);
        actual.x1 = Math.max(actual.x1, f.x + f.ancho);
        if (f.tam > actual.tam) actual.tam = f.tam;
      } else {
        actual = { x0: f.x, x1: f.x + f.ancho, y: g.y, tam: f.tam, frags: [f] };
        salida.push(actual);
      }
    }
  }
  return salida;
}

interface Caja {
  segmentos: Segmento[];
  x0: number;
  x1: number;
  tam: number;
}

/** Une los tramos de líneas consecutivas y alineadas en cuadros de texto (un párrafo, un título, un pie de foto…). */
export function agruparEnCajas(segmentos: Segmento[]): Caja[] {
  const ordenados = [...segmentos].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const cajas: Caja[] = [];
  for (const s of ordenados) {
    let mejor: Caja | undefined;
    let mejorDist = Infinity;
    for (let i = cajas.length - 1; i >= 0 && i >= cajas.length - 40; i--) {
      const c = cajas[i];
      const ultimo = c.segmentos[c.segmentos.length - 1];
      const baja = ultimo.y - s.y;
      const mayor = Math.max(c.tam, s.tam);
      if (baja < mayor * 0.5 || baja > mayor * 2.2) continue;
      if (s.tam < c.tam * 0.75 || s.tam > c.tam * 1.3) continue;
      const izquierda = Math.abs(s.x0 - ultimo.x0) <= mayor * 2;
      const centrada = Math.abs((s.x0 + s.x1) / 2 - (ultimo.x0 + ultimo.x1) / 2) <= mayor * 1.2;
      const derecha = Math.abs(s.x1 - ultimo.x1) <= mayor * 0.6;
      if (!(izquierda || centrada || derecha)) continue;
      // Un tramo que empieza dentro de otra caja a la derecha no se mezcla con la de la izquierda
      if (baja < mejorDist) {
        mejorDist = baja;
        mejor = c;
      }
    }
    if (mejor) {
      mejor.segmentos.push(s);
      mejor.x0 = Math.min(mejor.x0, s.x0);
      mejor.x1 = Math.max(mejor.x1, s.x1);
      mejor.tam = Math.max(mejor.tam, s.tam);
    } else cajas.push({ segmentos: [s], x0: s.x0, x1: s.x1, tam: s.tam });
  }
  return cajas;
}

const mismaCosa = (a: RunPptx, b: RunPptx) => a.negrita === b.negrita && a.cursiva === b.cursiva && a.fuente === b.fuente && a.color === b.color && Math.abs(a.tam - b.tam) < 0.3 && a.invisible === b.invisible;

function runsDe(seg: Segmento, colorDe: (f: Fragmento) => string, invisible: boolean): RunPptx[] {
  const runs: RunPptx[] = [];
  let anterior: Fragmento | null = null;
  for (const f of [...seg.frags].sort((a, b) => a.x - b.x)) {
    let texto = limpiarTexto(f.texto);
    if (anterior) {
      const hueco = f.x - (anterior.x + anterior.ancho);
      if (hueco > Math.min(f.tam, anterior.tam) * 0.18 && !/\s$/.test(anterior.texto) && !/^\s/.test(texto)) texto = ' ' + texto;
    }
    anterior = f;
    const run: RunPptx = { texto, tam: Math.round(f.tam * 2) / 2, negrita: f.negrita, cursiva: f.cursiva, fuente: fuentePptx(f.fuente, f.mono), color: colorDe(f), invisible };
    const ultimo = runs[runs.length - 1];
    if (ultimo && mismaCosa(ultimo, run)) ultimo.texto += run.texto;
    else runs.push(run);
  }
  return runs;
}

/** Cuadro de texto editable de PowerPoint con las líneas de una caja, colocadas donde estaban en el PDF */
function cajaTexto(c: Caja, pagina: PaginaExtraida, esc: number, dx: number, dy: number, colorDe: (f: Fragmento) => string, invisible: boolean): CajaTextoPptx | null {
  const segs = [...c.segmentos].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const base = segs.map((s) => pagina.alto - s.y); // línea base medida desde arriba
  const pasos = segs.map((s, i) => (i === 0 ? 0 : Math.max(s.tam * 0.9, base[i] - base[i - 1])));
  pasos[0] = segs.length > 1 ? pasos[1] : segs[0].tam * 1.2;
  const todosIzq = segs.every((s) => Math.abs(s.x0 - segs[0].x0) < 3);
  const centros = segs.map((s) => (s.x0 + s.x1) / 2);
  const centrada = segs.length > 1 && centros.every((x) => Math.abs(x - centros[0]) < 3) && !todosIzq;
  const derecha = segs.length > 1 && segs.every((s) => Math.abs(s.x1 - segs[0].x1) < 3) && !todosIzq && !centrada;
  const lineas: LineaPptx[] = segs.map((s, i) => ({
    runs: runsDe(s, colorDe, invisible),
    paso: pasos[i] * esc,
    sangria: centrada || derecha ? 0 : (s.x0 - c.x0) * esc,
  }));
  if (lineas.every((l) => l.runs.every((r) => !r.texto.trim()))) return null;
  const top = base[0] - 0.8 * pasos[0];
  const alto = base[base.length - 1] - base[0] + pasos[0] * 0.8 + segs[segs.length - 1].tam * 0.4;
  return {
    x: c.x0 * esc + dx,
    y: top * esc + dy,
    ancho: (c.x1 - c.x0) * esc + 2,
    alto: alto * esc,
    lineas,
    alinear: centrada ? 'ctr' : derecha ? 'r' : 'l',
  };
}

export async function convertirPdfAPptx(e: EntradaPdfAPptx): Promise<{ datos: Uint8Array; resumen: ResumenOffice & { cajas: number } }> {
  try {
    return await convertir(e);
  } finally {
    await e.render.liberar?.();
  }
}

async function convertir(e: EntradaPdfAPptx): Promise<{ datos: Uint8Array; resumen: ResumenOffice & { cajas: number } }> {
  const { doc, render, opciones } = e;
  const progreso: Progreso = e.progreso ?? (() => undefined);
  const total = doc.numPages;
  const meta = await metadatosDelPdf(doc);
  const base = e.nombreArchivo.replace(/\.[^.]+$/, '');
  const titulo = limpiarTexto(opciones.titulo.trim() || meta.titulo || base || 'Presentación');
  const autor = limpiarTexto(opciones.autor.trim() || meta.autor);
  const advertencias: string[] = [];
  const comprobar = () => {
    if (e.cancelado?.()) throw new Error('Conversión cancelada.');
  };

  const editable = opciones.modo === 'editable';
  const lectura = editable
    ? await leerDocumentoPdf({
        doc, ops: e.ops, render, ocr: opciones.ocr, incluirImagenes: false, quitarCabeceras: false, fraccionLectura: 0.4, progreso, cancelado: e.cancelado,
        avisoEscaneado: (ocr) => (ocr ? 'Casi no se encontró texto. Revisa el idioma del OCR.' : 'Este PDF parece escaneado (no contiene texto). Activa el OCR para tener texto en las diapositivas, o usa «Solo imágenes».'),
      })
    : null;
  if (lectura) advertencias.push(...lectura.advertencias);

  // Primera página: define el tamaño de todas las diapositivas
  const p1 = await doc.getPage(1);
  const v1 = p1.getViewport({ scale: 1 });
  p1.cleanup();
  const W = v1.width;
  const H = v1.height;
  const hayFondoSinTexto = !!render.paginaSinTextoAJpeg;
  let cajasTotales = 0;
  let paginasOcr = 0;

  const diapositivas: DiapositivaPptx[] = [];
  for (let i = 0; i < total; i++) {
    comprobar();
    progreso((editable ? 0.4 : 0) + (i / total) * (editable ? 0.55 : 0.95), `Diapositiva ${i + 1} de ${total}`);
    const pg = lectura?.paginas[i];
    const pw = pg?.ancho ?? W;
    const ph = pg?.alto ?? H;
    const esc = Math.min(W / pw, H / ph);
    const dx = (W - pw * esc) / 2;
    const dy = (H - ph * esc) / 2;
    const mismaProporcion = Math.abs(pw / ph - W / H) < 0.01;

    const d: DiapositivaPptx = { imagenes: [], textos: [] };
    const tieneTexto = !!pg && pg.fragmentos.some((f) => f.texto.trim());
    const porOcr = !!pg?.ocr && tieneTexto;
    // Imagen de la página: sin el texto si se va a poner como cuadros editables
    const conTextoEditable = editable && tieneTexto;
    const pideSinTexto = conTextoEditable && hayFondoSinTexto && !porOcr;
    const img = pideSinTexto ? await render.paginaSinTextoAJpeg!(i, ANCHO_FONDO) : await render.paginaAJpeg(i, ANCHO_FONDO);
    if (mismaProporcion) d.fondo = { datos: img.datos, tipo: 'jpeg' };
    else d.imagenes.push({ datos: img.datos, tipo: 'jpeg', x: dx, y: dy, ancho: pw * esc, alto: ph * esc });

    if (conTextoEditable && pg) {
      // El texto se deja invisible si el fondo ya lo trae dibujado (OCR sobre un escaneo, o no se pudo quitar del fondo)
      const invisible = porOcr || !hayFondoSinTexto;
      if (porOcr) paginasOcr++;
      let colorDe = (_f: Fragmento) => '000000';
      if (!invisible && render.paginaRgba) {
        try {
          const [con, sin] = await Promise.all([render.paginaRgba(i, ANCHO_COLOR, false), render.paginaRgba(i, ANCHO_COLOR, true)]);
          colorDe = colorPorFragmento(con, sin, pw, ph);
        } catch {
          /* se usa el negro por defecto */
        }
      }
      for (const c of agruparEnCajas(segmentosDe(pg.fragmentos))) {
        const caja = cajaTexto(c, pg, esc, dx, dy, colorDe, invisible);
        if (caja) {
          d.textos.push(caja);
          cajasTotales++;
        }
      }
    }
    diapositivas.push(d);
  }
  if (paginasOcr) advertencias.push(`El texto reconocido por OCR de ${paginasOcr} página${paginasOcr === 1 ? '' : 's'} está sobre la imagen original, sin verse, para poder buscarlo y copiarlo.`);
  if (editable && !hayFondoSinTexto && cajasTotales) advertencias.push('No se pudo separar el texto del fondo: el texto editable queda invisible sobre la imagen de cada página.');

  progreso(0.97, 'Creando la presentación…');
  const idioma = meta.idioma ?? 'es';
  const datos = await escribirPptx({ diapositivas, ancho: W, alto: H, titulo, autor, idioma });
  progreso(1, 'Listo');
  return { datos, resumen: { paginas: total, tablas: 0, imagenes: total, idioma, advertencias, cajas: cajasTotales } };
}

function colorPorFragmento(con: Rgba, sin: Rgba, pw: number, ph: number): (f: Fragmento) => string {
  const ex = con.ancho / pw;
  const ey = con.alto / ph;
  const cache = new Map<Fragmento, string>();
  return (f) => {
    let c = cache.get(f);
    if (c === undefined) {
      // y es la línea base medida desde abajo: el recuadro del texto va de y + 0,8·tam (arriba) a y − 0,25·tam (abajo)
      const arriba = (ph - (f.y + f.tam * 0.8)) * ey;
      const abajo = (ph - (f.y - f.tam * 0.25)) * ey;
      c = colorDeRegion(con, sin, { x0: f.x * ex, y0: arriba, x1: (f.x + f.ancho) * ex, y1: abajo }) ?? '000000';
      cache.set(f, c);
    }
    return c;
  };
}
