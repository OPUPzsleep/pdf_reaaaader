import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { Fragmento, PaginaExtraida, RecuadroImagen } from './tipos';

type Matriz = [number, number, number, number, number, number];

/** a ∘ b: aplica primero b y luego a (igual que pdf.js Util.transform). */
function mult(a: ArrayLike<number>, b: ArrayLike<number>): Matriz {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const NEGRITA = /bold|black|heavy|semibold|demi|extrabold|ultra/i;
const CURSIVA = /italic|oblique|slanted|kursiv|cursiv/i;
const MONO = /mono|courier|consolas|typewriter|menlo/i;

export interface InfoFuente {
  negrita: boolean;
  cursiva: boolean;
  mono: boolean;
}

export function estiloDeFuente(nombre: string | undefined, esMono = false): InfoFuente {
  const n = nombre ?? '';
  return { negrita: NEGRITA.test(n), cursiva: CURSIVA.test(n), mono: esMono || MONO.test(n) };
}

/** Códigos de operación de pdf.js (pasados por el llamador para no depender de qué build se importa). */
export interface OperadoresPdf {
  save: number;
  restore: number;
  transform: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

export async function extraerPagina(
  pagina: PDFPageProxy,
  ops: OperadoresPdf,
  opciones: { imagenes: boolean },
): Promise<PaginaExtraida> {
  const vp = pagina.getViewport({ scale: 1 });
  const alto = vp.height;
  const ancho = vp.width;

  // La lista de operaciones carga las fuentes (nombres reales → negrita/cursiva) y da la posición de las imágenes.
  const lista = await pagina.getOperatorList().catch(() => null);
  const contenido = await pagina.getTextContent();

  const estilos = new Map<string, InfoFuente>();
  const infoFuente = (nombre: string): InfoFuente => {
    let e = estilos.get(nombre);
    if (!e) {
      let real: string | undefined;
      let esMono = false;
      try {
        const f = pagina.commonObjs.get(nombre) as { name?: string; isMonospace?: boolean } | undefined;
        real = f?.name;
        esMono = !!f?.isMonospace;
      } catch {
        /* la fuente no está cargada */
      }
      const css = contenido.styles[nombre]?.fontFamily ?? '';
      e = estiloDeFuente(real, esMono || css === 'monospace');
      estilos.set(nombre, e);
    }
    return e;
  };

  const fragmentos: Fragmento[] = [];
  for (const it of contenido.items) {
    if (!('str' in it) || it.str.length === 0) continue;
    const m = mult(vp.transform, it.transform);
    const tam = Math.hypot(m[0], m[1]);
    if (tam < 1) continue;
    // Texto girado respecto a la página (marcas de agua, textos laterales): se descarta
    if (Math.abs(m[1]) > Math.abs(m[0]) * 0.3 || it.dir === 'ttb') continue;
    const est = infoFuente(it.fontName);
    fragmentos.push({
      texto: it.str,
      x: m[4],
      y: alto - m[5],
      ancho: it.width * (Math.hypot(vp.transform[0], vp.transform[1]) || 1),
      tam,
      negrita: est.negrita,
      cursiva: est.cursiva,
      mono: est.mono,
    });
  }

  const imagenes: RecuadroImagen[] = opciones.imagenes && lista ? recuadrosDeImagen(lista, ops, vp.transform, alto, pagina.pageNumber) : [];
  return { indice: pagina.pageNumber - 1, ancho, alto, giro: pagina.rotate, origenY: pagina.view[1] ?? 0, fragmentos, imagenes };
}

function recuadrosDeImagen(
  lista: { fnArray: number[]; argsArray: unknown[] },
  ops: OperadoresPdf,
  vpTransform: number[],
  altoPagina: number,
  numeroPagina: number,
): RecuadroImagen[] {
  const salida: RecuadroImagen[] = [];
  const pila: Matriz[] = [];
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  let contador = 0;

  const agregar = (clave: string) => {
    const m = mult(vpTransform, ctm);
    // El cuadrado unidad (0,0)-(1,1) transformado → caja que lo contiene
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      xs.push(m[0] * u + m[2] * v + m[4]);
      ys.push(altoPagina - (m[1] * u + m[3] * v + m[5]));
    }
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    salida.push({ clave, x, y, ancho: Math.max(...xs) - x, alto: Math.max(...ys) - y });
  };

  for (let i = 0; i < lista.fnArray.length; i++) {
    const op = lista.fnArray[i];
    const args = lista.argsArray[i] as unknown[];
    if (op === ops.save) pila.push(ctm);
    else if (op === ops.restore) ctm = pila.pop() ?? ctm;
    else if (op === ops.transform) ctm = mult(ctm, args as number[]);
    else if (op === ops.paintFormXObjectBegin) {
      pila.push(ctm);
      if (Array.isArray(args?.[0])) ctm = mult(ctm, args[0] as number[]);
    } else if (op === ops.paintFormXObjectEnd) ctm = pila.pop() ?? ctm;
    else if (op === ops.paintImageXObject) agregar(`x:${String(args?.[0])}:${args?.[1]}x${args?.[2]}`);
    else if (op === ops.paintInlineImageXObject) agregar(`i:${numeroPagina}:${contador++}`);
    else if (op === ops.paintImageMaskXObject) agregar(`m:${numeroPagina}:${contador++}`);
  }
  return salida;
}

export interface EntradaMarcador {
  titulo: string;
  pagina: number;
  y: number | null;
  nivel: number;
}

/** Aplana los marcadores (outline) del PDF en una lista con página y nivel. */
export async function leerMarcadores(doc: PDFDocumentProxy): Promise<EntradaMarcador[]> {
  type Nodo = { title: string; dest: string | unknown[] | null; items?: Nodo[] };
  let esquema: Nodo[] | null;
  try {
    esquema = (await doc.getOutline()) as Nodo[] | null;
  } catch {
    return [];
  }
  if (!esquema) return [];
  const salida: EntradaMarcador[] = [];

  const resolver = async (dest: Nodo['dest']): Promise<{ pagina: number; y: number | null } | null> => {
    try {
      const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(d) || d.length === 0) return null;
      const ref = d[0];
      const pagina = typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
      const tipo = (d[1] as { name?: string } | undefined)?.name;
      let y: number | null = null;
      if (tipo === 'XYZ' && typeof d[3] === 'number') y = d[3];
      else if (tipo === 'FitH' && typeof d[2] === 'number') y = d[2];
      return { pagina, y };
    } catch {
      return null;
    }
  };

  const recorrer = async (nodos: Nodo[], nivel: number) => {
    for (const n of nodos) {
      const destino = n.dest ? await resolver(n.dest) : null;
      const titulo = (n.title ?? '').replace(/\s+/g, ' ').trim();
      if (destino && titulo) salida.push({ titulo, pagina: destino.pagina, y: destino.y, nivel });
      if (n.items?.length) await recorrer(n.items, nivel + 1);
    }
  };
  await recorrer(esquema, 0);
  return salida;
}
