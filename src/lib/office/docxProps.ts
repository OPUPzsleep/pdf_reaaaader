// Propiedades de formato de Word (WordprocessingML): lectura de rPr/pPr, estilos con herencia y numeración.
import { aplicarMezcla, hexARgb, rgbAHex, type Tema } from './comun';
import { booleano, hijo, hijos, num, type Nodo } from './xml';

export interface Borde {
  estilo: string;
  /** Grosor en pt */
  ancho: number;
  color: string | null;
}

export interface Tabulador {
  tipo: 'left' | 'center' | 'right' | 'decimal' | 'bar' | 'clear';
  /** Posición en pt desde el margen */
  pos: number;
  relleno: string;
}

export interface RPr {
  b?: boolean;
  i?: boolean;
  u?: string;
  strike?: boolean;
  /** #rrggbb o 'auto' */
  color?: string;
  /** pt */
  sz?: number;
  highlight?: string;
  fondo?: string;
  sup?: boolean;
  sub?: boolean;
  fuente?: string;
  caps?: boolean;
  versalitas?: boolean;
  oculto?: boolean;
  /** pt */
  spc?: number;
  estiloCar?: string;
}

export interface PPr {
  jc?: string;
  izq?: number;
  der?: number;
  /** Sangría de primera línea en pt: positiva = primera línea, negativa = sangría francesa */
  primera?: number;
  antes?: number;
  despues?: number;
  interlineado?: { valor: number; regla: string };
  fondo?: string;
  bordes?: { top?: Borde; bottom?: Borde; left?: Borde; right?: Borde };
  numId?: number;
  nivel?: number;
  saltoAntes?: boolean;
  contextual?: boolean;
  mantener?: boolean;
  bidi?: boolean;
  tabs?: Tabulador[];
  estiloP?: string;
}

const NOMBRES_TEMA: Record<string, string> = {
  text1: 'dk1', dark1: 'dk1', background1: 'lt1', light1: 'lt1', text2: 'dk2', dark2: 'dk2', background2: 'lt2', light2: 'lt2',
  accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
  hyperlink: 'hlink', followedHyperlink: 'folHlink',
};

/** Color de Word (`w:color`, `w:shd w:fill`): valor hexadecimal o color de tema con tinte/sombra. */
export function colorWord(n: { a: Record<string, string> } | undefined, tema: Tema, atributo = 'val'): string | undefined {
  if (!n) return undefined;
  const tc = n.a.themeColor ?? n.a.themeFill;
  if (tc && NOMBRES_TEMA[tc]) {
    let rgb = hexARgb(tema.colores[NOMBRES_TEMA[tc]] ?? '#000000');
    const tinte = n.a.themeTint ?? n.a.themeFillTint;
    const sombra = n.a.themeShade ?? n.a.themeFillShade;
    if (tinte) rgb = aplicarMezcla(rgb, [255, 255, 255], 1 - parseInt(tinte, 16) / 255);
    if (sombra) rgb = aplicarMezcla(rgb, [0, 0, 0], 1 - parseInt(sombra, 16) / 255);
    return rgbAHex(rgb);
  }
  const v = n.a[atributo] ?? n.a.fill;
  if (!v || v === 'auto') return v === 'auto' ? 'auto' : undefined;
  return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : undefined;
}

const RESALTADOS: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000',
  darkBlue: '#000080', darkCyan: '#008080', darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000',
  darkYellow: '#808000', darkGray: '#808080', lightGray: '#c0c0c0', black: '#000000', white: '#ffffff',
};

export function leerRPr(n: Nodo | undefined, tema: Tema): RPr {
  const r: RPr = {};
  if (!n) return r;
  for (const c of n.h) {
    switch (c.n) {
      case 'b':
        r.b = booleano(c);
        break;
      case 'i':
        r.i = booleano(c);
        break;
      case 'u':
        r.u = c.a.val === 'none' ? '' : (c.a.val ?? 'single');
        break;
      case 'strike':
      case 'dstrike':
        r.strike = booleano(c);
        break;
      case 'color':
        r.color = colorWord(c, tema);
        break;
      case 'sz':
        r.sz = num(c, 'val') / 2;
        break;
      case 'highlight':
        r.highlight = c.a.val === 'none' ? '' : RESALTADOS[c.a.val ?? ''];
        break;
      case 'shd': {
        const f = colorWord(c, tema, 'fill');
        if (f && f !== 'auto') r.fondo = f;
        break;
      }
      case 'vertAlign':
        r.sup = c.a.val === 'superscript';
        r.sub = c.a.val === 'subscript';
        break;
      case 'rFonts': {
        const tf = c.a.asciiTheme ?? c.a.hAnsiTheme;
        const nombre = c.a.ascii ?? c.a.hAnsi ?? c.a.cs ?? c.a.eastAsia;
        if (tf) r.fuente = tf.startsWith('major') ? '+mj-lt' : '+mn-lt';
        else if (nombre) r.fuente = nombre;
        break;
      }
      case 'caps':
        r.caps = booleano(c);
        break;
      case 'smallCaps':
        r.versalitas = booleano(c);
        break;
      case 'vanish':
        r.oculto = booleano(c);
        break;
      case 'spacing':
        r.spc = num(c, 'val') / 20;
        break;
      case 'rStyle':
        r.estiloCar = c.a.val;
        break;
    }
  }
  return r;
}

