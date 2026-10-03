import { agruparPorY } from '../epub/layout';
import { limpiarTexto } from '../epub/texto';
import type { PaginaExtraida } from '../epub/tipos';

export interface Tabla {
  pagina: number;
  /** Rangos horizontales de cada columna */
  columnas: { x0: number; x1: number }[];
  filas: string[][];
  /** Si todas las celdas de la fila están en negrita (sirve para marcar la cabecera) */
  filasNegrita: boolean[];
  /** Combinaciones de celdas [fila, columnaInicial, columnaFinal] (base 0) */
  fusiones: [number, number, number][];
  /** Altura (y hacia arriba) de la primera y de la última fila */
  yArriba: number;
  yAbajo: number;
  /** Si la tabla continúa en otras páginas: página y altura donde empieza (para colocarla en el orden de lectura) */
  paginaInicial?: number;
  yInicial?: number;
}

interface CeldaCruda {
  texto: string;
  x0: number;
  x1: number;
  negrita: boolean;
}

interface FilaCruda {
  y: number;
  tam: number;
  celdas: CeldaCruda[];
}

export interface PaginaTablas {
  indice: number;
  alto: number;
  tablas: Tabla[];
  /** Líneas de texto que no forman parte de ninguna tabla, en orden de lectura */
  texto: string[];
}

/** Une los fragmentos próximos de una línea en celdas; las separaciones anchas delimitan celdas distintas. */
const SOLO_MARCADOR = /^(?:[•·▪◦‣⁃●○■□▸►\-–—*]|\(?(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,5})[.)])$/;

export interface OpcionesDeteccion {
  /** Une la viñeta o el número de una lista («•», «1.») con su texto: no son una columna de tabla */
  fusionarMarcadores?: boolean;
}

function filasCrudas(pagina: PaginaExtraida, o: OpcionesDeteccion = {}): FilaCruda[] {
  const filas: FilaCruda[] = [];
  for (const g of agruparPorY(pagina.fragmentos)) {
    const frags = g.frags.filter((f) => limpiarTexto(f.texto).trim()).sort((a, b) => a.x - b.x);
    if (frags.length === 0) continue;
    const celdas: CeldaCruda[] = [];
    let actual: CeldaCruda | null = null;
    let anterior = frags[0];
    for (const f of frags) {
      const texto = limpiarTexto(f.texto);
      const hueco = f.x - (anterior.x + anterior.ancho);
      if (actual && f !== anterior && hueco <= Math.min(f.tam, anterior.tam) * 0.6) {
        actual.texto += (hueco > Math.min(f.tam, anterior.tam) * 0.12 && !/\s$/.test(actual.texto) && !/^\s/.test(texto) ? ' ' : '') + texto;
        actual.x1 = Math.max(actual.x1, f.x + f.ancho);
        actual.negrita = actual.negrita && f.negrita;
      } else {
        actual = { texto, x0: f.x, x1: f.x + f.ancho, negrita: f.negrita };
        celdas.push(actual);
      }
      anterior = f;
    }
    for (const c of celdas) c.texto = c.texto.replace(/\s+/g, ' ').trim();
    const utiles = celdas.filter((c) => c.texto);
    if (o.fusionarMarcadores && utiles.length >= 2 && SOLO_MARCADOR.test(utiles[0].texto)) {
      const [m, t, ...resto] = utiles;
      utiles.splice(0, utiles.length, { texto: `${m.texto} ${t.texto}`, x0: m.x0, x1: t.x1, negrita: t.negrita }, ...resto);
    }
    if (utiles.length) filas.push({ y: g.y, tam: g.tam, celdas: utiles });
  }
  return filas.sort((a, b) => b.y - a.y);
}

