// PowerPoint (.pptx) → HTML autocontenido: una sección del tamaño de la diapositiva por cada una, con formas en SVG y texto en HTML.
import {
  Paquete, colorDrawingMl, escaparHtml, familiaCss, imagenComoDatos, leerTema, limpiarControl, r2, resolverFuente, type Relacion, type Tema,
} from './comun';
import type { ResultadoOffice } from './docx';
import { geometriaPersonalizada, geometriaPredefinida, leerAjustes, type GeometriaSvg } from './pptxGeom';
import { descendiente, hijo, hijos, num, ruta, type Nodo } from './xml';

const EMU = 12700;
const pt = (emu: number) => emu / EMU;

/* ───────── Estilos de texto ───────── */

interface EstiloRun {
  sz?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  color?: string;
  fuente?: string;
  baseline?: number;
  cap?: string;
  spc?: number;
  enlace?: boolean;
}

type Viñeta = { tipo: 'none' } | { tipo: 'char'; char: string } | { tipo: 'auto'; fmt: string; inicio: number };

interface Espaciado {
  tipo: 'pct' | 'pts';
  v: number;
}

interface EstiloPar {
  algn?: string;
  marL?: number;
  indent?: number;
  lnSpc?: Espaciado;
  spcBef?: Espaciado;
  spcAft?: Espaciado;
  bu?: Viñeta;
  buClr?: string;
  buSzPct?: number;
  def: EstiloRun;
}

type Niveles = (EstiloPar | undefined)[];

function sinUndef<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

const mezclarRun = (a: EstiloRun, b: EstiloRun): EstiloRun => ({ ...a, ...sinUndef(b) });
const mezclarPar = (a: EstiloPar, b: EstiloPar): EstiloPar => ({ ...a, ...sinUndef({ ...b, def: undefined }), def: mezclarRun(a.def, b.def) });

interface Paleta {
  tema: Tema;
  mapa: Record<string, string>;
}

function espaciado(n: Nodo | undefined): Espaciado | undefined {
  const c = n?.h[0];
  if (!c) return undefined;
  if (c.n === 'spcPct') return { tipo: 'pct', v: num(c, 'val') / 100000 };
  if (c.n === 'spcPts') return { tipo: 'pts', v: num(c, 'val') / 100 };
  return undefined;
}

function leerRunPpt(n: Nodo | undefined, p: Paleta): EstiloRun {
  const r: EstiloRun = {};
  if (!n) return r;
  if (n.a.sz) r.sz = Number(n.a.sz) / 100;
  if (n.a.b !== undefined) r.b = n.a.b === '1' || n.a.b === 'true';
  if (n.a.i !== undefined) r.i = n.a.i === '1' || n.a.i === 'true';
  if (n.a.u !== undefined) r.u = n.a.u !== 'none';
  if (n.a.strike !== undefined) r.strike = n.a.strike !== 'noStrike';
  if (n.a.baseline !== undefined) r.baseline = Number(n.a.baseline);
  if (n.a.cap !== undefined) r.cap = n.a.cap;
  if (n.a.spc !== undefined) r.spc = Number(n.a.spc) / 100;
  const relleno = hijo(n, 'solidFill');
  if (relleno) {
    const c = colorDrawingMl(relleno.h[0], p.tema, p.mapa);
    if (c) r.color = c;
  }
  const latin = hijo(n, 'latin');
  if (latin?.a.typeface) r.fuente = latin.a.typeface;
  if (hijo(n, 'hlinkClick')) r.enlace = true;
  return r;
}

function leerParPpt(n: Nodo | undefined, p: Paleta): EstiloPar {
  const e: EstiloPar = { def: {} };
  if (!n) return e;
  if (n.a.algn) e.algn = n.a.algn;
  if (n.a.marL !== undefined) e.marL = pt(Number(n.a.marL));
  if (n.a.indent !== undefined) e.indent = pt(Number(n.a.indent));
  const ln = espaciado(hijo(n, 'lnSpc'));
  if (ln) e.lnSpc = ln;
  const sb = espaciado(hijo(n, 'spcBef'));
  if (sb) e.spcBef = sb;
  const sa = espaciado(hijo(n, 'spcAft'));
  if (sa) e.spcAft = sa;
  for (const c of n.h) {
    if (c.n === 'buNone') e.bu = { tipo: 'none' };
    else if (c.n === 'buChar') e.bu = { tipo: 'char', char: c.a.char ?? '•' };
    else if (c.n === 'buAutoNum') e.bu = { tipo: 'auto', fmt: c.a.type ?? 'arabicPeriod', inicio: num(c, 'startAt', 1) };
    else if (c.n === 'buClr') {
      const col = colorDrawingMl(c.h[0], p.tema, p.mapa);
      if (col) e.buClr = col;
    } else if (c.n === 'buSzPct') e.buSzPct = num(c, 'val') / 100000;
  }
  e.def = leerRunPpt(hijo(n, 'defRPr'), p);
  return e;
}

function leerNiveles(lst: Nodo | undefined, p: Paleta): Niveles {
  const r: Niveles = [];
  for (let i = 1; i <= 9; i++) {
    const l = hijo(lst, `lvl${i}pPr`);
    if (l) r[i - 1] = leerParPpt(l, p);
  }
  return r;
}

/* ───────── Estructura de la presentación ───────── */

interface Maestro {
  ruta: string;
  paleta: Paleta;
  arbol: Nodo | undefined;
  fondo: Nodo | undefined;
  rels: Map<string, Relacion>;
  titulo: Niveles;
  cuerpo: Niveles;
  otro: Niveles;
}

interface Diseno {
  ruta: string;
  arbol: Nodo | undefined;
  fondo: Nodo | undefined;
  rels: Map<string, Relacion>;
  maestro: Maestro;
  mostrarMaestro: boolean;
}

interface Global {
  paquete: Paquete;
  imagenes: Map<string, string>;
  avisos: Set<string>;
  estiloTablas: Map<string, Nodo>;
  defecto: Niveles;
  ancho: number;
  alto: number;
  idCounter: number;
}

