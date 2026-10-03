// Formatos numéricos de Excel (códigos como «#,##0.00», «dd/mm/yyyy», «0%») aplicados a un valor.

export interface OpcionesFormato {
  /** Libro con el sistema de fechas de 1904 */
  fechas1904: boolean;
  /** Separadores: «es» usa 1.234,56 y «en» 1,234.56 */
  idioma: 'es' | 'en';
}

export const FORMATOS_INTEGRADOS: Record<number, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss',
  22: 'dd/mm/yyyy h:mm', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;[Red](#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;[Red](#,##0.00)',
  41: '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
  45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mmss.0', 48: '##0.0E+0', 49: '@',
};

const MESES = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MESES_CORTOS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const DIAS = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const DIAS_CORTOS = {
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/* ───────── Análisis del código de formato ───────── */

type Token =
  | { t: 'lit'; v: string }
  | { t: 'num'; v: string }
  | { t: 'fecha'; v: string }
  | { t: 'texto' };

interface Seccion {
  tokens: Token[];
  condicion: ((n: number) => boolean) | null;
  esFecha: boolean;
  esTexto: boolean;
  /** Color de texto del formato ([Red], [Blue]…) */
  color: string | null;
}

const COLORES_FORMATO: Record<string, string> = {
  black: '#000000', blue: '#0000ff', cyan: '#00ffff', green: '#00ff00', magenta: '#ff00ff', red: '#ff0000', white: '#ffffff', yellow: '#ffff00',
};

const cache = new Map<string, Seccion[]>();

function dividirSecciones(codigo: string): string[] {
  const partes: string[] = [];
  let actual = '';
  let comillas = false;
  let corchetes = false;
  for (let i = 0; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === '\\' && !comillas) {
      actual += c + (codigo[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') comillas = !comillas;
    else if (!comillas && c === '[') corchetes = true;
    else if (!comillas && c === ']') corchetes = false;
    if (c === ';' && !comillas && !corchetes) {
      partes.push(actual);
      actual = '';
    } else actual += c;
  }
  partes.push(actual);
  return partes;
}

/** ¿Hay letras de fecha u hora fuera de comillas, corchetes y barras invertidas? */
function pareceFecha(src: string): boolean {
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      const fin = src.indexOf('"', i + 1);
      i = fin < 0 ? src.length : fin + 1;
    } else if (c === '\\' || c === '_' || c === '*') i += 2;
    else if (c === '[') {
      const fin = src.indexOf(']', i);
      const dentro = src.slice(i + 1, fin < 0 ? src.length : fin);
      if (/^(h+|m+|s+)$/i.test(dentro)) return true;
      i = fin < 0 ? src.length : fin + 1;
    } else if (/[ymdhsYMDHS]/.test(c) || /^(AM\/PM|A\/P)/i.test(src.slice(i))) return true;
    else i++;
  }
  return false;
}

function analizarSeccion(src: string): Seccion {
  const tokens: Token[] = [];
  let condicion: ((n: number) => boolean) | null = null;
  const esFecha = pareceFecha(src);
  let esTexto = false;
  let color: string | null = null;
  let i = 0;
  const empujarLit = (v: string) => {
    const ult = tokens[tokens.length - 1];
    if (ult && ult.t === 'lit') ult.v += v;
    else tokens.push({ t: 'lit', v });
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      const fin = src.indexOf('"', i + 1);
      empujarLit(src.slice(i + 1, fin < 0 ? src.length : fin));
      i = fin < 0 ? src.length : fin + 1;
    } else if (c === '\\') {
      empujarLit(src[i + 1] ?? '');
      i += 2;
    } else if (c === '_') {
      empujarLit(' ');
      i += 2;
    } else if (c === '*') {
      i += 2;
    } else if (c === '[') {
      const fin = src.indexOf(']', i);
      const dentro = src.slice(i + 1, fin < 0 ? src.length : fin);
      i = fin < 0 ? src.length : fin + 1;
      if (/^(h+|m+|s+)$/i.test(dentro)) {
        tokens.push({ t: 'fecha', v: `[${dentro.toLowerCase()}]` });
      } else if (dentro[0] === '$') {
        const m = /^\$([^-\]]*)/.exec(dentro);
        if (m && m[1]) empujarLit(m[1]);
      } else {
        if (COLORES_FORMATO[dentro.toLowerCase()]) color = COLORES_FORMATO[dentro.toLowerCase()];
        const cond = /^([<>=]+)\s*(-?[\d.]+)$/.exec(dentro);
        if (cond) {
          const n = Number(cond[2]);
          const op = cond[1];
          condicion = op === '>' ? (x) => x > n : op === '>=' ? (x) => x >= n : op === '<' ? (x) => x < n : op === '<=' ? (x) => x <= n : op === '<>' ? (x) => x !== n : (x) => x === n;
        }
        // Colores ([Red], [Color 3]) y otros: se ignoran
      }
    } else if (c === '@') {
      tokens.push({ t: 'texto' });
      esTexto = true;
      i++;
    } else if (esFecha) {
      const ampm = /^(AM\/PM|A\/P)/i.exec(src.slice(i));
      if (ampm) {
        tokens.push({ t: 'fecha', v: ampm[1].toLowerCase() === 'am/pm' ? 'am/pm' : 'a/p' });
        i += ampm[1].length;
      } else if (/[ymdhsYMDHS]/.test(c)) {
        let j = i;
        while (j < src.length && src[j].toLowerCase() === c.toLowerCase()) j++;
        tokens.push({ t: 'fecha', v: src.slice(i, j).toLowerCase() });
        i = j;
      } else if (c === '.' && /^\.0+/.test(src.slice(i))) {
        const m = /^\.0+/.exec(src.slice(i))!;
        tokens.push({ t: 'num', v: m[0] });
        i += m[0].length;
      } else {
        empujarLit(c);
        i++;
      }
    } else if ((c === 'E' || c === 'e') && /^[Ee][+-]/.test(src.slice(i, i + 2))) {
      tokens.push({ t: 'num', v: src.slice(i, i + 2) });
      i += 2;
    } else if (/[0#?.,%]/.test(c)) {
      let j = i;
      while (j < src.length && /[0#?.,%]/.test(src[j])) j++;
      tokens.push({ t: 'num', v: src.slice(i, j) });
      i = j;
    } else {
      empujarLit(c);
      i++;
    }
  }
  return { tokens, condicion, esFecha, esTexto, color };
}

function obtenerSecciones(codigo: string): Seccion[] {
  let s = cache.get(codigo);
  if (!s) {
    s = dividirSecciones(codigo).map(analizarSeccion);
    if (cache.size > 500) cache.clear();
    cache.set(codigo, s);
  }
  return s;
}

/* ───────── Formato de números ───────── */

function separadores(idioma: 'es' | 'en') {
  return idioma === 'es' ? { dec: ',', mil: '.' } : { dec: '.', mil: ',' };
}

function agruparMiles(entero: string, sep: string): string {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Redondeo «hacia fuera» como Excel (0,5 → 1, incluso con errores de coma flotante) */
function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON * Math.sign(n) * Math.abs(n)) * f) / f;
}