/** Reparte las celdas de un bloque de filas en columnas. */
function construirTabla(filas: FilaCruda[], pagina: number): Tabla | null {
  const multi = filas.filter((f) => f.celdas.length >= 2);
  if (multi.length < 3) return null;

  // Número de celdas más habitual (en empate, el mayor): esas filas definen las columnas
  const cuenta = new Map<number, number>();
  for (const f of multi) cuenta.set(f.celdas.length, (cuenta.get(f.celdas.length) ?? 0) + 1);
  let k = 2;
  let mejor = 0;
  for (const [n, c] of cuenta) if (c > mejor || (c === mejor && n > k)) { mejor = c; k = n; }
  const modales = multi.filter((f) => f.celdas.length === k);
  let columnas = Array.from({ length: k }, (_, j) => ({
    x0: Math.min(...modales.map((f) => f.celdas[j].x0)),
    x1: Math.max(...modales.map((f) => f.celdas[j].x1)),
  }));
  // Las columnas no pueden solaparse: si dos se pisan se funden
  columnas = columnas.reduce<{ x0: number; x1: number }[]>((acc, c) => {
    const u = acc[acc.length - 1];
    if (u && c.x0 < u.x1) u.x1 = Math.max(u.x1, c.x1);
    else acc.push({ ...c });
    return acc;
  }, []);

  const solape = (a: { x0: number; x1: number }, b: { x0: number; x1: number }) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));

  // Celdas que no caen en ninguna columna (filas con columnas extra) crean columnas nuevas
  for (const f of filas) for (const c of f.celdas) {
    if (!columnas.some((col) => solape(col, c) > 0)) columnas.push({ x0: c.x0, x1: c.x1 });
  }
  columnas.sort((a, b) => a.x0 - b.x0);
  columnas = columnas.reduce<{ x0: number; x1: number }[]>((acc, c) => {
    const u = acc[acc.length - 1];
    if (u && c.x0 < u.x1) u.x1 = Math.max(u.x1, c.x1);
    else acc.push({ ...c });
    return acc;
  }, []);

  const salida: string[][] = [];
  const negritas: boolean[] = [];
  const fusiones: [number, number, number][] = [];
  for (const f of filas) {
    const fila = Array.from({ length: columnas.length }, () => '');
    let negrita = true;
    for (const c of f.celdas) {
      const ancho = Math.max(1, c.x1 - c.x0);
      // Una columna cuenta si la celda cubre casi toda la columna o si la celda está casi toda dentro de ella
      const tocadas = columnas.map((col, j) => ({ j, o: solape(col, c) })).filter((t) => t.o > 0 && (t.o / ancho > 0.5 || t.o / Math.max(1, columnas[t.j].x1 - columnas[t.j].x0) > 0.6));
      const destino = tocadas.length ? tocadas : [{ j: columnas.reduce((m, col, j) => (Math.abs((col.x0 + col.x1) / 2 - (c.x0 + c.x1) / 2) < Math.abs((columnas[m].x0 + columnas[m].x1) / 2 - (c.x0 + c.x1) / 2) ? j : m), 0), o: 0 }];
      const primera = destino[0].j;
      fila[primera] = (fila[primera] ? fila[primera] + ' ' : '') + c.texto;
      if (destino.length > 1) fusiones.push([salida.length, primera, destino[destino.length - 1].j]);
      negrita = negrita && c.negrita;
    }
    salida.push(fila);
    negritas.push(negrita);
  }
  return {
    pagina,
    columnas,
    filas: salida,
    filasNegrita: negritas,
    fusiones,
    yArriba: filas[0].y,
    yAbajo: filas[filas.length - 1].y,
  };
}

/**
 * Un texto a dos columnas (o justificado) parece una tabla: filas con celdas alineadas. Se distingue porque sus «celdas» son trozos de frases:
 * muchas empiezan en minúscula o tienen varias palabras, mientras que en una tabla hay cifras, etiquetas cortas y mayúsculas.
 */