interface Transformada {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const IDENTIDAD: Transformada = { sx: 1, sy: 1, tx: 0, ty: 0 };

interface CtxParte {
  g: Global;
  paleta: Paleta;
  rels: Map<string, Relacion>;
  maestro: Maestro;
  diseno: Diseno | null;
  numero: number;
}

const tipoNorm = (t: string | undefined) => (!t ? 'body' : t === 'ctrTitle' ? 'title' : t === 'subTitle' ? 'body' : ['obj', 'tbl', 'chart', 'pic', 'media', 'clipArt', 'dgm'].includes(t) ? 'body' : t);

function infoPh(sp: Nodo): { tipo: string; idx?: string } | null {
  const ph = descendiente(hijo(sp, 'nvSpPr'), 'ph');
  if (!ph) return null;
  return { tipo: tipoNorm(ph.a.type), idx: ph.a.idx };
}

function buscarPh(arbol: Nodo | undefined, ph: { tipo: string; idx?: string }): Nodo | undefined {
  if (!arbol) return undefined;
  const shapes = hijos(arbol, 'sp');
  if (ph.idx !== undefined) {
    const porIdx = shapes.find((s) => descendiente(hijo(s, 'nvSpPr'), 'ph')?.a.idx === ph.idx);
    if (porIdx) return porIdx;
  }
  return shapes.find((s) => {
    const i = infoPh(s);
    return i && i.tipo === ph.tipo && (ph.idx === undefined || i.idx === undefined || i.idx === ph.idx || ph.tipo === 'title');
  });
}

/* ───────── Relleno, línea y color ───────── */

function partirColor(css: string): { color: string; alfa: number } {
  const m = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(css);
  if (!m) return { color: css, alfa: 1 };
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return { color: `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`, alfa: Number(m[4]) };
}

interface RellenoSvg {
  /** valor del atributo fill */
  fill: string;
  opacidad: number;
  defs: string;
}

function resolverRelleno(contenedor: Nodo | undefined, ref: Nodo | undefined, c: CtxParte, esFondoLinea = false): RellenoSvg | null {
  void esFondoLinea;
  const buscar = (n: Nodo | undefined): Nodo | undefined => n?.h.find((x) => ['solidFill', 'gradFill', 'blipFill', 'pattFill', 'noFill', 'grpFill'].includes(x.n));
  const f = buscar(contenedor);
  const p = c.paleta;
  if (f) {
    if (f.n === 'noFill') return { fill: 'none', opacidad: 1, defs: '' };
    if (f.n === 'solidFill') {
      const col = colorDrawingMl(f.h[0], p.tema, p.mapa);
      if (!col) return null;
      const { color, alfa } = partirColor(col);
      return { fill: color, opacidad: alfa, defs: '' };
    }
    if (f.n === 'pattFill') {
      const col = colorDrawingMl(hijo(f, 'fgClr')?.h[0], p.tema, p.mapa);
      if (!col) return null;
      const { color, alfa } = partirColor(col);
      return { fill: color, opacidad: alfa, defs: '' };
    }
    if (f.n === 'gradFill') {
      const id = `g${++c.g.idCounter}`;
      const paradas = hijos(hijo(f, 'gsLst'), 'gs')
        .map((gs) => {
          const col = colorDrawingMl(gs.h[0], p.tema, p.mapa);
          return col ? `<stop offset="${r2(num(gs, 'pos') / 1000)}%" style="stop-color:${col}"/>` : '';
        })
        .join('');
      const lin = hijo(f, 'lin');
      const path = hijo(f, 'path');
      let def: string;
      if (path) def = `<radialGradient id="${id}" cx="50%" cy="50%" r="70%">${paradas}</radialGradient>`;
      else {
        const ang = (num(lin, 'ang') / 60000) * (Math.PI / 180);
        const x1 = 50 - 50 * Math.cos(ang);
        const y1 = 50 - 50 * Math.sin(ang);
        def = `<linearGradient id="${id}" x1="${r2(x1)}%" y1="${r2(y1)}%" x2="${r2(100 - x1)}%" y2="${r2(100 - y1)}%">${paradas}</linearGradient>`;
      }
      return { fill: `url(#${id})`, opacidad: 1, defs: def };
    }
    if (f.n === 'blipFill') {
      const embed = hijo(f, 'blip')?.a.embed;
      const uri = embed ? c.g.imagenes.get(c.rels.get(embed)?.destino ?? '') : undefined;
      if (!uri) return null;
      const id = `p${++c.g.idCounter}`;
      return { fill: `url(#${id})`, opacidad: 1, defs: `<pattern id="${id}" patternUnits="objectBoundingBox" width="1" height="1"><image href="${uri}" width="100%" height="100%" preserveAspectRatio="none" style="width:100%;height:100%"/></pattern>` };
    }
    return null;
  }
  // Referencia de estilo: <a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>
  if (ref) {
    const idx = num(ref, 'idx');
    if (idx === 0) return { fill: 'none', opacidad: 1, defs: '' };
    const col = colorDrawingMl(ref.h[0], p.tema, p.mapa);
    if (col) {
      const { color, alfa } = partirColor(col);
      return { fill: color, opacidad: alfa, defs: '' };
    }
  }
  return null;
}

interface Trazo {
  color: string;
  ancho: number;
  opacidad: number;
  guiones: string;
  inicio: string;
  fin: string;
}

function resolverTrazo(spPr: Nodo | undefined, ref: Nodo | undefined, c: CtxParte): Trazo | null {
  const ln = hijo(spPr, 'ln');
  const p = c.paleta;
  let ancho: number | null = ln?.a.w !== undefined ? pt(Number(ln.a.w)) : null;
  let col: string | null = null;
  if (ln) {
    if (hijo(ln, 'noFill')) return null;
    const sf = hijo(ln, 'solidFill');
    if (sf) col = colorDrawingMl(sf.h[0], p.tema, p.mapa);
    else if (hijo(ln, 'gradFill')) col = colorDrawingMl(hijo(hijo(hijo(ln, 'gradFill'), 'gsLst'), 'gs')?.h[0], p.tema, p.mapa);
  }
  if (!col && ref) {
    const idx = num(ref, 'idx');
    if (idx > 0) {
      col = colorDrawingMl(ref.h[0], p.tema, p.mapa);
      if (ancho === null) ancho = pt(p.tema.anchosLinea[Math.min(idx, p.tema.anchosLinea.length) - 1] ?? 9525);
    }
  }
  if (!col) return null;
  const { color, alfa } = partirColor(col);
  const w = ancho ?? 0.75;
  const dash = hijo(ln, 'prstDash')?.a.val ?? 'solid';
  const mult: Record<string, string> = {
    dash: `${4 * w} ${3 * w}`, sysDash: `${3 * w} ${1 * w}`, dot: `${1 * w} ${2 * w}`, sysDot: `${1 * w} ${1 * w}`, lgDash: `${8 * w} ${3 * w}`,
    dashDot: `${4 * w} ${3 * w} ${1 * w} ${3 * w}`, lgDashDot: `${8 * w} ${3 * w} ${1 * w} ${3 * w}`,
  };
  return { color, ancho: w, opacidad: alfa, guiones: mult[dash] ?? '', inicio: hijo(ln, 'headEnd')?.a.type ?? 'none', fin: hijo(ln, 'tailEnd')?.a.type ?? 'none' };
}

/* ───────── Texto ───────── */

const AUTONUM: Record<string, (n: number) => string> = {
  arabicPeriod: (n) => `${n}.`,
  arabicParenR: (n) => `${n})`,
  arabicPlain: (n) => `${n}`,
  alphaLcPeriod: (n) => `${aLetras(n)}.`,
  alphaUcPeriod: (n) => `${aLetras(n).toUpperCase()}.`,
  alphaLcParenR: (n) => `${aLetras(n)})`,
  alphaUcParenR: (n) => `${aLetras(n).toUpperCase()})`,
  romanLcPeriod: (n) => `${aRomano(n)}.`,
  romanUcPeriod: (n) => `${aRomano(n).toUpperCase()}.`,
};

function aLetras(n: number): string {
  let r = '';
  while (n > 0) {
    n--;
    r = String.fromCharCode(97 + (n % 26)) + r;
    n = Math.floor(n / 26);
  }
  return r;
}
function aRomano(n: number): string {
  const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let r = '';
  for (const [v, s] of t) while (n >= v) { r += s; n -= v; }
  return r;
}

const SIMBOLOS_PUA: Record<number, string> = { 0xb7: '•', 0xa7: '▪', 0xd8: '➢', 0xfc: '✓', 0x76: '❖', 0x6f: '○', 0xa8: '◻', 0x77: '◆', 0x9f: '•' };

function simboloViñeta(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0x2022;
  if (cp >= 0xf000 && cp <= 0xf0ff) return SIMBOLOS_PUA[cp & 0xff] ?? '•';
  if (ch === 'Ø') return '➢';
  if (ch === 'ü') return '✓';
  if (ch === '§') return '▪';
  if (ch === 'o') return '○';
  return ch;
}

function cssRun(r: EstiloRun, escala: number, c: CtxParte, base: EstiloRun): string {
  const d: string[] = [];
  const f = familiaCss(resolverFuente(r.fuente, c.paleta.tema) ?? c.paleta.tema.fuenteTexto);
  if (f) d.push(`font-family:${f}`);
  const sz = (r.sz ?? 18) * escala;
  const sub = r.baseline && r.baseline !== 0;
  d.push(`font-size:${r2(sub ? sz * 0.7 : sz)}pt`);
  if (r.b) d.push('font-weight:700');
  if (r.i) d.push('font-style:italic');
  const dec = [r.u && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ');
  if (dec) d.push(`text-decoration:${dec}`);
  const color = r.color ?? base.color;
  if (color) d.push(`color:${color}`);
  if (sub) d.push(`vertical-align:${(r.baseline ?? 0) > 0 ? 'super' : 'sub'}`);
  if (r.cap === 'all') d.push('text-transform:uppercase');
  else if (r.cap === 'small') d.push('font-variant:small-caps');
  if (r.spc) d.push(`letter-spacing:${r2(r.spc)}pt`);
  return d.join(';');
}

interface OpcionesTexto {
  niveles: Niveles[];
  /** Estilo por defecto de la forma (color de fontRef, etc.) */
  base: EstiloRun;
  escalaFuente: number;
  reduccionInterlineado: number;
  numeroDiapositiva: number;
}

function renderParrafos(txBody: Nodo, c: CtxParte, o: OpcionesTexto): { html: string; vacio: boolean } {
  const partes: string[] = [];
  let vacio = true;
  const contadores: (number | undefined)[] = [];
  let despuesPrevio = 0;
  const lst = hijo(txBody, 'lstStyle');
  const propios = leerNiveles(lst, c.paleta);
  for (const p of hijos(txBody, 'p')) {
    const pPr = hijo(p, 'pPr');
    const nivel = Math.min(8, Math.max(0, num(pPr, 'lvl', 0)));
    // Orden: estilos por defecto y del patrón < estilo de la forma (color de fontRef…) < lstStyle propio < párrafo < ejecución
    let estilo: EstiloPar = { def: {} };
    for (const lista of o.niveles) if (lista[nivel]) estilo = mezclarPar(estilo, lista[nivel]!);
    estilo = mezclarPar(estilo, { def: o.base });
    if (propios[nivel]) estilo = mezclarPar(estilo, propios[nivel]!);
    estilo = mezclarPar(estilo, leerParPpt(pPr, c.paleta));

    // Contenido
    const piezas: string[] = [];
    let texto = '';
    for (const x of p.h) {
      if (x.n === 'r' || x.n === 'fld') {
        const rpr = leerRunPpt(hijo(x, 'rPr'), c.paleta);
        let ef = mezclarRun(estilo.def, rpr);
        if (rpr.enlace && rpr.color === undefined) ef = { ...ef, color: c.paleta.tema.colores.hlink, u: true };
        let t = hijo(x, 't')?.t ?? '';
        if (x.n === 'fld' && x.a.type === 'slidenum') t = String(o.numeroDiapositiva);
        if (!t) continue;
        texto += t;
        piezas.push(`<span style="${cssRun(ef, o.escalaFuente, c, estilo.def)}">${escaparHtml(limpiarControl(t))}</span>`);
      } else if (x.n === 'br') piezas.push('<br>');
    }
    const fin = leerRunPpt(hijo(p, 'endParaRPr'), c.paleta);
    const tamVacio = cssRun(mezclarRun(estilo.def, fin), o.escalaFuente, c, estilo.def);
    if (texto.trim()) vacio = false;

    // Viñetas y numeración
    const bu = estilo.bu;
    let etiqueta = '';
    contadores.length = nivel + 1;
    if (bu && bu.tipo !== 'none' && texto.trim()) {
      let simbolo: string;
      if (bu.tipo === 'char') {
        simbolo = simboloViñeta(bu.char);
        contadores[nivel] = undefined;
      } else {
        contadores[nivel] = (contadores[nivel] ?? bu.inicio - 1) + 1;
        simbolo = (AUTONUM[bu.fmt] ?? AUTONUM.arabicPeriod)(contadores[nivel]!);
      }
      const tam = (estilo.def.sz ?? 18) * o.escalaFuente * (estilo.buSzPct ?? 1);
      const ancho = Math.max(0, -(estilo.indent ?? 0));
      etiqueta = `<span style="display:inline-block;min-width:${r2(ancho || tam)}pt;text-indent:0;font-family:Arial,'Liberation Sans',sans-serif;font-size:${r2(tam)}pt;${estilo.buClr ? `color:${estilo.buClr}` : ''}">${escaparHtml(simbolo)}</span>`;
    } else if (!bu || bu.tipo === 'none') contadores[nivel] = undefined;

    // Espaciado
    const tam = (estilo.def.sz ?? 18) * o.escalaFuente;
    const aPt = (e: Espaciado | undefined) => (e ? (e.tipo === 'pts' ? e.v : e.v * tam * 1.2) : 0);
    const antes = aPt(estilo.spcBef);
    const margenSup = antes + despuesPrevio;
    despuesPrevio = aPt(estilo.spcAft);
    let altura = '';
    if (estilo.lnSpc) {
      if (estilo.lnSpc.tipo === 'pts') altura = `line-height:${r2(estilo.lnSpc.v)}pt`;
      else altura = `line-height:${r2(Math.max(0.5, estilo.lnSpc.v - o.reduccionInterlineado) * 1.2)}`;
    } else if (o.reduccionInterlineado) altura = `line-height:${r2(Math.max(0.6, 1 - o.reduccionInterlineado) * 1.2)}`;
    const algn = estilo.algn === 'ctr' ? 'center' : estilo.algn === 'r' ? 'right' : estilo.algn === 'just' || estilo.algn === 'dist' ? 'justify' : 'left';
    const marL = estilo.marL ?? 0;
    const indent = estilo.indent ?? 0;
    const css = [
      `text-align:${algn}`, 'margin:0', margenSup ? `margin-top:${r2(margenSup)}pt` : '', marL ? `margin-left:${r2(marL)}pt` : '', indent ? `text-indent:${r2(indent)}pt` : '', altura,
      'white-space:pre-wrap', 'overflow-wrap:break-word',
    ].filter(Boolean).join(';');
    partes.push(`<p style="${css}">${etiqueta}${piezas.join('') || `<span style="${tamVacio}"><br></span>`}</p>`);
  }
  return { html: partes.join(''), vacio };
}

/* ───────── Formas ───────── */

interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flipH: boolean;
  flipV: boolean;
}

function leerXfrm(x: Nodo | undefined): Caja | null {
  if (!x) return null;
  const off = hijo(x, 'off');
  const ext = hijo(x, 'ext');
  if (!off || !ext) return null;
  return { x: num(off, 'x'), y: num(off, 'y'), w: num(ext, 'cx'), h: num(ext, 'cy'), rot: num(x, 'rot') / 60000, flipH: x.a.flipH === '1' || x.a.flipH === 'true', flipV: x.a.flipV === '1' || x.a.flipV === 'true' };
}

function aplicar(t: Transformada, b: Caja): Caja {
  return { ...b, x: t.sx * b.x + t.tx, y: t.sy * b.y + t.ty, w: t.sx * b.w, h: t.sy * b.h };
}

const cajaCss = (b: Caja) => {
  const trans = b.rot ? `transform:rotate(${r2(b.rot)}deg);` : '';
  return `position:absolute;left:${r2(pt(b.x))}pt;top:${r2(pt(b.y))}pt;width:${r2(pt(b.w))}pt;height:${r2(pt(b.h))}pt;${trans}`;
};

function marcadorFlecha(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker>`;
}

function renderForma(sp: Nodo, c: CtxParte, T: Transformada, esPlantilla: boolean, esConector = false): string {
  const cNv = descendiente(hijo(sp, esConector ? 'nvCxnSpPr' : 'nvSpPr'), 'cNvPr');
  if (cNv?.a.hidden === '1') return '';
  const ph = esConector ? null : infoPh(sp);
  if (esPlantilla && ph) return '';
  const spPr = hijo(sp, 'spPr');
  const estilo = hijo(sp, 'style');
  const txBody = hijo(sp, 'txBody');

  // Posición: la propia o la heredada del diseño y del patrón
  let caja = leerXfrm(hijo(spPr, 'xfrm'));
  let phDiseno: Nodo | undefined;
  let phMaestro: Nodo | undefined;
  if (ph) {
    phDiseno = c.diseno ? buscarPh(c.diseno.arbol, ph) : undefined;
    phMaestro = buscarPh(c.maestro.arbol, phDiseno ? (infoPh(phDiseno) ?? ph) : ph);
    caja = caja ?? leerXfrm(ruta(phDiseno, 'spPr', 'xfrm')) ?? leerXfrm(ruta(phMaestro, 'spPr', 'xfrm'));
  }
  if (!caja) return '';
  const b = aplicar(T, caja);
  const w = pt(b.w);
  const h = pt(b.h);

  // Texto y ajustes del cuadro de texto
  let textoHtml = '';
  let tieneTexto = false;
  if (txBody) {
    const tipoEstilo = ph ? (ph.tipo === 'title' ? 'titulo' : ph.tipo === 'body' ? 'cuerpo' : 'otro') : 'otro';
    const niveles: Niveles[] = [c.g.defecto, tipoEstilo === 'titulo' ? c.maestro.titulo : tipoEstilo === 'cuerpo' ? c.maestro.cuerpo : c.maestro.otro];
    if (phMaestro) niveles.push(leerNiveles(ruta(phMaestro, 'txBody', 'lstStyle'), c.maestro.paleta));
    if (phDiseno) niveles.push(leerNiveles(ruta(phDiseno, 'txBody', 'lstStyle'), c.paleta));
    const bodyPr = hijo(txBody, 'bodyPr');
    const bpDiseno = hijo(hijo(phDiseno, 'txBody'), 'bodyPr');
    const bpMaestro = hijo(hijo(phMaestro, 'txBody'), 'bodyPr');
    const attr = (k: string) => bodyPr?.a[k] ?? bpDiseno?.a[k] ?? bpMaestro?.a[k];
    const auto = hijo(bodyPr, 'normAutofit') ?? hijo(bpDiseno, 'normAutofit') ?? hijo(bpMaestro, 'normAutofit');
    const escalaFuente = auto?.a.fontScale ? Number(auto.a.fontScale) / 100000 : 1;
    const reduccion = auto?.a.lnSpcReduction ? Number(auto.a.lnSpcReduction) / 100000 : 0;
    const fontRef = hijo(estilo, 'fontRef');
    const colorFuente = fontRef ? (colorDrawingMl(fontRef.h[0], c.paleta.tema, c.paleta.mapa) ?? undefined) : undefined;
    const base: EstiloRun = { color: colorFuente };
    const { html, vacio } = renderParrafos(txBody, c, { niveles, base, escalaFuente, reduccionInterlineado: reduccion, numeroDiapositiva: c.numero });
    tieneTexto = !vacio;
    if (ph && vacio) return ''; // los marcadores de posición vacíos no se imprimen
    const anchor = attr('anchor');
    const justificar = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';
    const ins = (k: string, def: number) => pt(attr(k) !== undefined ? Number(attr(k)) : def);
    const vert = attr('vert');
    const envolver = attr('wrap') === 'none';
    const escritura = vert === 'vert' || vert === 'eaVert' ? 'writing-mode:vertical-rl;' : vert === 'vert270' ? 'writing-mode:vertical-rl;transform:rotate(180deg);' : '';
    textoHtml = `<div style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:${justificar};padding:${r2(ins('tIns', 45720))}pt ${r2(ins('rIns', 91440))}pt ${r2(ins('bIns', 45720))}pt ${r2(ins('lIns', 91440))}pt;box-sizing:border-box;${envolver ? 'white-space:nowrap;' : ''}${escritura}overflow:visible">${html}</div>`;
  }