export function formatoGeneral(n: number, idioma: 'es' | 'en'): string {
  if (!Number.isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e11 || abs < 1e-9) {
    s = n.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E');
    s = s.replace(/E([+-])(\d)$/, 'E$10$2');
  } else {
    s = String(Number(n.toPrecision(11)));
    if (/e/i.test(s)) s = n.toFixed(10).replace(/\.?0+$/, '');
  }
  return idioma === 'es' ? s.replace('.', ',') : s;
}

function fraccion(x: number, maxDen: number): [number, number] {
  let mejor: [number, number] = [Math.round(x), 1];
  let err = Math.abs(x - mejor[0]);
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(x * d);
    const e = Math.abs(x - n / d);
    if (e < err - 1e-12) {
      err = e;
      mejor = [n, d];
    }
  }
  return mejor;
}

function formatearNumeroSeccion(valor: number, sec: Seccion, o: OpcionesFormato, esNegativoMostrado: boolean): string {
  const { dec, mil } = separadores(o.idioma);
  const tokens = sec.tokens;
  const numTokens = tokens.filter((t): t is { t: 'num'; v: string } => t.t === 'num');
  const cientifico = numTokens.find((t) => /^[Ee][+-]$/.test(t.v));
  const hastaExponente = cientifico ? numTokens.slice(0, numTokens.indexOf(cientifico)) : numTokens;
  const plantillaCompleta = hastaExponente.map((t) => t.v).join('');
  const porcentajes = (plantillaCompleta.match(/%/g) ?? []).length;
  let v = Math.abs(valor) * 100 ** porcentajes;

  // Fracciones («# ?/?»): los literales ' ' y '/' forman parte de la plantilla
  const crudo = tokens.map((t) => (t.t === 'num' ? t.v : t.t === 'lit' ? t.v : '')).join('');
  const mFrac = /([#0?]*)(\s*)([#0?]+)\/([#0?]+|\d+)/.exec(crudo);
  if (mFrac && !cientifico) {
    const digitosDen = /^\d+$/.test(mFrac[4]) ? mFrac[4].length : mFrac[4].length;
    const entero = Math.floor(v);
    const [n, d] = /^\d+$/.test(mFrac[4]) ? [Math.round((v - entero) * Number(mFrac[4])), Number(mFrac[4])] : fraccion(v - entero, 10 ** digitosDen - 1);
    const conEntero = mFrac[1] !== '' || mFrac[2] !== '';
    const cuerpo = conEntero ? (n === 0 ? String(entero) : (entero ? `${entero} ` : '') + `${n}/${d}`) : `${Math.round(v * d)}/${d}`;
    const previo = crudo.slice(0, mFrac.index);
    const posterior = crudo.slice(mFrac.index + mFrac[0].length);
    return (esNegativoMostrado ? '-' : '') + previo + cuerpo + posterior;
  }

  // Comas al final de la plantilla dividen por mil cada una
  let plantilla = plantillaCompleta.replace(/%/g, '');
  const finales = /[0#?](,+)$/.exec(plantilla);
  if (finales) {
    v /= 1000 ** finales[1].length;
    plantilla = plantilla.slice(0, plantilla.length - finales[1].length);
  }
  const posPunto = plantilla.indexOf('.');
  const parteEntera = posPunto < 0 ? plantilla : plantilla.slice(0, posPunto);
  const parteDecimal = posPunto < 0 ? '' : plantilla.slice(posPunto + 1);
  const usaMiles = /[0#?],[0#?]/.test(parteEntera);
  const minEntero = (parteEntera.match(/0/g) ?? []).length;
  const interrogEnt = (parteEntera.match(/\?/g) ?? []).length;
  const decimalesMax = (parteDecimal.match(/[0#?]/g) ?? []).length;
  const decimalesMin = (parteDecimal.match(/0/g) ?? []).length;
  const hayEntero = /[0#?]/.test(parteEntera);

  let cuerpo: string;
  if (cientifico) {
    const exp = v === 0 ? 0 : Math.floor(Math.log10(v));
    const mant = v / 10 ** exp;
    const mStr = redondear(mant, decimalesMax).toFixed(decimalesMax);
    const sig = exp < 0 ? '-' : cientifico.v[1] === '+' ? '+' : '';
    cuerpo = mStr.replace('.', dec) + 'E' + sig + String(Math.abs(exp)).padStart(2, '0');
  } else {
    const r = redondear(v, decimalesMax);
    const partes = r.toFixed(decimalesMax).split('.');
    let e = partes[0];
    let d = partes[1] ?? '';
    // Decimales opcionales (#): se quitan los ceros sobrantes
    while (d.length > decimalesMin && d.endsWith('0')) d = d.slice(0, -1);
    if (e === '0' && minEntero === 0) e = '';
    if (e.length < minEntero) e = e.padStart(minEntero, '0');
    if (interrogEnt && e.length < interrogEnt) e = e.padStart(interrogEnt, '\u2007');
    if (usaMiles && e) e = agruparMiles(e, mil);
    if (!hayEntero) e = '';
    cuerpo = d.length ? `${e}${dec}${d}` : e;
  }
  if (porcentajes) cuerpo += '%'.repeat(porcentajes);

  // Literales que rodean a la plantilla; el cuerpo va donde estaba el primer bloque numérico
  let salida = '';
  let insertado = false;
  for (const t of tokens) {
    if (t.t === 'lit') salida += t.v;
    else if (t.t === 'num' && !insertado) {
      salida += cuerpo;
      insertado = true;
    }
  }
  return (esNegativoMostrado ? '-' : '') + salida;
}

/* ───────── Fechas y horas ───────── */

function fechaDeSerial(serial: number, fechas1904: boolean): { y: number; m: number; d: number; hh: number; mm: number; ss: number; ms: number; dow: number; total: number; especial1900: boolean } {
  let dias = Math.floor(serial);
  let frac = serial - dias;
  let ms = Math.round(frac * 86400000);
  if (ms >= 86400000) {
    ms -= 86400000;
    dias += 1;
  }
  let especial1900 = false;
  let tiempo: number;
  if (fechas1904) tiempo = Date.UTC(1904, 0, 1) + dias * 86400000;
  else if (dias === 60) {
    especial1900 = true;
    tiempo = Date.UTC(1900, 1, 28);
  } else if (dias < 60) tiempo = Date.UTC(1899, 11, 31) + dias * 86400000;
  else tiempo = Date.UTC(1899, 11, 30) + dias * 86400000;
  const f = new Date(tiempo);
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor((ms % 3600000) / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return {
    y: f.getUTCFullYear(), m: f.getUTCMonth(), d: especial1900 ? 29 : f.getUTCDate(), hh, mm, ss, ms: ms % 1000, dow: f.getUTCDay(), total: serial, especial1900,
  };
}

function formatearFecha(valor: number, sec: Seccion, o: OpcionesFormato): string {
  const f = fechaDeSerial(valor, o.fechas1904);
  if (f.especial1900) f.m = 1;
  const idioma = o.idioma;
  const tokens = sec.tokens;
  const ampm = tokens.some((t) => t.t === 'fecha' && /^(am\/pm|a\/p)$/i.test(t.v));
  const horasTotales = Math.floor(valor * 24);
  const minTotales = Math.floor(valor * 1440);
  const segTotales = Math.round(valor * 86400);
  let salida = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === 'lit') {
      salida += t.v;
      continue;
    }
    if (t.t !== 'fecha') {
      if (t.t === 'num' && t.v === '.') salida += '';
      else if (t.t === 'num' && /^\.0+$/.test(t.v)) salida += '.' + String(f.ms).padStart(3, '0').slice(0, t.v.length - 1);
      continue;
    }
    const v = t.v;
    if (v[0] === 'y') salida += v.length <= 2 ? String(f.y % 100).padStart(2, '0') : String(f.y);
    else if (v[0] === 'd') {
      if (v.length === 1) salida += f.d;
      else if (v.length === 2) salida += String(f.d).padStart(2, '0');
      else if (v.length === 3) salida += DIAS_CORTOS[idioma][f.dow];
      else salida += DIAS[idioma][f.dow];
    } else if (v[0] === 'm') {
      // «m» es minuto si va tras horas o antes de segundos
      let anterior: Token | undefined;
      for (let k = i - 1; k >= 0; k--) if (tokens[k].t === 'fecha') { anterior = tokens[k]; break; }
      let siguiente: Token | undefined;
      for (let k = i + 1; k < tokens.length; k++) if (tokens[k].t === 'fecha') { siguiente = tokens[k]; break; }
      const esMinuto = (anterior && anterior.t === 'fecha' && /^(h+|\[h+\])$/.test(anterior.v)) || (siguiente && siguiente.t === 'fecha' && /^(s+|\[s+\])$/.test(siguiente.v));
      if (esMinuto) salida += v.length >= 2 ? String(f.mm).padStart(2, '0') : String(f.mm);
      else if (v.length === 1) salida += f.m + 1;
      else if (v.length === 2) salida += String(f.m + 1).padStart(2, '0');
      else if (v.length === 3) salida += MESES_CORTOS[idioma][f.m];
      else if (v.length === 4) salida += MESES[idioma][f.m];
      else salida += MESES[idioma][f.m][0].toUpperCase();
    } else if (v[0] === 'h') {
      const h = ampm ? f.hh % 12 || 12 : f.hh;
      salida += v.length >= 2 ? String(h).padStart(2, '0') : String(h);
    } else if (v[0] === 's') {
      salida += v.length >= 2 ? String(f.ss).padStart(2, '0') : String(f.ss);
    } else if (v === '[h]' || v === '[hh]') salida += v.length === 4 ? String(horasTotales).padStart(2, '0') : String(horasTotales);
    else if (v === '[m]' || v === '[mm]') salida += v.length === 4 ? String(minTotales).padStart(2, '0') : String(minTotales);
    else if (v === '[s]' || v === '[ss]') salida += String(segTotales);
    else if (/^(am\/pm|a\/p)$/i.test(v)) {
      const pm = f.hh >= 12;
      salida += v.toLowerCase() === 'am/pm' ? (pm ? 'PM' : 'AM') : pm ? 'P' : 'A';
    }
  }
  return salida;
}

/* ───────── Punto de entrada ───────── */

export function esFormatoFecha(codigo: string): boolean {
  if (!codigo || codigo === 'General') return false;
  return obtenerSecciones(codigo).some((s) => s.esFecha);
}

function elegirSeccion(valor: number, codigo: string): { sec: Seccion; indice: number; mostrarSigno: boolean; conCondicion: boolean } {
  const secs = obtenerSecciones(codigo);
  let indice = 0;
  let mostrarSigno = false;
  const conCondicion = secs.some((s) => s.condicion);
  if (conCondicion) {
    indice = secs.findIndex((s) => s.condicion?.(valor));
    if (indice < 0) indice = secs.findIndex((s) => !s.condicion);
    if (indice < 0) indice = secs.length - 1;
  } else if (secs.length >= 3 && valor === 0) indice = 2;
  else if (secs.length >= 2 && valor < 0) indice = 1;
  else if (valor < 0) mostrarSigno = true;
  return { sec: secs[indice] ?? secs[0], indice, mostrarSigno, conCondicion };
}

/** Color de texto que impone el formato para ese valor ([Red] en los negativos, por ejemplo) */
export function colorFormato(valor: number, codigo: string): string | null {
  if (!codigo || codigo === 'General') return null;
  return elegirSeccion(valor, codigo).sec.color;
}

/** Aplica un código de formato a un valor numérico o de texto. */
export function formatearValor(valor: number | string, codigo: string, o: OpcionesFormato): string {
  if (typeof valor === 'string') {
    const secs = obtenerSecciones(codigo || 'General');
    const sec = secs.find((s) => s.esTexto) ?? (secs.length === 4 ? secs[3] : null);
    if (!sec) return valor;
    return sec.tokens.map((t) => (t.t === 'texto' ? valor : t.t === 'lit' ? t.v : '')).join('');
  }
  if (!codigo || codigo === 'General') return formatoGeneral(valor, o.idioma);
  const { sec, indice, mostrarSigno, conCondicion } = elegirSeccion(valor, codigo);
  if (sec.esFecha) return formatearFecha(valor, sec, o);
  if (!sec.tokens.some((t) => t.t === 'num')) return sec.tokens.map((t) => (t.t === 'lit' ? t.v : '')).join('');
  return formatearNumeroSeccion(valor, sec, o, mostrarSigno || (conCondicion && valor < 0 && indice === 0));
}
