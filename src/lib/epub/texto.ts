import type { Span } from './tipos';

const LIGADURAS: Record<string, string> = {
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st',
};

// Caracteres no permitidos en XML 1.0 (controles salvo tab, salto de línea y retorno)
// eslint-disable-next-line no-control-regex
const INVALIDOS_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const SUBSTITUTO_SUELTO = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Limpia el texto de un PDF: ligaduras, guiones blandos, espacios raros y caracteres no válidos en XML. */
export function limpiarTexto(s: string): string {
  return s
    .replace(/[ﬀ-ﬆ]/g, (c) => LIGADURAS[c] ?? c)
    .replace(/­/g, '')
    .replace(/[       ]/g, ' ')
    .replace(/[​‌‍﻿]/g, '')
    .replace(INVALIDOS_XML, '')
    .replace(SUBSTITUTO_SUELTO, '');
}

export function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const escaparXmlSeguro = (s: string) => escaparXml(limpiarTexto(s));

export function normalizarClave(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const textoDeSpans = (spans: Span[]) => spans.map((s) => s.texto).join('');

/** Une los spans consecutivos con el mismo estilo. */
export function compactarSpans(spans: Span[]): Span[] {
  const salida: Span[] = [];
  for (const s of spans) {
    if (!s.texto) continue;
    const u = salida[salida.length - 1];
    if (u && u.negrita === s.negrita && u.cursiva === s.cursiva && u.mono === s.mono) u.texto += s.texto;
    else salida.push({ ...s });
  }
  return salida;
}

export function recortarSpans(spans: Span[]): Span[] {
  const r = compactarSpans(spans);
  if (r.length === 0) return r;
  r[0].texto = r[0].texto.replace(/^\s+/, '');
  r[r.length - 1].texto = r[r.length - 1].texto.replace(/\s+$/, '');
  return r.filter((s) => s.texto);
}

const TERMINAL = /[.!?…:;"”»'’)\]]$/;
export const terminaFrase = (t: string) => TERMINAL.test(t.trim());
export const empiezaMayuscula = (t: string) => /^[\s"“«'‘(¿¡\-–—•]*[A-ZÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÇ0-9]/.test(t);
export const empiezaMinuscula = (t: string) => /^[\s"“«'‘(¿¡]*[a-záéíóúüñàèìòùâêîôûç]/.test(t);

/** Marcadores de lista: viñetas, «1.», «a)», «(i)», guiones. */
const MARCADOR_LISTA = /^\s*(?:([•·▪◦‣⁃●○■□▸►\-–—*])|(\(?(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,5})[.)]))\s+(?=\S)/;

export function marcadorDeLista(texto: string): { ordenado: boolean; longitud: number } | null {
  const m = MARCADOR_LISTA.exec(texto);
  if (!m) return null;
  // «- » o «* » solos al principio de frase son viñetas, pero «a)» exige minúscula suelta o número
  return { ordenado: !!m[2], longitud: m[0].length };
}

/** Línea de índice: termina en puntos guía + número de página. */
export const esLineaDeIndice = (t: string) => /(?:\.{3,}|\.\s\.\s\.|…{1,})\s*\d{1,4}\s*$/.test(t.trim());

const ES = ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'por', 'con', 'para', 'es', 'se', 'su', 'del', 'al', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque', 'muy'];
const EN = ['the', 'of', 'and', 'to', 'in', 'is', 'that', 'it', 'for', 'was', 'on', 'with', 'as', 'his', 'he', 'be', 'at', 'by', 'this', 'had', 'not', 'are', 'but', 'from', 'or', 'have', 'an', 'they', 'which', 'you'];
const FR = ['le', 'la', 'les', 'de', 'des', 'et', 'en', 'un', 'une', 'du', 'que', 'est', 'pour', 'qui', 'dans', 'ce', 'il', 'ne', 'pas', 'sur', 'au', 'avec', 'se', 'son', 'plus', 'par'];
const DE = ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus'];
const PT = ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'em', 'um', 'uma', 'para', 'com', 'não', 'do', 'da', 'dos', 'das', 'por', 'se', 'mais', 'como', 'mas', 'foi', 'ao', 'ele'];
const IT = ['il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'che', 'e', 'in', 'un', 'una', 'per', 'con', 'non', 'del', 'della', 'è', 'si', 'da', 'al', 'più', 'ma', 'come'];

const IDIOMAS: Record<string, Set<string>> = {
  es: new Set(ES), en: new Set(EN), fr: new Set(FR), de: new Set(DE), pt: new Set(PT), it: new Set(IT),
};

/** Detecta el idioma por palabras frecuentes. Devuelve null si no hay suficiente texto. */
export function detectarIdioma(texto: string): string | null {
  const palabras = texto.toLowerCase().match(/[a-záéíóúüñàèìòùâêîôûçäöß]+/g);
  if (!palabras || palabras.length < 40) return null;
  const muestra = palabras.slice(0, 4000);
  let mejor: string | null = null;
  let max = 0;
  for (const [cod, set] of Object.entries(IDIOMAS)) {
    let n = 0;
    for (const p of muestra) if (set.has(p)) n++;
    if (n > max) {
      max = n;
      mejor = cod;
    }
  }
  return max / muestra.length > 0.12 ? mejor : null;
}

export function normalizarIdioma(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const m = /^([a-z]{2,3})(?:[-_][A-Za-z0-9]+)*$/i.exec(codigo.trim());
  return m ? m[1].toLowerCase() : null;
}