export function esTextoEnColumnas(t: Tabla): boolean {
  const celdas = t.filas.flat().map((c) => c.trim()).filter(Boolean);
  if (celdas.length < 4) return false;
  const palabras = (c: string) => c.split(/\s+/).filter(Boolean).length;
  const largas = celdas.filter((c) => palabras(c) >= 4).length / celdas.length;
  // «desde», «hacía»: empiezan por una palabra en minúscula (los códigos como «a1» o «x2» no cuentan)
  const minuscula = celdas.filter((c) => /^[a-záéíóúüñàèìòùâêîôûç]{3,}(?![\d])/.test(c)).length / celdas.length;
  return minuscula >= 0.4 || (largas >= 0.6 && t.columnas.length <= 3);
}

/** Separa en cada página las tablas (filas con varias celdas alineadas en columnas) del resto del texto. */
export function detectarTablas(pagina: PaginaExtraida, opciones: OpcionesDeteccion = {}): PaginaTablas {
  const filas = filasCrudas(pagina, opciones);
  const bloques: FilaCruda[][] = [];
  let actual: FilaCruda[] = [];
  const cerrar = () => {
    if (actual.length) bloques.push(actual);
    actual = [];
  };
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const previa = actual[actual.length - 1];
    const cercana = !previa || previa.y - f.y <= Math.max(previa.tam, f.tam) * 3.2;
    if (f.celdas.length >= 2) {
      if (!cercana) cerrar();
      actual.push(f);
    } else {
      // Una fila de una sola celda entre filas de varias es una fila con celdas vacías, no el final de la tabla
      const siguiente = filas[i + 1];
      const puente = previa && previa.celdas.length >= 2 && siguiente && siguiente.celdas.length >= 2 && cercana && previa.y - siguiente.y <= Math.max(previa.tam, f.tam) * 4.5;
      if (puente) actual.push(f);
      else cerrar();
    }
  }
  cerrar();

  const tablas: Tabla[] = [];
  const usadas = new Set<FilaCruda>();
  for (const b of bloques) {
    const t = construirTabla(b, pagina.indice);
    if (!t || t.columnas.length < 2 || esTextoEnColumnas(t)) continue;
    tablas.push(t);
    b.forEach((f) => usadas.add(f));
  }
  const texto = filas.filter((f) => !usadas.has(f)).map((f) => f.celdas.map((c) => c.texto).join(' '));
  return { indice: pagina.indice, alto: pagina.alto, tablas, texto };
}

/**
 * Une las tablas que continúan en la página siguiente (mismas columnas) para que formen una sola hoja.
 * Si la primera fila de la continuación repite la cabecera, se omite.
 */
export function unirTablasEntrePaginas(paginas: PaginaTablas[]): Tabla[] {
  const resultado: Tabla[] = [];
  for (const p of paginas) {
    p.tablas.forEach((t, i) => {
      const prev = resultado[resultado.length - 1];
      const mismasColumnas = prev && prev.columnas.length === t.columnas.length && prev.columnas.every((c, j) => Math.abs(c.x0 - t.columnas[j].x0) < 6 && Math.abs(c.x1 - t.columnas[j].x1) < 12);
      if (prev && i === 0 && prev.pagina === p.indice - 1 && mismasColumnas) {
        const repiteCabecera = prev.filas[0].join('|') === t.filas[0].join('|');
        const desde = repiteCabecera ? 1 : 0;
        const base = prev.filas.length;
        prev.filas.push(...t.filas.slice(desde));
        prev.filasNegrita.push(...t.filasNegrita.slice(desde));
        for (const [f, a, b] of t.fusiones) if (f >= desde) prev.fusiones.push([base + f - desde, a, b]);
        prev.yAbajo = t.yAbajo;
        prev.pagina = p.indice;
      } else {
        resultado.push({ ...t, paginaInicial: t.pagina, yInicial: t.yArriba, filas: [...t.filas], filasNegrita: [...t.filasNegrita], fusiones: [...t.fusiones] });
      }
    });
  }
  return resultado;
}
