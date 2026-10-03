// CSV → HTML (una tabla que se imprime a PDF). Detecta el separador (coma, punto y coma, tabulador) y las comillas.
import { escaparHtml, limpiarControl } from './comun';
import type { ResultadoOffice } from './docx';

export function parsearCsv(texto: string): string[][] {
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? '';
  const cuenta = (c: string) => primeraLinea.split(c).length - 1;
  const sep = cuenta(';') > cuenta(',') && cuenta(';') >= cuenta('\t') ? ';' : cuenta('\t') > cuenta(',') ? '\t' : ',';
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"' && campo === '') comillas = true;
    else if (c === sep) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

export function csvAHtml(datos: Uint8Array): ResultadoOffice {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    texto = new TextDecoder('windows-1252').decode(datos);
  }
  const filas = parsearCsv(texto).filter((f) => f.some((c) => c.trim() !== ''));
  if (!filas.length) throw new Error('El archivo CSV está vacío.');
  const columnas = Math.max(...filas.map((f) => f.length));
  const ancho = Array.from({ length: columnas }, (_, c) => Math.min(60, Math.max(4, ...filas.slice(0, 200).map((f) => (f[c] ?? '').length))));
  const total = ancho.reduce((a, b) => a + b, 0);
  const horizontal = total > 90;
  const esNumero = (s: string) => /^-?[\d.,]+%?$/.test(s.trim()) && /\d/.test(s);
  const cuerpo = filas
    .map((f, i) => `<tr>${Array.from({ length: columnas }, (_, c) => `<${i === 0 ? 'th' : 'td'}${esNumero(f[c] ?? '') ? ' class="n"' : ''}>${escaparHtml(limpiarControl(f[c] ?? ''))}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`)
    .join('');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>CSV</title><style>@page{size:A4 ${horizontal ? 'landscape' : 'portrait'};margin:12mm}body{font:9pt Arial,'Liberation Sans',sans-serif;-webkit-print-color-adjust:exact}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:0.5pt solid #999;padding:2pt 4pt;overflow-wrap:anywhere;vertical-align:top}th{background:#e8e8e8;text-align:left}td.n{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><table><colgroup>${ancho.map((w) => `<col style="width:${(w / total) * 100}%">`).join('')}</colgroup><tbody>${cuerpo}</tbody></table></body></html>`;
  return { html, avisos: [], unidades: 1 };
}