  // Geometría y relleno
  const prstGeom = hijo(spPr, 'prstGeom');
  const cust = hijo(spPr, 'custGeom');
  const prst = prstGeom?.a.prst ?? (cust ? 'custom' : 'rect');
  const fillRef = hijo(estilo, 'fillRef');
  const lnRef = hijo(estilo, 'lnRef');
  let relleno = resolverRelleno(spPr, fillRef, c);
  let trazo = resolverTrazo(spPr, lnRef, c);
  // Los marcadores de posición sin forma propia no dibujan nada
  if (ph && !hijo(spPr, 'solidFill') && !hijo(spPr, 'gradFill') && !hijo(spPr, 'blipFill')) relleno = null;
  if (esConector) relleno = null;
  const esLinea = prst === 'line' || prst === 'straightConnector1' || esConector;

  let svg = '';
  const visible = (relleno && relleno.fill !== 'none') || trazo;
  if (visible && w > 0 && h >= 0) {
    let geom: GeometriaSvg | null = null;
    let cuerpoSvg = '';
    const defs: string[] = [];
    if (relleno?.defs) defs.push(relleno.defs);
    const idFlecha = `a${++c.g.idCounter}`;
    const idFlechaIni = `a${++c.g.idCounter}`;
    const conFlechas = trazo && (trazo.fin !== 'none' || trazo.inicio !== 'none');
    if (conFlechas && trazo) {
      if (trazo.fin !== 'none') defs.push(marcadorFlecha(idFlecha, trazo.color));
      if (trazo.inicio !== 'none') defs.push(marcadorFlecha(idFlechaIni, trazo.color));
    }
    const atributosTrazo = trazo
      ? `stroke="${trazo.color}" stroke-width="${r2(trazo.ancho)}" stroke-opacity="${r2(trazo.opacidad)}"${trazo.guiones ? ` stroke-dasharray="${trazo.guiones}"` : ''}${conFlechas ? `${trazo.fin !== 'none' ? ` marker-end="url(#${idFlecha})"` : ''}${trazo.inicio !== 'none' ? ` marker-start="url(#${idFlechaIni})"` : ''}` : ''} stroke-linejoin="round"`
      : 'stroke="none"';
    if (cust) {
      for (const r of geometriaPersonalizada(cust).rutas) {
        const sx = r.w ? w / r.w : 1;
        const sy = r.h ? h / r.h : 1;
        const fill = r.sinRelleno || !relleno ? 'none' : relleno.fill;
        cuerpoSvg += `<path d="${r.d}" transform="scale(${sx} ${sy})" fill="${fill}" fill-opacity="${relleno?.opacidad ?? 1}" ${r.sinTrazo || !trazo ? 'stroke="none"' : atributosTrazo} vector-effect="non-scaling-stroke"/>`;
      }
    } else {
      geom = geometriaPredefinida(prst, w, h, leerAjustes(prstGeom));
      if (!geom) {
        c.g.avisos.add('Algunas formas especiales se dibujan de forma aproximada (como rectángulos).');
        geom = { d: `M0 0H${r2(w)}V${r2(h)}H0Z` };
      }
      const fill = esLinea || geom.soloLinea || !relleno ? 'none' : relleno.fill;
      cuerpoSvg = `<path d="${geom.d}" fill="${fill}" fill-opacity="${relleno?.opacidad ?? 1}"${geom.evenodd ? ' fill-rule="evenodd"' : ''} ${atributosTrazo}/>`;
    }
    const flip = b.flipH || b.flipV ? `transform="translate(${b.flipH ? r2(w) : 0} ${b.flipV ? r2(h) : 0}) scale(${b.flipH ? -1 : 1} ${b.flipV ? -1 : 1})"` : '';
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(Math.max(h, 0.01))}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible"><defs>${defs.join('')}</defs><g ${flip}>${cuerpoSvg}</g></svg>`;
  }
  if (!svg && !tieneTexto) return '';
  return `<div style="${cajaCss(b)}">${svg}${textoHtml}</div>`;
}

