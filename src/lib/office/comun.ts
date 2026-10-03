// Utilidades compartidas por los conversores de Office (docx, xlsx, pptx → HTML).
import JSZip from 'jszip';
import { parsearXml, type Nodo } from './xml';

export const escaparHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texto sin caracteres de control que no son válidos en XML/HTML */
export const limpiarControl = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export const EMU_POR_PT = 12700;
export const emuAPt = (emu: number) => emu / EMU_POR_PT;
export const twipsAPt = (t: number) => t / 20;

/** Redondeo corto para CSS */
export const r2 = (n: number) => String(Math.round(n * 100) / 100);

export function aBase64(datos: Uint8Array): string {
  let bin = '';
  const trozo = 0x8000;
  for (let i = 0; i < datos.length; i += trozo) bin += String.fromCharCode(...datos.subarray(i, i + trozo));
  return btoa(bin);
}

const MIME_IMAGEN: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/** Tipo MIME si el navegador puede mostrar la imagen; null para EMF/WMF y otros formatos no compatibles */
export function mimeDeImagen(ruta: string): string | null {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? '';
  const m = MIME_IMAGEN[ext];
  return m && m !== 'image/tiff' ? m : null;
}

/* ───────── Paquetes OOXML (zip) ───────── */

export class Paquete {
  private constructor(private zip: JSZip) {}

  static async abrir(datos: Uint8Array): Promise<Paquete> {
    try {
      return new Paquete(await JSZip.loadAsync(datos));
    } catch {
      throw new Error('El archivo no parece un documento de Office válido (.docx, .xlsx o .pptx). Los formatos antiguos (.doc, .xls, .ppt) no se admiten: guárdalo de nuevo en el formato actual.');
    }
  }

  tiene(ruta: string): boolean {
    return this.zip.file(normalizarRuta(ruta)) !== null;
  }

  async texto(ruta: string): Promise<string | null> {
    const f = this.zip.file(normalizarRuta(ruta));
    return f ? f.async('string') : null;
  }

  async xml(ruta: string): Promise<Nodo | null> {
    const t = await this.texto(ruta);
    if (t === null) return null;
    try {
      return parsearXml(t);
    } catch {
      return null;
    }
  }

  async bytes(ruta: string): Promise<Uint8Array | null> {
    const f = this.zip.file(normalizarRuta(ruta));
    return f ? f.async('uint8array') : null;
  }

  archivos(prefijo: string): string[] {
    return Object.keys(this.zip.files).filter((n) => n.startsWith(prefijo) && !this.zip.files[n].dir);
  }

  /** Relaciones (`_rels/<archivo>.rels`) de una parte: id → { destino ya resuelto, tipo, modo } */
  async relaciones(parte: string): Promise<Map<string, Relacion>> {
    const carpeta = parte.includes('/') ? parte.slice(0, parte.lastIndexOf('/') + 1) : '';
    const nombre = parte.slice(carpeta.length);
    const x = await this.xml(`${carpeta}_rels/${nombre}.rels`);
    const mapa = new Map<string, Relacion>();
    for (const r of x?.h ?? []) {
      if (r.n !== 'Relationship') continue;
      const externo = r.a.TargetMode === 'External';
      const destino = r.a.Target ?? '';
      mapa.set(r.a.Id, { id: r.a.Id, tipo: r.a.Type ?? '', externo, destino: externo ? destino : resolverRuta(carpeta, destino) });
    }
    return mapa;
  }
}

export interface Relacion {
  id: string;
  tipo: string;
  externo: boolean;
  destino: string;
}

function normalizarRuta(r: string) {
  return r.replace(/^\/+/, '');
}

/** Resuelve un destino relativo de relaciones respecto a la carpeta de la parte */
export function resolverRuta(carpeta: string, destino: string): string {
  if (destino.startsWith('/')) return destino.slice(1);
  const partes = (carpeta + destino).split('/');
  const salida: string[] = [];
  for (const p of partes) {
    if (p === '..') salida.pop();
    else if (p !== '.' && p !== '') salida.push(p);
  }
  return salida.join('/');
}

/** Imagen incrustada como data URI, o null si no se puede mostrar */
export async function imagenComoDatos(paquete: Paquete, ruta: string): Promise<{ uri: string } | null> {
  const mime = mimeDeImagen(ruta);
  if (!mime) return null;
  const bytes = await paquete.bytes(ruta);
  if (!bytes) return null;
  return { uri: `data:${mime};base64,${aBase64(bytes)}` };
}