export function leerBorde(n: Nodo | undefined, tema: Tema): Borde | undefined {
  if (!n) return undefined;
  const estilo = n.a.val ?? 'single';
  if (estilo === 'nil' || estilo === 'none') return { estilo: 'none', ancho: 0, color: null };
  const c = colorWord(n, tema, 'color');
  return { estilo, ancho: Math.max(0.25, num(n, 'sz', 4) / 8), color: c && c !== 'auto' ? c : null };
}

export function leerBordes(n: Nodo | undefined, tema: Tema): Record<string, Borde | undefined> {
  const o: Record<string, Borde | undefined> = {};
  if (!n) return o;
  for (const c of n.h) {
    const nombre = c.n === 'start' ? 'left' : c.n === 'end' ? 'right' : c.n;
    o[nombre] = leerBorde(c, tema);
  }
  return o;
}

export function leerPPr(n: Nodo | undefined, tema: Tema): PPr {
  const p: PPr = {};
  if (!n) return p;
  for (const c of n.h) {
    switch (c.n) {
      case 'jc':
        p.jc = c.a.val === 'start' ? 'left' : c.a.val === 'end' ? 'right' : c.a.val;
        break;
      case 'ind': {
        const izq = c.a.left ?? c.a.start;
        const der = c.a.right ?? c.a.end;
        if (izq !== undefined) p.izq = Number(izq) / 20;
        if (der !== undefined) p.der = Number(der) / 20;
        if (c.a.hanging !== undefined) p.primera = -Number(c.a.hanging) / 20;
        else if (c.a.firstLine !== undefined) p.primera = Number(c.a.firstLine) / 20;
        break;
      }
      case 'spacing': {
        if (c.a.before !== undefined) p.antes = Number(c.a.before) / 20;
        if (c.a.after !== undefined) p.despues = Number(c.a.after) / 20;
        if (c.a.line !== undefined) p.interlineado = { valor: Number(c.a.line), regla: c.a.lineRule ?? 'auto' };
        break;
      }
      case 'shd': {
        const f = colorWord(c, tema, 'fill');
        if (f && f !== 'auto') p.fondo = f;
        break;
      }
      case 'pBdr':
        p.bordes = leerBordes(c, tema);
        break;
      case 'numPr': {
        const id = hijo(c, 'numId');
        const lv = hijo(c, 'ilvl');
        if (id) p.numId = num(id, 'val');
        if (lv) p.nivel = num(lv, 'val');
        break;
      }
      case 'pageBreakBefore':
        p.saltoAntes = booleano(c);
        break;
      case 'contextualSpacing':
        p.contextual = booleano(c);
        break;
      case 'keepNext':
      case 'keepLines':
        p.mantener = booleano(c);
        break;
      case 'bidi':
        p.bidi = booleano(c);
        break;
      case 'pStyle':
        p.estiloP = c.a.val;
        break;
      case 'tabs': {
        p.tabs = hijos(c, 'tab').map((t) => ({
          tipo: (t.a.val === 'start' ? 'left' : t.a.val === 'end' ? 'right' : (t.a.val ?? 'left')) as Tabulador['tipo'],
          pos: num(t, 'pos') / 20,
          relleno: t.a.leader ?? 'none',
        }));
        break;
      }
    }
  }
  return p;
}