function renderImagen(pic: Nodo, c: CtxParte, T: Transformada): string {
  const spPr = hijo(pic, 'spPr');
  const caja = leerXfrm(hijo(spPr, 'xfrm'));
  if (!caja) return '';
  if (descendiente(hijo(pic, 'nvPicPr'), 'cNvPr')?.a.hidden === '1') return '';
  const blip = descendiente(hijo(pic, 'blipFill'), 'blip');
  const uri = blip?.a.embed ? c.g.imagenes.get(c.rels.get(blip.a.embed)?.destino ?? '') : undefined;
  const b = aplicar(T, caja);
  if (!uri) {
    c.g.avisos.add('Alguna imagen (por ejemplo EMF/WMF o un vídeo) no se pudo incluir.');
    return '';
  }
  const rec = hijo(hijo(pic, 'blipFill'), 'srcRect');
  const v = (k: string) => Math.max(0, Math.min(0.95, num(rec, k) / 100000));
  const l = v('l'), t = v('t'), r = v('r'), bo = v('b');
  const ax = Math.max(0.01, 1 - l - r);
  const ay = Math.max(0.01, 1 - t - bo);
  const geom = hijo(spPr, 'prstGeom')?.a.prst;
  const radio = geom === 'ellipse' ? 'border-radius:50%;' : geom === 'roundRect' ? `border-radius:${r2(Math.min(pt(b.w), pt(b.h)) * 0.16)}pt;` : '';
  const trazo = resolverTrazo(spPr, undefined, c);
  const borde = trazo ? `border:${r2(trazo.ancho)}pt solid ${trazo.color};` : '';
  const flip = b.flipH || b.flipV ? `transform:scale(${b.flipH ? -1 : 1},${b.flipV ? -1 : 1});` : '';
  return `<div style="${cajaCss(b)}overflow:hidden;${radio}${borde}box-sizing:border-box"><img src="${uri}" alt="" style="position:absolute;max-width:none;width:${r2(100 / ax)}%;height:${r2(100 / ay)}%;left:${r2((-l / ax) * 100)}%;top:${r2((-t / ay) * 100)}%;${flip}"></div>`;
}

