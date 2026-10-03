import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from 'pdf-lib';
import { cargarPdf } from './cargar';
import { parsearPaginas } from './rangos';

export type Posicion =
  | 'sup-izq' | 'sup-centro' | 'sup-der'
  | 'cen-izq' | 'cen-centro' | 'cen-der'
  | 'inf-izq' | 'inf-centro' | 'inf-der';

export type FormatoNumero = 'n' | 'Página n' | 'Página n de N' | 'n / N' | '- n -';
export type FuenteNumero = 'Helvetica' | 'Times' | 'Courier';

export interface OpcionesNumeros {
  posicion: Posicion;
  formato: FormatoNumero;
  tamano: number;
  fuente: FuenteNumero;
  negrita: boolean;
  /** Margen al borde en puntos */
  margen: number;
  /** Número que recibe la primera página numerada */
  inicio: number;
  /** Rango de páginas a numerar; vacío = todas */
  rango: string;
  /** Color #rrggbb */
  color: string;
}

export const NUMEROS_POR_DEFECTO: OpcionesNumeros = {
  posicion: 'inf-centro',
  formato: 'n',
  tamano: 11,
  fuente: 'Helvetica',
  negrita: false,
  margen: 28,
  inicio: 1,
  rango: '',
  color: '#000000',
};

export function textoDeNumero(formato: FormatoNumero, n: number, total: number): string {
  switch (formato) {
    case 'n': return String(n);
    case 'Página n': return `Página ${n}`;
    case 'Página n de N': return `Página ${n} de ${total}`;
    case 'n / N': return `${n} / ${total}`;
    case '- n -': return `- ${n} -`;
  }
}

function fuenteEstandar(f: FuenteNumero, negrita: boolean): StandardFonts {
  if (f === 'Times') return negrita ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  if (f === 'Courier') return negrita ? StandardFonts.CourierBold : StandardFonts.Courier;
  return negrita ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
}

function colorDe(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

/**
 * Posición del texto en el espacio de la página teniendo en cuenta el giro (/Rotate):
 * el número aparece en la esquina visual elegida y se lee derecho.
 */
export function ubicarTexto(
  w: number, h: number, giro: number, posicion: Posicion,
  anchoTexto: number, tamano: number, margen: number,
): { x: number; y: number; angulo: number } {
  const r = (((giro % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const W = r % 180 === 0 ? w : h;
  const H = r % 180 === 0 ? h : w;
  const [fila, col] = posicion.split('-') as ['sup' | 'cen' | 'inf', 'izq' | 'centro' | 'der'];
  const altoLetra = tamano * 0.72;
  const vx = col === 'izq' ? margen : col === 'der' ? W - margen - anchoTexto : (W - anchoTexto) / 2;
  const vy = fila === 'inf' ? margen : fila === 'sup' ? H - margen - altoLetra : (H - altoLetra) / 2;
  switch (r) {
    case 0: return { x: vx, y: vy, angulo: 0 };
    case 90: return { x: w - vy, y: vx, angulo: 90 };
    case 180: return { x: w - vx, y: h - vy, angulo: 180 };
    case 270: return { x: vy, y: h - vx, angulo: 270 };
  }
}

/**
 * `totalVisible` fuerza el "N" de «Página n de N» (la vista previa solo contiene la primera página
 * pero debe mostrar el total real).
 */
export async function numerarPaginas(
  datos: Uint8Array,
  opciones: OpcionesNumeros,
  extra: { totalVisible?: number } = {},
): Promise<Uint8Array> {
  const doc: PDFDocument = await cargarPdf(datos);
  const total = doc.getPageCount();
  const objetivo = opciones.rango.trim() ? new Set(parsearPaginas(opciones.rango, total)) : null;
  const fuente: PDFFont = await doc.embedFont(fuenteEstandar(opciones.fuente, opciones.negrita));
  const color = colorDe(opciones.color);
  let contador = Math.floor(opciones.inicio);
  doc.getPages().forEach((pagina, i) => {
    if (objetivo && !objetivo.has(i)) return;
    const texto = textoDeNumero(opciones.formato, contador, extra.totalVisible ?? total + Math.floor(opciones.inicio) - 1);
    contador++;
    const { width, height } = pagina.getSize();
    const ancho = fuente.widthOfTextAtSize(texto, opciones.tamano);
    const caja = pagina.getMediaBox();
    const pos = ubicarTexto(width, height, pagina.getRotation().angle, opciones.posicion, ancho, opciones.tamano, opciones.margen);
    pagina.drawText(texto, {
      x: caja.x + pos.x,
      y: caja.y + pos.y,
      size: opciones.tamano,
      font: fuente,
      color,
      rotate: degrees(pos.angulo),
    });
  });
  return doc.save();
}
