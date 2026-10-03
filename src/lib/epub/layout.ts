import type { Bloque, Fragmento, Linea, PaginaExtraida, RecuadroImagen, Span } from './tipos';
import {
  compactarSpans, empiezaMayuscula, empiezaMinuscula, esLineaDeIndice, limpiarTexto, marcadorDeLista,
  normalizarClave, recortarSpans, terminaFrase,
} from './texto';

/* ───────────────────────── Utilidades numéricas ───────────────────────── */

const mediana = (v: number[]) => {
  if (v.length === 0) return 0;
  const o = [...v].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

function percentil(v: number[], p: number): number {
  if (v.length === 0) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.floor(p * o.length))];
}

function moda(v: number[], paso = 1): number {
  const c = new Map<number, number>();
  for (const x of v) {
    const k = Math.round(x / paso) * paso;
    c.set(k, (c.get(k) ?? 0) + 1);
  }
  let mejor = v[0] ?? 0;
  let n = 0;
  for (const [k, cuenta] of c) if (cuenta > n) { n = cuenta; mejor = k; }
  return mejor;
}

/* ───────────────────────── Líneas ───────────────────────── */

export interface Grupo {
  y: number;
  tam: number;
  frags: Fragmento[];
}

/** Agrupa fragmentos que comparten línea base (con tolerancia para superíndices y subíndices). */
export function agruparPorY(frags: Fragmento[]): Grupo[] {
  const ordenados = frags.filter((f) => f.texto.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: Grupo[] = [];
  for (const f of ordenados) {
    let destino: Grupo | undefined;
    for (let i = grupos.length - 1; i >= 0 && i >= grupos.length - 8; i--) {
      const g = grupos[i];
      const dy = Math.abs(g.y - f.y);
      const mayor = Math.max(g.tam, f.tam);
      const distintoTam = f.tam < g.tam * 0.85 || g.tam < f.tam * 0.85;
      const tol = distintoTam ? mayor * 0.55 : mayor * 0.3;
      if (dy <= tol) { destino = g; break; }
      if (g.y - f.y > mayor * 2.5) break;
    }
    if (destino) {
      destino.frags.push(f);
      if (f.tam > destino.tam) { destino.tam = f.tam; destino.y = f.y; }
    } else {
      grupos.push({ y: f.y, tam: f.tam, frags: [f] });
    }
  }
  return grupos;
}

function crearLinea(frags: Fragmento[], y: number, columna: Linea['columna']): Linea | null {
  const orden = [...frags].sort((a, b) => a.x - b.x);
  const spans: Span[] = [];
  let anterior: Fragmento | null = null;
  const tamPorCaracter = new Map<number, number>();
  for (const f of orden) {
    const texto = limpiarTexto(f.texto);
    if (!texto) continue;
    if (anterior) {
      const hueco = f.x - (anterior.x + anterior.ancho);
      const ultimo = spans[spans.length - 1];
      const tam = Math.min(f.tam, anterior.tam);
      if (hueco > tam * 0.15 && ultimo && !/\s$/.test(ultimo.texto) && !/^\s/.test(texto)) ultimo.texto += ' ';
    }
    spans.push({ texto, negrita: f.negrita, cursiva: f.cursiva, mono: f.mono });
    const t = Math.round(f.tam * 2) / 2;
    tamPorCaracter.set(t, (tamPorCaracter.get(t) ?? 0) + texto.trim().length);
    anterior = f;
  }
  const limpios = recortarSpans(spans);
  const texto = limpios.map((s) => s.texto).join('');
  if (!texto.trim()) return null;
  let tam = 0;
  let max = -1;
  for (const [t, n] of tamPorCaracter) if (n > max) { max = n; tam = t; }
  const letras = limpios.filter((s) => s.texto.trim());
  return {
    x0: Math.min(...orden.map((f) => f.x)),
    x1: Math.max(...orden.map((f) => f.x + f.ancho)),
    y,
    tam,
    spans: limpios,
    texto,
    negrita: letras.length > 0 && letras.every((s) => s.negrita),
    columna,
  };
}

/* ───────────────────────── Columnas ───────────────────────── */

export interface Canal {
  a: number;
  b: number;
}

/**
 * Busca un canal vertical (calle entre dos columnas) mirando los huecos de cada línea: si varias líneas
 * tienen un hueco ancho en el mismo sitio, ahí hay dos columnas. Funciona también en páginas mixtas
 * (títulos y párrafos a ancho completo junto con texto en columnas).
 */
export function detectarCanal(grupos: Grupo[], anchoPagina: number, previo: Canal | null = null): Canal | null {
  const huecoMin = Math.max(9, anchoPagina * 0.022);
  const intervalos: Canal[] = [];
  const relajados: Canal[] = []; // con un lado estrecho: solo valen para heredar el canal de la página anterior
  let lineasConTexto = 0;
  for (const g of grupos) {
    const fr = g.frags.filter((f) => f.texto.trim().length > 0).sort((a, b) => a.x - b.x);
    if (fr.length === 0) continue;
    lineasConTexto++;
    let finPrevio = fr[0].x + fr[0].ancho;
    for (let i = 1; i < fr.length; i++) {
      const hueco = fr[i].x - finPrevio;
      const centro = finPrevio + hueco / 2;
      if (hueco >= huecoMin && centro >= anchoPagina * 0.25 && centro <= anchoPagina * 0.75) {
        const ladoIzq = finPrevio - Math.min(...fr.slice(0, i).map((f) => f.x));
        const ladoDer = Math.max(...fr.slice(i).map((f) => f.x + f.ancho)) - fr[i].x;
        if (ladoIzq >= anchoPagina * 0.1 && ladoDer >= anchoPagina * 0.1) intervalos.push({ a: finPrevio, b: fr[i].x });
        if (ladoIzq >= anchoPagina * 0.04 && ladoDer >= anchoPagina * 0.04) relajados.push({ a: finPrevio, b: fr[i].x });
      }
      finPrevio = Math.max(finPrevio, fr[i].x + fr[i].ancho);
    }
  }
  // Páginas con pocas líneas en columnas (final de un capítulo que sigue en dos columnas): se hereda el canal de la anterior
  const heredar = (): Canal | null => {
    if (!previo) return null;
    const centro = (previo.a + previo.b) / 2;
    // Un hueco de verdad tiene la anchura del canal anterior (los espacios entre palabras justificadas son mucho menores)
    const casan = relajados.filter((t) => t.a <= centro + 2 && t.b >= centro - 2 && t.b - t.a >= (previo.b - previo.a) * 0.8).length;
    return casan >= 2 ? previo : null;
  };
  if (intervalos.length < 5 || intervalos.length < lineasConTexto * 0.2) return heredar();

  // Zona más repetida: barrido sobre los extremos de los intervalos
  const eventos: { x: number; d: number }[] = [];
  for (const t of intervalos) {
    eventos.push({ x: t.a, d: 1 }, { x: t.b, d: -1 });
  }
  eventos.sort((p, q) => p.x - q.x || q.d - p.d);
  let cuenta = 0;
  let max = 0;
  for (const e of eventos) {
    cuenta += e.d;
    if (cuenta > max) max = cuenta;
  }
  if (max < 5 || max < lineasConTexto * 0.2) return heredar();
  // Región contigua donde el solapamiento es al menos el 80 % del máximo
  const umbral = Math.max(5, Math.ceil(max * 0.8));
  let inicio: number | null = null;
  let mejor: Canal | null = null;
  cuenta = 0;
  for (const e of eventos) {
    const antes = cuenta;
    cuenta += e.d;
    if (antes < umbral && cuenta >= umbral) inicio = e.x;
    if (antes >= umbral && cuenta < umbral && inicio !== null) {
      if (!mejor || e.x - inicio > mejor.b - mejor.a) mejor = { a: inicio, b: e.x };
      inicio = null;
    }
  }
  if (!mejor || mejor.b - mejor.a < 3) return heredar();
  return mejor;
}

/** Líneas de una página en orden de lectura, teniendo en cuenta dos columnas y títulos a ancho completo. */
export function lineasDePagina(pagina: PaginaExtraida, imagenes: RecuadroImagen[], canalPrevio: Canal | null = null): { lineas: Linea[]; canal: Canal | null } {
  const grupos = agruparPorY(pagina.fragmentos);
  const canal = detectarCanal(grupos, pagina.ancho, canalPrevio);
  const lineas: Linea[] = [];
  for (const g of grupos) {
    if (!canal) {
      const l = crearLinea(g.frags, g.y, 'U');
      if (l) lineas.push(l);
      continue;
    }
    const ordenados = [...g.frags].sort((a, b) => a.x - b.x);
    const cruza = ordenados.some((f) => f.x < canal.a - 1 && f.x + f.ancho > canal.b + 1);
    let abarca = cruza;
    if (!abarca) {
      // Fragmentos a ambos lados con un hueco menor que el canal: es una sola línea a ancho completo
      const izq = ordenados.filter((f) => (f.x + f.ancho / 2) < (canal.a + canal.b) / 2);
      const der = ordenados.filter((f) => (f.x + f.ancho / 2) >= (canal.a + canal.b) / 2);
      if (izq.length && der.length) {
        const fin = Math.max(...izq.map((f) => f.x + f.ancho));
        const ini = Math.min(...der.map((f) => f.x));
        abarca = ini - fin < (canal.b - canal.a) * 0.7;
      }
    }
    if (abarca) {
      const l = crearLinea(g.frags, g.y, 'C');
      if (l) lineas.push(l);
    } else {
      const centro = (canal.a + canal.b) / 2;
      const li = crearLinea(ordenados.filter((f) => f.x + f.ancho / 2 < centro), g.y, 'I');
      const ld = crearLinea(ordenados.filter((f) => f.x + f.ancho / 2 >= centro), g.y, 'D');
      if (li) lineas.push(li);
      if (ld) lineas.push(ld);
    }
  }

  // Las imágenes entran en el flujo como líneas especiales
  for (const im of imagenes) {
    let columna: Linea['columna'] = 'U';
    if (canal) {
      const x0 = im.x;
      const x1 = im.x + im.ancho;
      columna = x0 < canal.a - 1 && x1 > canal.b + 1 ? 'C' : (x0 + x1) / 2 < (canal.a + canal.b) / 2 ? 'I' : 'D';
    }
    lineas.push({ x0: im.x, x1: im.x + im.ancho, y: im.y + im.alto, tam: 0, spans: [], texto: '', negrita: false, imagen: im, columna });
  }

  if (!canal) return { lineas: lineas.sort((a, b) => b.y - a.y || a.x0 - b.x0), canal };

  // Orden de lectura: bandas separadas por las líneas a ancho completo
  const completas = lineas.filter((l) => l.columna === 'C').sort((a, b) => b.y - a.y);
  const izq = lineas.filter((l) => l.columna === 'I').sort((a, b) => b.y - a.y);
  const der = lineas.filter((l) => l.columna === 'D').sort((a, b) => b.y - a.y);
  const orden: Linea[] = [];
  let limite = Infinity;
  const banda = (desde: number, hasta: number) => {
    orden.push(...izq.filter((l) => l.y < desde && l.y >= hasta), ...der.filter((l) => l.y < desde && l.y >= hasta));
  };
  for (const c of completas) {
    banda(limite, c.y + (c.imagen ? 0 : 0) + 1e-6);
    orden.push(c);
    limite = c.y;
  }
  banda(limite, -Infinity);
  return { lineas: orden, canal };
}

/* ───────────────────────── Estadísticas globales ───────────────────────── */

export function tamanoCuerpo(paginas: Linea[][]): number {
  const c = new Map<number, number>();
  for (const lineas of paginas)
    for (const l of lineas) {
      if (l.imagen) continue;
      const t = Math.round(l.tam * 2) / 2;
      c.set(t, (c.get(t) ?? 0) + l.texto.length);
    }
  let mejor = 11;
  let n = 0;
  for (const [t, cuenta] of c) if (cuenta > n) { n = cuenta; mejor = t; }
  return mejor;
}

/** Mira cómo separa los párrafos este documento (espacio entre ellos o sangría). */
function senalesDeParrafo(paginas: Linea[][], cuerpo: number, interlineado: number): { usaEspaciado: boolean; usaSangria: boolean; justificado: boolean } {
  let pares = 0;
  let huecos = 0;
  let sangrias = 0;
  let llenas = 0;
  let total = 0;
  for (const lineas of paginas) {
    const m = margenesDe(lineas, cuerpo);
    const porColumna: Record<string, Margenes> = {};
    for (const col of ['I', 'D']) {
      const g = lineas.filter((l) => l.columna === col);
      if (g.length >= 3) porColumna[col] = margenesDe(g, cuerpo);
    }
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      if (l.imagen || Math.abs(l.tam - cuerpo) > 0.6) continue;
      const mc = porColumna[l.columna] ?? m;
      if (l.columna !== 'C') {
        total++;
        if (l.x1 >= mc.der - (mc.der - mc.izq) * 0.03) llenas++;
      }
      if (l.x0 - m.izq > l.tam * 0.75 && !marcadorDeLista(l.texto) && l.columna !== 'C') sangrias++;
      const a = lineas[i - 1];
      if (!a || a.imagen || a.columna !== l.columna || Math.abs(a.tam - cuerpo) > 0.6) continue;
      pares++;
      if (a.y - l.y > cuerpo * (interlineado + 0.5)) huecos++;
    }
  }
  return { usaEspaciado: huecos >= 3 && huecos >= pares * 0.02, usaSangria: sangrias >= 3, justificado: total > 0 && llenas / total >= 0.5 };
}