/* ───────── Tablas ───────── */

interface EstiloCeldaTabla {
  fondo: string | null;
  color: string | null;
  negrita: boolean | null;
  bordes: { L?: string; R?: string; T?: string; B?: string; H?: string; V?: string };
}

function colorDeEstiloTabla(n: Nodo | undefined, c: CtxParte): string | null {
  if (!n) return null;
  const sf = n.n === 'solidFill' ? n : hijo(n, 'solidFill');
  if (sf) return colorDrawingMl(sf.h[0], c.paleta.tema, c.paleta.mapa);
  const ref = hijo(n, 'fillRef') ?? hijo(n, 'lnRef');
  if (ref) return colorDrawingMl(ref.h[0], c.paleta.tema, c.paleta.mapa);
  return null;
}

function parteDeEstilo(nodo: Nodo | undefined, c: CtxParte): EstiloCeldaTabla {
  const r: EstiloCeldaTabla = { fondo: null, color: null, negrita: null, bordes: {} };
  if (!nodo) return r;
  const tx = hijo(nodo, 'tcTxStyle');
  if (tx) {
    if (tx.a.b) r.negrita = tx.a.b === 'on';
    const colorNodo = tx.h.find((x) => ['schemeClr', 'srgbClr', 'sysClr', 'prstClr'].includes(x.n)) ?? hijo(hijo(tx, 'fontRef'), 'schemeClr');
    if (colorNodo) r.color = colorDrawingMl(colorNodo, c.paleta.tema, c.paleta.mapa);
    else {
      const fr = hijo(tx, 'fontRef');
      if (fr?.h[0]) r.color = colorDrawingMl(fr.h[0], c.paleta.tema, c.paleta.mapa);
    }
  }
  const ts = hijo(nodo, 'tcStyle');
  if (ts) {
    const fill = hijo(ts, 'fill');
    r.fondo = colorDeEstiloTabla(fill, c);
    const bd = hijo(ts, 'tcBdr');
    for (const [k, nombre] of [['L', 'left'], ['R', 'right'], ['T', 'top'], ['B', 'bottom'], ['H', 'insideH'], ['V', 'insideV']] as const) {
      const ln = hijo(hijo(bd, nombre), 'ln');
      if (ln) {
        if (hijo(ln, 'noFill')) r.bordes[k] = 'none';
        else {
          const col = colorDeEstiloTabla(ln, c);
          if (col) r.bordes[k] = `${r2(Math.max(0.5, pt(num(ln, 'w', 12700))))}pt solid ${col}`;
        }
      } else {
        const ref = hijo(hijo(bd, nombre), 'lnRef');
        if (ref) {
          const col = colorDrawingMl(ref.h[0], c.paleta.tema, c.paleta.mapa);
          if (col) r.bordes[k] = `1pt solid ${col}`;
        }
      }
    }
  }
  return r;
}