/* ───────── Fuentes ───────── */

const SERIF = "'Times New Roman', 'Liberation Serif', Times, serif";
const SANS = "Arial, 'Liberation Sans', Helvetica, sans-serif";
const MONO = "'Courier New', 'Liberation Mono', monospace";

const SUSTITUTOS: Record<string, string> = {
  calibri: "Calibri, Carlito, 'Segoe UI', 'Liberation Sans', sans-serif",
  'calibri light': "'Calibri Light', Calibri, Carlito, 'Segoe UI', sans-serif",
  cambria: "Cambria, Caladea, Georgia, 'Liberation Serif', serif",
  arial: SANS,
  'arial narrow': "'Arial Narrow', 'Liberation Sans Narrow', Arial, sans-serif",
  'times new roman': SERIF,
  times: SERIF,
  'courier new': MONO,
  courier: MONO,
  consolas: "Consolas, 'Liberation Mono', monospace",
  verdana: "Verdana, 'DejaVu Sans', sans-serif",
  tahoma: "Tahoma, 'DejaVu Sans', sans-serif",
  'segoe ui': "'Segoe UI', 'Liberation Sans', sans-serif",
  georgia: "Georgia, 'DejaVu Serif', serif",
  'trebuchet ms': "'Trebuchet MS', 'Liberation Sans', sans-serif",
  'century gothic': "'Century Gothic', 'Liberation Sans', sans-serif",
  'book antiqua': "'Book Antiqua', Palatino, 'Liberation Serif', serif",
  'palatino linotype': "'Palatino Linotype', Palatino, 'Liberation Serif', serif",
  garamond: "Garamond, 'Liberation Serif', serif",
  'lucida console': "'Lucida Console', 'Liberation Mono', monospace",
  'comic sans ms': "'Comic Sans MS', 'Comic Neue', sans-serif",
  'symbol': "Symbol, sans-serif",
  aptos: "Aptos, Calibri, Carlito, 'Segoe UI', sans-serif",
  'aptos display': "'Aptos Display', Aptos, Calibri, 'Segoe UI', sans-serif",
  'aptos narrow': "'Aptos Narrow', Calibri, sans-serif",
};

/** Lista de familias CSS para un nombre de fuente de Office, con alternativas parecidas. */
export function familiaCss(nombre: string | undefined | null): string | null {
  const n = (nombre ?? '').trim();
  if (!n) return null;
  const clave = n.toLowerCase();
  const s = SUSTITUTOS[clave];
  if (s) return s;
  const comillas = `'${n.replace(/['"\\]/g, '')}'`;
  const generica = /mono|courier|consol|code|typewriter/i.test(n) ? 'monospace' : /serif|roman|georgia|garamond|palatino|minion|baskerville|bookman|century|cambria|didot|bodoni/i.test(n) && !/sans/i.test(n) ? 'serif' : 'sans-serif';
  return `${comillas}, ${generica}`;
}

/* ───────── Color ───────── */

export type Rgb = [number, number, number];

export function hexARgb(hex: string): Rgb {
  const h = hex.replace('#', '').slice(-6).padStart(6, '0');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}

export const rgbAHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function rgbAHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslARgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Luminosidad: `lumMod` y `lumOff` de DrawingML o `tint` de SpreadsheetML (tint > 0 aclara, < 0 oscurece) */
export function ajustarLuminosidad(c: Rgb, mod: number, off: number): Rgb {
  const [h, s, l] = rgbAHsl(c);
  return hslARgb([h, s, Math.max(0, Math.min(1, l * mod + off))]);
}

export function aplicarTint(c: Rgb, tint: number): Rgb {
  if (!tint) return c;
  const [h, s, l] = rgbAHsl(c);
  const nl = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return hslARgb([h, s, Math.max(0, Math.min(1, nl))]);
}

/** Esquema de colores de un tema (theme1.xml): nombre → #rrggbb */
export type Tema = { colores: Record<string, string>; fuenteTitulos: string | null; fuenteTexto: string | null; anchosLinea: number[] };

const COLORES_TEMA_POR_DEFECTO: Record<string, string> = {
  dk1: '#000000', lt1: '#ffffff', dk2: '#44546a', lt2: '#e7e6e6',
  accent1: '#4472c4', accent2: '#ed7d31', accent3: '#a5a5a5', accent4: '#ffc000', accent5: '#5b9bd5', accent6: '#70ad47',
  hlink: '#0563c1', folHlink: '#954f72',
};

