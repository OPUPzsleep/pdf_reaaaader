export type Decimal = 'coma' | 'punto';

export interface Numero {
  valor: number;
  porcentaje: boolean;
}

const SIMBOLOS = /[$€£¥]/g;

/** Decide si el documento usa coma o punto decimal mirando los números que no admiten duda. */
export function detectarDecimal(textos: string[]): Decimal {
  let coma = 0;
  let punto = 0;
  for (const t0 of textos) {
    const t = t0.replace(SIMBOLOS, '').replace(/[%\s]/g, '');
    if (/^[-+(]?\d{1,3}(\.\d{3})+,\d+\)?$/.test(t) || /^[-+(]?\d+,\d{1,2}\)?$/.test(t) || /^[-+(]?\d+,\d{4,}\)?$/.test(t)) coma++;
    else if (/^[-+(]?\d{1,3}(,\d{3})+\.\d+\)?$/.test(t) || /^[-+(]?\d+\.\d{1,2}\)?$/.test(t) || /^[-+(]?\d+\.\d{4,}\)?$/.test(t)) punto++;
  }
  return punto > coma ? 'punto' : 'coma';
}

/** Interpreta un texto como número si lo es claramente (si no, devuelve null y se conserva como texto). */
export function analizarNumero(texto: string, decimal: Decimal): Numero | null {
  let t = texto.trim().replace(/−/g, '-');
  if (!t || t.length > 24) return null;
  let negativo = false;
  const par = /^\((.*)\)$/.exec(t);
  if (par) {
    negativo = true;
    t = par[1].trim();
  }
  let porcentaje = false;
  if (t.endsWith('%')) {
    porcentaje = true;
    t = t.slice(0, -1).trim();
  }
  t = t.replace(SIMBOLOS, '').trim();
  if (t.startsWith('-')) {
    negativo = !negativo;
    t = t.slice(1).trim();
  } else if (t.startsWith('+')) t = t.slice(1).trim();
  if (!/^\d[\d.,\s'’]*$/.test(t) || /[.,]$/.test(t)) return null;
  // Los códigos con ceros a la izquierda (00123) y las cifras muy largas (teléfonos, IBAN) son texto
  if (/^0\d/.test(t) && !/^0[.,]/.test(t)) return null;
  const limpio = t.replace(/[\s'’]/g, '');
  if (/^\d{11,}$/.test(limpio)) return null;
  const normal = aNormal(limpio, decimal);
  if (normal === null) return null;
  let valor = Number(normal);
  if (!Number.isFinite(valor)) return null;
  if (porcentaje) valor /= 100;
  return { valor: negativo ? -valor : valor, porcentaje };
}

/** Pasa el texto a notación con punto decimal («1.234,5» → «1234.5»), o null si no es un número claro. */
function aNormal(limpio: string, decimal: Decimal): string | null {
  const A = decimal === 'coma' ? ',' : '.'; // decimal esperado en este documento
  const B = decimal === 'coma' ? '.' : ','; // separador de miles esperado
  if (/^\d+$/.test(limpio)) return limpio;
  if (new RegExp(`^\\d{1,3}(?:\\${B}\\d{3})+(?:\\${A}\\d+)?$`).test(limpio)) return limpio.split(B).join('').replace(A, '.');
  if (new RegExp(`^\\d+\\${A}\\d+$`).test(limpio)) return limpio.replace(A, '.');
  // Formato contrario al del documento, cuando no hay duda: 1,234.56 / 12.5
  if (new RegExp(`^\\d{1,3}(?:\\${A}\\d{3})+\\${B}\\d+$`).test(limpio)) return limpio.split(A).join('').replace(B, '.');
  if (new RegExp(`^\\d+\\${B}\\d+$`).test(limpio)) return limpio.replace(B, '.');
  return null;
}