/** Estilos de tabla integrados de PowerPoint que no se guardan en el archivo (Estilo medio 2, énfasis 1–6) */
const ACENTO_ESTILO_INTEGRADO: Record<string, string> = {
  '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': 'accent1', '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE0}': 'accent2', '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': 'accent3',
  '{00A15C55-8517-42AA-B614-E9B94910E393}': 'accent4', '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': 'accent5', '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': 'accent6',
};

function partesIntegradas(id: string, c: CtxParte): Record<string, EstiloCeldaTabla> | null {
  const acento = ACENTO_ESTILO_INTEGRADO[id];
  if (!acento) return null;
  const col = c.paleta.tema.colores[acento] ?? '#4472c4';
  const mezcla = (t: number) => {
    const h = col.replace('#', '');
    const n = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return '#' + n.map((v) => Math.round(v + (255 - v) * (1 - t)).toString(16).padStart(2, '0')).join('');
  };
  const blanco = '1pt solid #ffffff';
  const base: EstiloCeldaTabla = { fondo: mezcla(0.2), color: '#000000', negrita: null, bordes: { L: blanco, R: blanco, T: blanco, B: blanco, H: blanco, V: blanco } };
  return {
    wholeTbl: base,
    band1H: { ...base, fondo: mezcla(0.4) },
    band2H: { ...base },
    band1V: { ...base, fondo: mezcla(0.4) },
    firstRow: { fondo: col, color: '#ffffff', negrita: true, bordes: { B: '3pt solid #ffffff' } },
    lastRow: { fondo: col, color: '#ffffff', negrita: true, bordes: { T: '3pt solid #ffffff' } },
    firstCol: { fondo: col, color: '#ffffff', negrita: true, bordes: {} },
    lastCol: { fondo: col, color: '#ffffff', negrita: true, bordes: {} },
  };
}

function renderTablaPpt(gf: Nodo, c: CtxParte, T: Transformada): string {
  const xf = leerXfrm(hijo(gf, 'xfrm'));
  const tbl = descendiente(gf, 'tbl');
  if (!xf || !tbl) return '';
  const b = aplicar(T, xf);
  const pr = hijo(tbl, 'tblPr');
  const flag = (k: string) => pr?.a[k] === '1' || pr?.a[k] === 'true';
  const idEstilo = hijo(pr, 'tableStyleId')?.t.trim() ?? '';
  const definicion = c.g.estiloTablas.get(idEstilo);
  const partes: Record<string, EstiloCeldaTabla> = {};
  if (definicion) {
    for (const k of ['wholeTbl', 'band1H', 'band2H', 'band1V', 'band2V', 'firstRow', 'lastRow', 'firstCol', 'lastCol']) partes[k] = parteDeEstilo(hijo(definicion, k), c);
  } else {
    Object.assign(partes, partesIntegradas(idEstilo, c) ?? {});
  }
  const todo = partes.wholeTbl ?? { fondo: null, color: null, negrita: null, bordes: {} };

  const anchos = hijos(hijo(tbl, 'tblGrid'), 'gridCol').map((g) => pt(num(g, 'w') * T.sx));
  const filas = hijos(tbl, 'tr');
  const nCols = anchos.length;
  const colgroup = `<colgroup>${anchos.map((w) => `<col style="width:${r2(w)}pt">`).join('')}</colgroup>`;
  const envolver = (hijosTr: string[], i: number) => hijosTr[i];
  void envolver;
  const trs = filas.map((tr, fi) => {
    const alto = pt(num(tr, 'h') * T.sy);
    const tds: string[] = [];
    let col = 0;
    for (const tc of hijos(tr, 'tc')) {
      const span = Math.max(1, num(tc, 'gridSpan', 1));
      const rowSpan = Math.max(1, num(tc, 'rowSpan', 1));
      const esFusion = tc.a.hMerge === '1' || tc.a.hMerge === 'true' || tc.a.vMerge === '1' || tc.a.vMerge === 'true';
      const ci = col;
      col += 1;
      if (esFusion) continue;
      // De menor a mayor prioridad: bandas < primera/última columna < primera/última fila
      const cond: string[] = [];
      const idxBanda = fi - (flag('firstRow') ? 1 : 0);
      if (flag('bandRow') && idxBanda >= 0 && !(flag('lastRow') && fi === filas.length - 1)) cond.push(idxBanda % 2 === 0 ? 'band1H' : 'band2H');
      if (flag('bandCol')) cond.push(ci % 2 === 0 ? 'band1V' : 'band2V');
      if (flag('firstCol') && ci === 0) cond.push('firstCol');
      if (flag('lastCol') && ci + span >= nCols) cond.push('lastCol');
      if (flag('firstRow') && fi === 0) cond.push('firstRow');
      if (flag('lastRow') && fi === filas.length - 1) cond.push('lastRow');
      let est: EstiloCeldaTabla = { ...todo, bordes: { ...todo.bordes } };
      for (const k of cond) {
        const p = partes[k];
        if (!p) continue;
        est = { fondo: p.fondo ?? est.fondo, color: p.color ?? est.color, negrita: p.negrita ?? est.negrita, bordes: { ...est.bordes, ...p.bordes } };
      }
      const tcPr = hijo(tc, 'tcPr');
      const relleno = resolverRelleno(tcPr, undefined, c);
      const fondo = relleno ? (relleno.fill === 'none' ? null : relleno.fill) : est.fondo;
      const lado = (n: 'L' | 'R' | 'T' | 'B'): string | null => {
        const ln = hijo(tcPr, `ln${n}`);
        if (ln) {
          if (hijo(ln, 'noFill')) return 'none';
          const tr = resolverTrazo({ n: 'spPr', a: {}, t: '', h: [ln] }, undefined, c);
          if (tr) return `${r2(tr.ancho)}pt solid ${tr.color}`;
        }
        const propio = est.bordes[n];
        if (propio) return propio;
        const interior = n === 'L' || n === 'R' ? est.bordes.V : est.bordes.H;
        const esExterior = (n === 'T' && fi === 0) || (n === 'B' && fi + rowSpan >= filas.length) || (n === 'L' && ci === 0) || (n === 'R' && ci + span >= nCols);
        return esExterior ? null : (interior ?? null);
      };
      const mar = (k: string, def: number) => pt(tcPr?.a[k] !== undefined ? Number(tcPr.a[k]) : def);
      const txBody = hijo(tc, 'txBody');
      const niveles: Niveles[] = [c.g.defecto, c.maestro.otro];
      const base: EstiloRun = { color: est.color ?? undefined };
      let contenido = '';
      if (txBody) {
        const r = renderParrafos(txBody, c, { niveles, base: est.negrita ? { ...base, b: true } : base, escalaFuente: 1, reduccionInterlineado: 0, numeroDiapositiva: c.numero });
        contenido = r.html;
      }
      const anchor = tcPr?.a.anchor === 'ctr' ? 'middle' : tcPr?.a.anchor === 'b' ? 'bottom' : 'top';
      const estiloTd = [
        `padding:${r2(mar('marT', 45720))}pt ${r2(mar('marR', 91440))}pt ${r2(mar('marB', 45720))}pt ${r2(mar('marL', 91440))}pt`,
        fondo ? `background:${fondo}` : '', ...(['T', 'B', 'L', 'R'] as const).map((n) => { const v = lado(n); return v ? `border-${{ T: 'top', B: 'bottom', L: 'left', R: 'right' }[n]}:${v}` : ''; }),
        `vertical-align:${anchor}`,
      ].filter(Boolean).join(';');
      tds.push(`<td${span > 1 ? ` colspan="${span}"` : ''}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''} style="${estiloTd}">${contenido}</td>`);
      col += span - 1;
    }
    return `<tr style="height:${r2(alto)}pt">${tds.join('')}</tr>`;
  });
  return `<div style="${cajaCss({ ...b, rot: 0 })}"><table style="border-collapse:collapse;table-layout:fixed;width:${r2(pt(b.w))}pt">${colgroup}<tbody>${trs.join('')}</tbody></table></div>`;
}