function sinIndefinidos<T extends object>(o: T): Partial<T> {
  const r: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

export const mezclarRPr = (base: RPr, sobre: RPr): RPr => ({ ...base, ...sinIndefinidos(sobre) });

export function mezclarPPr(base: PPr, sobre: PPr): PPr {
  const r: PPr = { ...base, ...sinIndefinidos(sobre) };
  if (base.bordes || sobre.bordes) r.bordes = { ...base.bordes, ...sobre.bordes };
  if (base.tabs || sobre.tabs) {
    // Los tabuladores se acumulan y «clear» quita uno heredado
    const mapa = new Map<number, Tabulador>();
    for (const t of [...(base.tabs ?? []), ...(sobre.tabs ?? [])]) {
      if (t.tipo === 'clear') mapa.delete(t.pos);
      else mapa.set(t.pos, t);
    }
    r.tabs = [...mapa.values()].sort((a, b) => a.pos - b.pos);
  }
  return r;
}

/* ───────── Estilos ───────── */

export interface CondicionTabla {
  tipo: string;
  rPr: RPr;
  pPr: PPr;
  fondo?: string;
  bordes?: Record<string, Borde | undefined>;
}

export interface EstiloWord {
  id: string;
  tipo: string;
  nombre: string;
  basadoEn?: string;
  esDefecto: boolean;
  rPr: RPr;
  pPr: PPr;
  /** Tablas: bordes, relleno y márgenes del estilo */
  tabla?: { bordes: Record<string, Borde | undefined>; fondo?: string; margen?: { top?: number; bottom?: number; left?: number; right?: number }; bandaFilas: number; bandaColumnas: number };
  condiciones: CondicionTabla[];
}

export interface Estilos {
  mapa: Map<string, EstiloWord>;
  rPrDefecto: RPr;
  pPrDefecto: PPr;
  /** id del estilo de párrafo y de tabla predeterminados */
  parrafoDefecto?: string;
  tablaDefecto?: string;
}

export function leerMargenTabla(n: Nodo | undefined): { top?: number; bottom?: number; left?: number; right?: number } {
  const m: { top?: number; bottom?: number; left?: number; right?: number } = {};
  for (const c of n?.h ?? []) {
    const v = num(c, 'w') / 20;
    if (c.n === 'top') m.top = v;
    else if (c.n === 'bottom') m.bottom = v;
    else if (c.n === 'left' || c.n === 'start') m.left = v;
    else if (c.n === 'right' || c.n === 'end') m.right = v;
  }
  return m;
}

export function leerEstilos(raiz: Nodo | null, tema: Tema): Estilos {
  const e: Estilos = { mapa: new Map(), rPrDefecto: {}, pPrDefecto: {} };
  if (!raiz) return e;
  const dd = hijo(raiz, 'docDefaults');
  e.rPrDefecto = leerRPr(hijo(hijo(dd, 'rPrDefault'), 'rPr'), tema);
  e.pPrDefecto = leerPPr(hijo(hijo(dd, 'pPrDefault'), 'pPr'), tema);
  for (const s of hijos(raiz, 'style')) {
    const id = s.a.styleId;
    if (!id) continue;
    const tipo = s.a.type ?? 'paragraph';
    const est: EstiloWord = {
      id,
      tipo,
      nombre: hijo(s, 'name')?.a.val ?? id,
      basadoEn: hijo(s, 'basedOn')?.a.val,
      esDefecto: s.a.default === '1' || s.a.default === 'true',
      rPr: leerRPr(hijo(s, 'rPr'), tema),
      pPr: leerPPr(hijo(s, 'pPr'), tema),
      condiciones: [],
    };
    if (est.esDefecto && tipo === 'paragraph') e.parrafoDefecto = id;
    if (est.esDefecto && tipo === 'table') e.tablaDefecto = id;
    if (tipo === 'table') {
      const tp = hijo(s, 'tblPr');
      const shd = hijo(tp, 'shd');
      est.tabla = {
        bordes: leerBordes(hijo(tp, 'tblBorders'), tema),
        fondo: shd ? colorWord(shd, tema, 'fill') : undefined,
        margen: leerMargenTabla(hijo(tp, 'tblCellMar')),
        bandaFilas: num(hijo(tp, 'tblStyleRowBandSize'), 'val', 1),
        bandaColumnas: num(hijo(tp, 'tblStyleColBandSize'), 'val', 1),
      };
      for (const c of hijos(s, 'tblStylePr')) {
        const tcp = hijo(c, 'tcPr');
        const shdC = hijo(tcp, 'shd');
        est.condiciones.push({
          tipo: c.a.type ?? '',
          rPr: leerRPr(hijo(c, 'rPr'), tema),
          pPr: leerPPr(hijo(c, 'pPr'), tema),
          fondo: shdC ? colorWord(shdC, tema, 'fill') : undefined,
          bordes: leerBordes(hijo(tcp, 'tcBorders'), tema),
        });
      }
    }
    e.mapa.set(id, est);
  }
  return e;
}

/** Propiedades de un estilo con toda su cadena de herencia (el más básico primero). */
export function resolverEstilo(e: Estilos, id: string | undefined): { rPr: RPr; pPr: PPr } {
  const cadena: EstiloWord[] = [];
  const vistos = new Set<string>();
  let actual = id ? e.mapa.get(id) : undefined;
  while (actual && !vistos.has(actual.id)) {
    vistos.add(actual.id);
    cadena.unshift(actual);
    actual = actual.basadoEn ? e.mapa.get(actual.basadoEn) : undefined;
  }
  let rPr: RPr = {};
  let pPr: PPr = {};
  for (const s of cadena) {
    rPr = mezclarRPr(rPr, s.rPr);
    pPr = mezclarPPr(pPr, s.pPr);
  }
  return { rPr, pPr };
}

/* ───────── Numeración ───────── */

export interface NivelNumeracion {
  formato: string;
  texto: string;
  inicio: number;
  pPr: PPr;
  rPr: RPr;
  sufijo: string;
}

export interface Numeracion {
  abstractas: Map<number, Map<number, NivelNumeracion>>;
  numeros: Map<number, { abstracta: number; reinicios: Map<number, number>; niveles: Map<number, NivelNumeracion> }>;
}

export function leerNumeracion(raiz: Nodo | null, tema: Tema): Numeracion {
  const n: Numeracion = { abstractas: new Map(), numeros: new Map() };
  if (!raiz) return n;
  const leerNivel = (l: Nodo): NivelNumeracion => ({
    formato: hijo(l, 'numFmt')?.a.val ?? 'decimal',
    texto: hijo(l, 'lvlText')?.a.val ?? '',
    inicio: num(hijo(l, 'start'), 'val', 1),
    pPr: leerPPr(hijo(l, 'pPr'), tema),
    rPr: leerRPr(hijo(l, 'rPr'), tema),
    sufijo: hijo(l, 'suff')?.a.val ?? 'tab',
  });
  for (const a of hijos(raiz, 'abstractNum')) {
    const niveles = new Map<number, NivelNumeracion>();
    for (const l of hijos(a, 'lvl')) niveles.set(num(l, 'ilvl'), leerNivel(l));
    n.abstractas.set(num(a, 'abstractNumId'), niveles);
  }
  for (const x of hijos(raiz, 'num')) {
    const reinicios = new Map<number, number>();
    const niveles = new Map<number, NivelNumeracion>();
    for (const o of hijos(x, 'lvlOverride')) {
      const ini = hijo(o, 'startOverride');
      if (ini) reinicios.set(num(o, 'ilvl'), num(ini, 'val', 1));
      const lv = hijo(o, 'lvl');
      if (lv) niveles.set(num(o, 'ilvl'), leerNivel(lv));
    }
    n.numeros.set(num(x, 'numId'), { abstracta: num(hijo(x, 'abstractNumId'), 'val'), reinicios, niveles });
  }
  return n;
}

export function nivelDe(n: Numeracion, numId: number, nivel: number): NivelNumeracion | undefined {
  const x = n.numeros.get(numId);
  if (!x) return undefined;
  return x.niveles.get(nivel) ?? n.abstractas.get(x.abstracta)?.get(nivel);
}

const ROMANOS: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];