function interlineadoRelativo(paginas: Linea[][], cuerpo: number): number {
  const r: number[] = [];
  for (const lineas of paginas) {
    for (let i = 1; i < lineas.length; i++) {
      const a = lineas[i - 1];
      const b = lineas[i];
      if (a.imagen || b.imagen || a.columna !== b.columna) continue;
      if (Math.abs(a.tam - cuerpo) > 0.6 || Math.abs(b.tam - cuerpo) > 0.6) continue;
      const dy = a.y - b.y;
      if (dy > cuerpo * 0.9 && dy < cuerpo * 2.2) r.push(dy / cuerpo);
    }
  }
  // La moda de los pasos pequeños es el interlineado normal (los grandes son separación entre párrafos)
  const pequenos = r.filter((x) => x < mediana(r) + 0.25);
  return pequenos.length ? mediana(pequenos) : 1.25;
}

/* ───────────────────────── Cabeceras y pies ───────────────────────── */

const NUMERO_ROMANO = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;
const NUMERO_DE_PAGINA = /^\s*[-–—]?\s*(?:(?:p[aá]g(?:ina)?\.?|page|p\.)\s*)?(\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:de|of|\/)\s*\d{1,4})?\s*[-–—]?\s*$/i;

export function esNumeroDePagina(texto: string): boolean {
  const m = NUMERO_DE_PAGINA.exec(texto);
  if (!m) return false;
  return /^\d+$/.test(m[1]) || NUMERO_ROMANO.test(m[1]);
}