/* ───────── Recorrido del árbol de formas ───────── */

function renderArbol(arbol: Nodo | undefined, c: CtxParte, T: Transformada, esPlantilla: boolean): string {
  if (!arbol) return '';
  const salida: string[] = [];
  for (const n of arbol.h) {
    if (n.n === 'sp') salida.push(renderForma(n, c, T, esPlantilla));
    else if (n.n === 'cxnSp') salida.push(renderForma(n, c, T, esPlantilla, true));
    else if (n.n === 'pic') salida.push(esPlantilla && infoPh(n) ? '' : renderImagen(n, c, T));
    else if (n.n === 'graphicFrame') {
      if (esPlantilla) continue;
      if (descendiente(n, 'tbl')) salida.push(renderTablaPpt(n, c, T));
      else {
        const xf = leerXfrm(hijo(n, 'xfrm'));
        if (xf) {
          const b = aplicar(T, xf);
          const grafico = !!descendiente(n, 'chart');
          c.g.avisos.add(grafico ? 'Los gráficos de PowerPoint no se pueden dibujar y se sustituyen por un recuadro.' : 'Algún objeto incrustado (SmartArt, vídeo…) no se pudo dibujar.');
          salida.push(`<div style="${cajaCss(b)}border:1px solid #bbb;background:#f6f6f6;display:flex;align-items:center;justify-content:center;color:#777;font:12pt sans-serif;box-sizing:border-box">${grafico ? '[Gráfico]' : '[Objeto]'}</div>`);
        }
      }
    } else if (n.n === 'grpSp') {
      const gx = hijo(hijo(n, 'grpSpPr'), 'xfrm');
      const off = hijo(gx, 'off');
      const ext = hijo(gx, 'ext');
      const choff = hijo(gx, 'chOff');
      const chext = hijo(gx, 'chExt');
      let T2 = T;
      if (off && ext && choff && chext) {
        const sx = num(chext, 'cx') ? num(ext, 'cx') / num(chext, 'cx') : 1;
        const sy = num(chext, 'cy') ? num(ext, 'cy') / num(chext, 'cy') : 1;
        // hijo(x) → grupo: X = off + (x − chOff)·s; luego la transformada del padre
        const gxA = sx * 1;
        const tx0 = num(off, 'x') - num(choff, 'x') * sx;
        const ty0 = num(off, 'y') - num(choff, 'y') * sy;
        T2 = { sx: T.sx * gxA, sy: T.sy * sy, tx: T.sx * tx0 + T.tx, ty: T.sy * ty0 + T.ty };
      }
      salida.push(renderArbol(n, c, T2, esPlantilla));
    }
  }
  return salida.join('');
}

function fondoCss(fondo: Nodo | undefined, c: CtxParte): string | null {
  if (!fondo) return null;
  const bgPr = hijo(fondo, 'bgPr');
  const bgRef = hijo(fondo, 'bgRef');
  const rel = resolverRelleno(bgPr, bgRef, c);
  if (!rel) return null;
  if (rel.fill === 'none') return null;
  if (rel.fill.startsWith('url(#')) {
    // Degradado o imagen: se dibuja como SVG de fondo (en el HTML se inserta aparte)
    return `@@svg:${rel.defs}|${rel.fill}`;
  }
  const { opacidad } = rel;
  return opacidad < 1 ? `rgba(${[1, 3, 5].map((i) => parseInt(rel.fill.slice(i, i + 2), 16)).join(',')},${r2(opacidad)})` : rel.fill;
}

/* ───────── Punto de entrada ───────── */