function aRomano(n: number): string {
  let r = '';
  for (const [v, s] of ROMANOS) {
    while (n >= v) {
      r += s;
      n -= v;
    }
  }
  return r;
}

function aLetras(n: number): string {
  let r = '';
  while (n > 0) {
    n--;
    r = String.fromCharCode(97 + (n % 26)) + r;
    n = Math.floor(n / 26);
  }
  return r;
}

export function formatearNumero(valor: number, formato: string): string {
  switch (formato) {
    case 'decimalZero':
      return String(valor).padStart(2, '0');
    case 'lowerLetter':
      return aLetras(valor);
    case 'upperLetter':
      return aLetras(valor).toUpperCase();
    case 'lowerRoman':
      return aRomano(valor);
    case 'upperRoman':
      return aRomano(valor).toUpperCase();
    case 'ordinal':
      return `${valor}.º`;
    case 'none':
      return '';
    default:
      return String(valor);
  }
}

/** Símbolo para viñetas escritas con las fuentes Symbol/Wingdings (caracteres privados) */
export function simboloViñeta(texto: string): string {
  if (!texto) return '•';
  const cp = texto.codePointAt(0)!;
  if (cp >= 0xf000 && cp <= 0xf0ff) {
    switch (cp & 0xff) {
      case 0xb7:
        return '•';
      case 0xa7:
        return '▪';
      case 0xd8:
        return '➢';
      case 0xfc:
        return '✓';
      case 0x76:
        return '❖';
      case 0x6f:
        return '○';
      case 0xa8:
        return '◻';
      case 0x77:
        return '◆';
      case 0x9f:
        return '•';
      default:
        return '•';
    }
  }
  if (texto === 'o') return '○';
  if (texto === 'ü' || texto === '§') return texto === '§' ? '▪' : '✓';
  return texto;
}