export function leerTema(raiz: Nodo | null): Tema {
  const tema: Tema = { colores: { ...COLORES_TEMA_POR_DEFECTO }, fuenteTitulos: null, fuenteTexto: null, anchosLinea: [6350, 12700, 19050] };
  if (!raiz) return tema;
  const elementos = raiz.h.find((x) => x.n === 'themeElements');
  const esquema = elementos?.h.find((x) => x.n === 'clrScheme');
  for (const c of esquema?.h ?? []) {
    const v = c.h[0];
    if (!v) continue;
    const hex = v.n === 'srgbClr' ? v.a.val : v.n === 'sysClr' ? v.a.lastClr : undefined;
    if (hex) tema.colores[c.n] = '#' + hex.toLowerCase();
  }
  const fuentes = elementos?.h.find((x) => x.n === 'fontScheme');
  const mayor = fuentes?.h.find((x) => x.n === 'majorFont')?.h.find((x) => x.n === 'latin')?.a.typeface;
  const menor = fuentes?.h.find((x) => x.n === 'minorFont')?.h.find((x) => x.n === 'latin')?.a.typeface;
  if (mayor) tema.fuenteTitulos = mayor;
  if (menor) tema.fuenteTexto = menor;
  const lineas = elementos?.h.find((x) => x.n === 'fmtScheme')?.h.find((x) => x.n === 'lnStyleLst');
  if (lineas?.h.length) tema.anchosLinea = lineas.h.map((l) => Number(l.a.w) || 9525);
  return tema;
}

/** Nombre de la fuente del tema (`+mn-lt`, `+mj-lt`) o el propio nombre */
export function resolverFuente(nombre: string | undefined, tema: Tema): string | undefined {
  if (!nombre) return undefined;
  if (nombre === '+mn-lt' || nombre === '+mn-ea' || nombre === '+mn-cs') return tema.fuenteTexto ?? undefined;
  if (nombre === '+mj-lt' || nombre === '+mj-ea' || nombre === '+mj-cs') return tema.fuenteTitulos ?? undefined;
  return nombre;
}

/** Aplica atributos hijos de DrawingML (`lumMod`, `lumOff`, `tint`, `shade`, `alpha`…) a un color base. Devuelve CSS (#rrggbb o rgba()). */
export function colorDrawingMl(c: Nodo | undefined, tema: Tema, mapa: Record<string, string> = {}): string | null {
  if (!c) return null;
  let base: string | null = null;
  switch (c.n) {
    case 'srgbClr':
      base = '#' + (c.a.val ?? '000000').toLowerCase();
      break;
    case 'sysClr':
      base = '#' + (c.a.lastClr ?? (c.a.val === 'window' ? 'ffffff' : '000000')).toLowerCase();
      break;
    case 'prstClr':
      base = ({ black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080' } as Record<string, string>)[c.a.val ?? ''] ?? '#000000';
      break;
    case 'schemeClr': {
      const nombre = mapa[c.a.val ?? ''] ?? c.a.val ?? 'dk1';
      const real = nombre === 'bg1' ? 'lt1' : nombre === 'tx1' ? 'dk1' : nombre === 'bg2' ? 'lt2' : nombre === 'tx2' ? 'dk2' : nombre;
      base = tema.colores[real] ?? tema.colores[nombre] ?? '#000000';
      break;
    }
    default:
      return null;
  }
  let rgb = hexARgb(base);
  let alfa = 1;
  let mod = 1;
  let off = 0;
  for (const m of c.h) {
    const v = Number(m.a.val) / 100000;
    if (m.n === 'lumMod') mod = v;
    else if (m.n === 'lumOff') off = v;
    else if (m.n === 'tint') rgb = aplicarMezcla(rgb, [255, 255, 255], 1 - v);
    else if (m.n === 'shade') rgb = aplicarMezcla(rgb, [0, 0, 0], 1 - v);
    else if (m.n === 'alpha') alfa = v;
    else if (m.n === 'satMod' || m.n === 'hueMod') continue;
  }
  if (mod !== 1 || off !== 0) rgb = ajustarLuminosidad(rgb, mod, off);
  return alfa < 1 ? `rgba(${rgb.map((x) => Math.round(x)).join(',')},${r2(alfa)})` : rgbAHex(rgb);
}

export function aplicarMezcla(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* ───────── Tamaños de papel ───────── */

export const PAPEL_MM: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