export async function pptxAHtml(datos: Uint8Array): Promise<ResultadoOffice> {
  const paquete = await Paquete.abrir(datos);
  const pres = await paquete.xml('ppt/presentation.xml');
  if (!pres) throw new Error('El archivo no contiene una presentación de PowerPoint (falta ppt/presentation.xml). Si es un .ppt antiguo, guárdalo como .pptx.');
  const relsPres = await paquete.relaciones('ppt/presentation.xml');
  const tamano = hijo(pres, 'sldSz');
  const ancho = num(tamano, 'cx', 12192000);
  const alto = num(tamano, 'cy', 6858000);

  const g: Global = { paquete, imagenes: new Map(), avisos: new Set(), estiloTablas: new Map(), defecto: [], ancho, alto, idCounter: 0 };
  const tablasXml = await paquete.xml('ppt/tableStyles.xml');
  for (const s of hijos(tablasXml, 'tblStyle')) if (s.a.styleId) g.estiloTablas.set(s.a.styleId, s);

  // Estilos de texto por defecto de la presentación (con la paleta del primer patrón)
  const maestros = new Map<string, Maestro>();
  const cargarMaestro = async (rutaMaestro: string): Promise<Maestro> => {
    const previo = maestros.get(rutaMaestro);
    if (previo) return previo;
    const x = await paquete.xml(rutaMaestro);
    const rels = await paquete.relaciones(rutaMaestro);
    const temaRel = [...rels.values()].find((r) => r.tipo.endsWith('/theme'));
    const tema = leerTema(temaRel ? await paquete.xml(temaRel.destino) : null);
    const mapa: Record<string, string> = {};
    const cm = hijo(x, 'clrMap');
    if (cm) for (const [k, v] of Object.entries(cm.a)) mapa[k] = v;
    const paleta: Paleta = { tema, mapa };
    const tx = hijo(x, 'txStyles');
    const m: Maestro = {
      ruta: rutaMaestro, paleta, arbol: ruta(x, 'cSld', 'spTree'), fondo: ruta(x, 'cSld', 'bg'), rels,
      titulo: leerNiveles(hijo(tx, 'titleStyle'), paleta), cuerpo: leerNiveles(hijo(tx, 'bodyStyle'), paleta), otro: leerNiveles(hijo(tx, 'otherStyle'), paleta),
    };
    maestros.set(rutaMaestro, m);
    return m;
  };

  // Lista de diapositivas en orden
  const idsDiapositivas = hijos(hijo(pres, 'sldIdLst'), 'sldId');
  const rutas: string[] = [];
  for (const id of idsDiapositivas) {
    const rel = relsPres.get(id.a.id ?? '');
    if (rel) rutas.push(rel.destino);
  }
  if (!rutas.length) throw new Error('La presentación no tiene diapositivas.');

  // Estilo de texto por defecto: con la paleta del primer patrón
  const primeraRels = await paquete.relaciones(rutas[0]);
  const relDiseno0 = [...primeraRels.values()].find((r) => r.tipo.endsWith('/slideLayout'));
  const relsDiseno0 = relDiseno0 ? await paquete.relaciones(relDiseno0.destino) : new Map<string, Relacion>();
  const relMaestro0 = [...relsDiseno0.values()].find((r) => r.tipo.endsWith('/slideMaster'));
  const maestro0 = relMaestro0 ? await cargarMaestro(relMaestro0.destino) : null;
  if (maestro0) g.defecto = leerNiveles(hijo(pres, 'defaultTextStyle'), maestro0.paleta);

  // Imágenes de todas las partes
  const cargarImagenes = async (rels: Map<string, Relacion>) => {
    for (const r of rels.values()) {
      if (r.externo || !r.tipo.endsWith('/image') || g.imagenes.has(r.destino)) continue;
      const d = await imagenComoDatos(paquete, r.destino);
      if (d) g.imagenes.set(r.destino, d.uri);
    }
  };

  const secciones: string[] = [];
  const W = pt(ancho);
  const H = pt(alto);
  let numero = 0;
  for (const rutaDiap of rutas) {
    numero++;
    const x = await paquete.xml(rutaDiap);
    if (!x) continue;
    if (x.a.show === '0') continue;
    const rels = await paquete.relaciones(rutaDiap);
    const relDiseno = [...rels.values()].find((r) => r.tipo.endsWith('/slideLayout'));
    const xDiseno = relDiseno ? await paquete.xml(relDiseno.destino) : null;
    const relsDiseno = relDiseno ? await paquete.relaciones(relDiseno.destino) : new Map<string, Relacion>();
    const relMaestro = [...relsDiseno.values()].find((r) => r.tipo.endsWith('/slideMaster'));
    const maestro = relMaestro ? await cargarMaestro(relMaestro.destino) : maestro0;
    if (!maestro) continue;
    await cargarImagenes(rels);
    await cargarImagenes(relsDiseno);
    await cargarImagenes(maestro.rels);
    const diseno: Diseno | null = xDiseno
      ? { ruta: relDiseno!.destino, arbol: ruta(xDiseno, 'cSld', 'spTree'), fondo: ruta(xDiseno, 'cSld', 'bg'), rels: relsDiseno, maestro, mostrarMaestro: xDiseno.a.showMasterSp !== '0' }
      : null;

    const ctxMaestro: CtxParte = { g, paleta: maestro.paleta, rels: maestro.rels, maestro, diseno: null, numero };
    const ctxDiseno: CtxParte = { g, paleta: maestro.paleta, rels: relsDiseno, maestro, diseno, numero };
    const ctxDiap: CtxParte = { g, paleta: maestro.paleta, rels, maestro, diseno, numero };

    // Fondo: de la diapositiva, del diseño o del patrón
    const fondoNodo = ruta(x, 'cSld', 'bg') ?? diseno?.fondo ?? maestro.fondo;
    const ctxFondo = ruta(x, 'cSld', 'bg') ? ctxDiap : diseno?.fondo ? ctxDiseno : ctxMaestro;
    const fondo = fondoCss(fondoNodo, ctxFondo);
    let estiloFondo = 'background:#fff';
    let svgFondo = '';
    if (fondo) {
      if (fondo.startsWith('@@svg:')) {
        const [defs, relleno] = fondo.slice(6).split('|');
        svgFondo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(W)} ${r2(H)}" preserveAspectRatio="none" style="position:absolute;left:0;top:0;width:100%;height:100%"><defs>${defs}</defs><rect width="100%" height="100%" fill="${relleno}"/></svg>`;
      } else estiloFondo = `background:${fondo}`;
    }

    const partes: string[] = [];
    if (diseno?.mostrarMaestro && x.a.showMasterSp !== '0') partes.push(renderArbol(maestro.arbol, ctxMaestro, IDENTIDAD, true));
    if (diseno) partes.push(renderArbol(diseno.arbol, ctxDiseno, IDENTIDAD, true));
    partes.push(renderArbol(ruta(x, 'cSld', 'spTree'), ctxDiap, IDENTIDAD, false));
    secciones.push(`<section class="d" style="${estiloFondo}">${svgFondo}${partes.join('')}</section>`);
  }

  const hoja = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:${r2(W)}pt ${r2(H)}pt;margin:0}.d{position:relative;overflow:hidden;width:${r2(W)}pt;height:${r2(H)}pt;break-after:page;page-break-after:always;display:block}.d:last-child{break-after:auto;page-break-after:auto}td{overflow-wrap:break-word}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Presentación</title><style>${hoja}</style></head><body>${secciones.join('')}</body></html>`;
  return { html, avisos: [...g.avisos], unidades: secciones.length };
}