const claveCabecera = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

/** Elimina cabeceras, pies y números de página de las líneas (modifica los arrays). Devuelve cuántas líneas quitó. */
export function quitarCabeceras(paginas: PaginaExtraida[], lineasPorPagina: Linea[][], cuerpo: number): number {
  const n = paginas.length;
  const conteo = new Map<string, number>();
  const zona = (l: Linea, p: PaginaExtraida): 'sup' | 'inf' | null => {
    if (l.imagen) return null;
    if (l.y > p.alto * 0.9) return 'sup';
    if (l.y < p.alto * 0.1) return 'inf';
    return null;
  };
  paginas.forEach((p, i) => {
    const vistas = new Set<string>();
    for (const l of lineasPorPagina[i]) {
      const z = zona(l, p);
      if (!z) continue;
      const k = `${z}|${claveCabecera(l.texto)}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
  });
  const minimo = Math.max(2, Math.ceil(n * 0.25));
  // Distancia entre líneas de cuerpo que es normal en este documento (incluye el espacio entre párrafos)
  const saltos: number[] = [];
  for (const lineas of lineasPorPagina) {
    const t = lineas.filter((l) => !l.imagen);
    for (let k = 1; k < t.length; k++) if (t[k].columna === t[k - 1].columna && Math.abs(t[k].tam - cuerpo) <= 1 && Math.abs(t[k - 1].tam - cuerpo) <= 1) saltos.push(t[k - 1].y - t[k].y);
  }
  const saltoTipico = percentil(saltos, 0.95);
  let quitadas = 0;
  paginas.forEach((p, i) => {
    const textoPagina = lineasPorPagina[i].filter((l) => !l.imagen);
    // Una cabecera está separada del cuerpo, o es más pequeña o cursiva; una línea normal de arriba del todo no
    const aislada = (l: Linea, z: 'sup' | 'inf') => {
      if (l.tam < cuerpo - 0.5 || (l.spans.length > 0 && l.spans.every((s) => s.cursiva))) return true;
      const vecinas = textoPagina.filter((o) => o !== l && (z === 'sup' ? o.y < l.y : o.y > l.y));
      if (vecinas.length === 0) return true;
      const cercana = z === 'sup' ? Math.max(...vecinas.map((o) => o.y)) : Math.min(...vecinas.map((o) => o.y));
      return Math.abs(l.y - cercana) > Math.max(Math.max(l.tam, cuerpo) * 1.9, saltoTipico * 1.15);
    };
    lineasPorPagina[i] = lineasPorPagina[i].filter((l) => {
      const z = zona(l, p);
      if (!z) return true;
      const repetida = n >= 2 && (conteo.get(`${z}|${claveCabecera(l.texto)}`) ?? 0) >= minimo && aislada(l, z);
      if (repetida || esNumeroDePagina(l.texto)) {
        quitadas++;
        return false;
      }
      return true;
    });
  });
  return quitadas;
}

/* ───────────────────────── Imágenes ───────────────────────── */

/** Decide qué imágenes de cada página merecen aparecer en el libro. */
export function seleccionarImagenes(paginas: PaginaExtraida[]): RecuadroImagen[][] {
  const n = paginas.length;
  const apariciones = new Map<string, number>();
  for (const p of paginas) for (const k of new Set(p.imagenes.map((i) => i.clave))) apariciones.set(k, (apariciones.get(k) ?? 0) + 1);
  const repetida = (k: string) => (apariciones.get(k) ?? 0) >= Math.max(3, Math.ceil(n * 0.25)) && n >= 4;

  return paginas.map((p) => {
    const area = p.ancho * p.alto;
    const tieneTexto = p.fragmentos.some((f) => f.texto.trim().length > 0);
    const salida: RecuadroImagen[] = [];
    for (const im of p.imagenes) {
      if (im.ancho < 24 || im.alto < 24) continue;
      const a = im.ancho * im.alto;
      if (a < area * 0.012) continue; // iconos, viñetas, filetes
      if (repetida(im.clave)) continue; // logotipos
      const centroY = im.y + im.alto / 2;
      if (a < area * 0.05 && (centroY > p.alto * 0.92 || centroY < p.alto * 0.08)) continue;
      // Fondo de página con texto encima: no se incluye. Sin texto es una página escaneada: sí.
      if (a > area * 0.6 && tieneTexto) continue;
      // Dos recuadros casi idénticos (máscara + imagen)
      if (salida.some((o) => Math.abs(o.x - im.x) < 4 && Math.abs(o.y - im.y) < 4 && Math.abs(o.ancho - im.ancho) < 6 && Math.abs(o.alto - im.alto) < 6)) continue;
      salida.push(im);
    }
    return salida;
  });
}

/* ───────────────────────── Párrafos ───────────────────────── */

interface Margenes {
  izq: number;
  der: number;
}

function margenesDe(lineas: Linea[], cuerpo: number): Margenes {
  const texto = lineas.filter((l) => !l.imagen && Math.abs(l.tam - cuerpo) <= 1);
  if (texto.length < 3) {
    const t = lineas.filter((l) => !l.imagen);
    return { izq: t.length ? Math.min(...t.map((l) => l.x0)) : 0, der: t.length ? Math.max(...t.map((l) => l.x1)) : 0 };
  }
  // El margen izquierdo es el más repetido; las sangrías de primera línea quedan por encima
  return { izq: moda(texto.map((l) => l.x0), 2), der: percentil(texto.map((l) => l.x1), 0.9) };
}

interface ContextoDocumento {
  cuerpo: number;
  interlineado: number;
  /** y de la última línea de texto de una página llena y de la primera línea (percentiles globales) */
  fondo: number;
  techo: number;
  /** El documento marca los párrafos con espacio vertical entre ellos */
  usaEspaciado: boolean;
  /** El documento marca los párrafos con sangría en la primera línea */
  usaSangria: boolean;
  /** El texto está justificado (las líneas llegan al margen derecho) */
  justificado: boolean;
}

function esNuevoParrafo(ant: Linea | null, l: Linea, m: Margenes, ctx: ContextoDocumento): boolean {
  if (!ant) return true;
  if (ant.imagen) return true;
  const dy = ant.y - l.y;
  const mayor = Math.max(ant.tam, l.tam);
  // Un título a ancho completo que se parte en dos líneas: la segunda, más corta, cae en la columna izquierda
  const sigueTitulo = ant.columna === 'C' && l.columna === 'I' && Math.abs(ant.tam - l.tam) < 0.5 && l.tam >= ctx.cuerpo * 1.12 && dy > 0 && dy <= l.tam * 1.7;
  if (ant.columna !== l.columna && !sigueTitulo) return true;
  if (Math.abs(l.tam - ant.tam) > 0.7 && mayor >= ctx.cuerpo * 1.1) return true;
  if (dy > mayor * (ctx.interlineado + 0.5)) return true;
  if (marcadorDeLista(l.texto)) return true;
  if (esLineaDeIndice(ant.texto) || esLineaDeIndice(l.texto)) return true;
  const sangriaL = l.x0 - m.izq > l.tam * 0.75;
  const sangriaA = ant.x0 - m.izq > ant.tam * 0.75;
  if (sangriaL && !sangriaA) return true;
  const ancho = m.der - m.izq;
  // En texto justificado todas las líneas llegan al margen salvo la última del párrafo: una línea corta cierra el párrafo
  if (ctx.justificado && ancho > 0 && ant.x1 < m.der - ancho * 0.12 && Math.abs(ant.tam - ctx.cuerpo) <= 1) return true;
  // Última pista, solo si el documento no usa espacio ni sangría: línea corta que acaba la frase.
  // (En texto sin justificar muchas líneas acaban en punto sin que acabe el párrafo.)
  if (!ctx.usaEspaciado && !ctx.usaSangria && ancho > 0 && ant.x1 < m.der - ancho * 0.25 && terminaFrase(ant.texto) && empiezaMayuscula(l.texto)) return true;
  return false;
}

/** Une las líneas de un párrafo resolviendo guiones de fin de línea. */
function unirLineas(lineas: Linea[], quitarMarca = 0): Span[] {
  const spans: Span[] = [];
  lineas.forEach((l, i) => {
    let propios = l.spans.map((s) => ({ ...s }));
    if (i === 0 && quitarMarca > 0) {
      let resto = quitarMarca;
      propios = propios.map((s) => {
        if (resto <= 0) return s;
        const corte = Math.min(resto, s.texto.length);
        resto -= corte;
        return { ...s, texto: s.texto.slice(corte) };
      }).filter((s) => s.texto);
    }
    if (i > 0 && spans.length) {
      const ultimo = spans[spans.length - 1];
      const siguiente = propios.map((s) => s.texto).join('');
      if (/[A-Za-zÀ-ÿ]-$/.test(ultimo.texto) && empiezaMinuscula(siguiente)) {
        ultimo.texto = ultimo.texto.slice(0, -1); // «ejem-» + «plo» → «ejemplo»
      } else if (!/\s$/.test(ultimo.texto)) {
        ultimo.texto += ' ';
      }
    }
    spans.push(...propios);
  });
  return recortarSpans(spans);
}

const CAPITULO = /^\s*(cap[ií]tulo|chapter|parte|part|secci[oó]n|section|libro|book|pr[oó]logo|ep[ií]logo|prologue|epilogue|introducci[oó]n|introduction|conclusi[oó]n|conclusion|[ií]ndice|contents)\b/i;

interface CandidatoTitulo {
  indice: number;
  tam: number;
  cuerpo: boolean;
}

/** Convierte las líneas de una página en bloques provisionales (títulos sin nivel asignado). */
function bloquesDePagina(
  lineas: Linea[],
  indicePagina: number,
  ctx: ContextoDocumento,
  candidatos: CandidatoTitulo[],
  salida: Bloque[],
  paginaAncho: number,
) {
  void paginaAncho;
  const margenes: Record<string, Margenes> = {};
  for (const col of ['I', 'D', 'C', 'U'] as const) {
    const grupo = lineas.filter((l) => l.columna === col || (col === 'C' && l.columna === 'C'));
    margenes[col] = margenesDe(grupo.length >= 3 ? grupo : lineas, ctx.cuerpo);
  }

  let actual: Linea[] = [];
  let anterior: Linea | null = null;

  const cerrar = () => {
    if (actual.length === 0) return;
    const primera = actual[0];
    const m = margenes[primera.columna];
    const tam = Math.max(...actual.map((l) => l.tam));
    const textoPlano = actual.map((l) => l.texto).join(' ');
    let marca = marcadorDeLista(primera.texto);
    // «1. Introducción» en grande o en negrita es un título numerado, no un elemento de lista
    if (marca?.ordenado && actual.length === 1 && textoPlano.length <= 100 && !/[.:;,]$/.test(textoPlano.trim()) && (tam >= ctx.cuerpo * 1.12 && tam - ctx.cuerpo >= 1 ? true : actual[0].negrita && tam >= ctx.cuerpo - 0.5 && textoPlano.length <= 80)) marca = null;

    if (marca) {
      salida.push({ tipo: 'li', ordenado: marca.ordenado, spans: unirLineas(actual, marca.longitud), pagina: indicePagina, y: primera.y, tam });
    } else {
      const corto = actual.length <= 4 && textoPlano.length <= 160;
      const grande = tam >= ctx.cuerpo * 1.12 && tam - ctx.cuerpo >= 1;
      const negritaTodo = actual.every((l) => l.negrita) && tam >= ctx.cuerpo - 0.5;
      const patron = CAPITULO.test(textoPlano) && textoPlano.length <= 80 && !terminaFrase(textoPlano.replace(/[.]$/, ''));
      const soloNumero = /^\d{1,4}$/.test(textoPlano.trim());
      if (corto && !soloNumero && (grande || patron || (negritaTodo && textoPlano.length <= 100 && !/[.:;,]$/.test(textoPlano.trim())))) {
        const idx = salida.length;
        salida.push({ tipo: 'h', nivel: 3, texto: unirLineas(actual).map((s) => s.texto).join(''), pagina: indicePagina, y: primera.y, tam });
        candidatos.push({ indice: idx, tam, cuerpo: !grande });
      } else {
        const sangria = primera.x0 - m.izq > primera.tam * 0.75;
        salida.push({
          tipo: 'p',
          spans: unirLineas(actual),
          pagina: indicePagina,
          y: primera.y,
          tam,
          sangria,
          finLinea: actual[actual.length - 1].texto,
          col: primera.columna,
          // «continúa»: la última línea llega al pie del texto y casi hasta el margen derecho
          continua: ctx.justificado && actual[actual.length - 1].y <= ctx.fondo + ctx.interlineado * ctx.cuerpo * 1.5 && actual[actual.length - 1].x1 >= m.der - (m.der - m.izq) * 0.12,
          empiezaArriba: primera.y >= ctx.techo - ctx.interlineado * ctx.cuerpo * 1.5,
        });
      }
    }
    actual = [];
  };

  for (const l of lineas) {
    if (l.imagen) {
      cerrar();
      salida.push({ tipo: 'img', imagen: l.imagen, pagina: indicePagina, y: l.y });
      anterior = null;
      continue;
    }
    if (esNuevoParrafo(anterior, l, margenes[l.columna], ctx)) cerrar();
    actual.push(l);
    anterior = l;
  }
  cerrar();
}

/* ───────────────────────── Documento completo ───────────────────────── */

export interface DocumentoAnalizado {
  bloques: Bloque[];
  tamCuerpo: number;
  caracteres: number;
  paginasSinTexto: number[];
  cabecerasQuitadas: number;
}

export interface OpcionesAnalisis {
  quitarCabeceras: boolean;
  incluirImagenes: boolean;
}

export function analizarDocumento(paginas: PaginaExtraida[], opciones: OpcionesAnalisis): DocumentoAnalizado {
  const imagenesElegidas = opciones.incluirImagenes ? seleccionarImagenes(paginas) : paginas.map(() => []);
  let canalPrevio: Canal | null = null;
  const resultado = paginas.map((p, i) => {
    const r = lineasDePagina(p, imagenesElegidas[i], canalPrevio);
    canalPrevio = r.canal;
    return r;
  });
  const lineasPorPagina = resultado.map((r) => r.lineas);

  const cabecerasQuitadas = opciones.quitarCabeceras ? quitarCabeceras(paginas, lineasPorPagina, tamanoCuerpo(lineasPorPagina)) : 0;

  // El texto dentro de una figura ya forma parte de la imagen
  lineasPorPagina.forEach((lineas, i) => {
    const figuras = lineas.filter((l) => l.imagen).map((l) => l.imagen!);
    if (figuras.length === 0) return;
    lineasPorPagina[i] = lineas.filter((l) => {
      if (l.imagen) return true;
      const cy = l.y + l.tam * 0.3;
      const cx = (l.x0 + l.x1) / 2;
      return !figuras.some((f) => cx >= f.x && cx <= f.x + f.ancho && cy >= f.y && cy <= f.y + f.alto);
    });
  });

  const cuerpo = tamanoCuerpo(lineasPorPagina);
  const interlineado = interlineadoRelativo(lineasPorPagina, cuerpo);
  const ys = lineasPorPagina.flatMap((ls) => ls.filter((l) => !l.imagen && Math.abs(l.tam - cuerpo) <= 1).map((l) => l.y));
  const ctx: ContextoDocumento = {
    cuerpo,
    interlineado,
    fondo: percentil(ys, 0.03),
    techo: percentil(ys, 0.97),
    ...senalesDeParrafo(lineasPorPagina, cuerpo, interlineado),
  };

  const bloques: Bloque[] = [];
  const candidatos: CandidatoTitulo[] = [];
  paginas.forEach((p, i) => bloquesDePagina(lineasPorPagina[i], p.indice, ctx, candidatos, bloques, p.ancho));

  asignarNivelesDeTitulo(bloques, candidatos, cuerpo);
  const unidos = unirEntrePaginas(bloques);

  const caracteres = lineasPorPagina.reduce((a, ls) => a + ls.reduce((b, l) => b + l.texto.length, 0), 0);
  const paginasSinTexto = paginas.filter((p, i) => lineasPorPagina[i].filter((l) => !l.imagen).length === 0 && p.fragmentos.length === 0).map((p) => p.indice);
  return { bloques: unidos, tamCuerpo: cuerpo, caracteres, paginasSinTexto, cabecerasQuitadas };
}

/** Asigna h1/h2/h3 agrupando los tamaños de título de mayor a menor. */
function asignarNivelesDeTitulo(bloques: Bloque[], candidatos: CandidatoTitulo[], cuerpo: number) {
  const tamanos: number[] = [];
  for (const c of candidatos) {
    if (c.cuerpo) continue;
    if (!tamanos.some((t) => Math.abs(t - c.tam) < 0.75)) tamanos.push(c.tam);
  }
  tamanos.sort((a, b) => b - a);
  const nivelDeTam = (t: number) => {
    const i = tamanos.findIndex((x) => Math.abs(x - t) < 0.75);
    return Math.min(3, i + 1) as 1 | 2 | 3;
  };
  for (const c of candidatos) {
    const b = bloques[c.indice];
    if (b.tipo !== 'h') continue;
    if (!c.cuerpo) b.nivel = nivelDeTam(c.tam);
    else if (CAPITULO.test(b.texto) && tamanos.length === 0) b.nivel = 1;
    else b.nivel = Math.min(3, tamanos.length + 1) as 1 | 2 | 3;
  }
  void cuerpo;
}

/** Un párrafo cortado por un salto de página o de columna se vuelve a unir. */
function unirEntrePaginas(bloques: Bloque[]): Bloque[] {
  const salida: Bloque[] = [];
  for (const b of bloques) {
    const prev = salida[salida.length - 1];
    if (
      prev && prev.tipo === 'p' && b.tipo === 'p' &&
      // Salto de página o paso de la columna izquierda a la derecha de la misma página
      (b.pagina === prev.pagina + 1 || (b.pagina === prev.pagina && prev.col === 'I' && b.col === 'D')) &&
      !b.sangria &&
      Math.abs(b.tam - prev.tam) < 0.7 &&
      (/[A-Za-zÀ-ÿ]-$/.test(prev.finLinea) ||
        (!terminaFrase(prev.finLinea) && empiezaMinuscula(b.spans.map((s) => s.texto).join(''))) ||
        // El párrafo llega al pie y el siguiente arranca arriba sin sangría: es el mismo aunque la frase acabe ahí
        (prev.continua && b.empiezaArriba))
    ) {
      const ultimo = prev.spans[prev.spans.length - 1];
      const primero = b.spans[0];
      const texto = b.spans.map((s) => s.texto).join('');
      if (ultimo && /[A-Za-zÀ-ÿ]-$/.test(ultimo.texto) && empiezaMinuscula(texto)) ultimo.texto = ultimo.texto.slice(0, -1);
      else if (ultimo && !/\s$/.test(ultimo.texto) && primero) ultimo.texto += ' ';
      prev.spans = compactarSpans([...prev.spans, ...b.spans]);
      prev.finLinea = b.finLinea;
      continue;
    }
    salida.push(b);
  }
  return salida;
}

export { normalizarClave };
