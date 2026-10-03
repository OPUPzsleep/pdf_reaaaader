// Evaluador de fórmulas de Excel para los libros que no guardan el resultado calculado (los crean librerías y Excel los recalcula al abrir).
// Cubre operadores, referencias a celdas y rangos (también de otras hojas) y las funciones más usadas.

export class ErrorExcel {
  constructor(public codigo: string) {}
  toString() {
    return this.codigo;
  }
}

export type Valor = number | string | boolean | ErrorExcel | null;

export interface FuenteCeldas {
  /** Valor guardado de una celda sin fórmula (o con el resultado ya conocido) */
  valor(hoja: string, fila: number, col: number): Valor | undefined;
  /** Texto de la fórmula si la celda hay que calcularla */
  formula(hoja: string, fila: number, col: number): string | undefined;
  existeHoja(nombre: string): boolean;
}

/* ───────── Referencias ───────── */

export function columnaANumero(letras: string): number {
  let n = 0;
  for (const c of letras.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

export function numeroAColumna(n: number): string {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

/** Desplaza las referencias relativas de una fórmula compartida (las que no llevan $) */
export function desplazarFormula(texto: string, filas: number, columnas: number): string {
  return texto.replace(/(?<![A-Za-z0-9_.!'"])(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/g, (m, dc: string, col: string, df: string, fila: string) => {
    const nc = dc ? columnaANumero(col) : columnaANumero(col) + columnas;
    const nf = df ? Number(fila) : Number(fila) + filas;
    if (nc < 1 || nf < 1) return '#REF!';
    return `${dc}${numeroAColumna(nc)}${df}${nf}`;
  });
}

/* ───────── Lexer ───────── */

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: string }
  | { t: 'ref'; hoja: string | null; c1: number; f1: number; c2: number; f2: number }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: '(' }
  | { t: ')' }
  | { t: ',' };

const ERRORES = ['#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!'];

function leer(texto: string): Token[] {
  const t: Token[] = [];
  let i = 0;
  const s = texto.replace(/^=/, '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let v = '';
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            v += '"';
            j += 2;
            continue;
          }
          break;
        }
        v += s[j++];
      }
      t.push({ t: 'str', v });
      i = j + 1;
      continue;
    }
    if (c === '#') {
      const e = ERRORES.find((x) => s.startsWith(x, i));
      if (e) {
        t.push({ t: 'err', v: e });
        i += e.length;
        continue;
      }
    }
    // Número
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
    if (num && !/^[A-Za-z_$]/.test(s[i])) {
      // No es un número si es parte de una referencia como «A1» (esa empieza por letra, así que aquí no entra)
      t.push({ t: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    // Referencia, nombre de función o booleano (con hoja opcional)
    const ref = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?(\$?[A-Za-z]{1,3}\$?\d{1,7})(?::(\$?[A-Za-z]{1,3}\$?\d{1,7}))?/.exec(s.slice(i));
    if (ref && !/^[A-Za-z_][A-Za-z0-9_.]*\(/.test(s.slice(i))) {
      const parte = (x: string) => {
        const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(x)!;
        return { c: columnaANumero(m[1]), f: Number(m[2]) };
      };
      const a = parte(ref[3]);
      const b = ref[4] ? parte(ref[4]) : a;
      t.push({ t: 'ref', hoja: ref[1] !== undefined ? ref[1].replace(/''/g, "'") : (ref[2] ?? null), c1: Math.min(a.c, b.c), f1: Math.min(a.f, b.f), c2: Math.max(a.c, b.c), f2: Math.max(a.f, b.f) });
      i += ref[0].length;
      continue;
    }
    const nombre = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
    if (nombre) {
      const n = nombre[0];
      const resto = s.slice(i + n.length);
      if (/^\s*\(/.test(resto)) {
        t.push({ t: 'fn', v: n.toUpperCase() });
        i += n.length;
        continue;
      }
      if (/^(TRUE|FALSE)$/i.test(n)) {
        t.push({ t: 'bool', v: n.toUpperCase() === 'TRUE' });
        i += n.length;
        continue;
      }
      t.push({ t: 'err', v: '#NAME?' });
      i += n.length;
      continue;
    }
    if (c === '(') t.push({ t: '(' });
    else if (c === ')') t.push({ t: ')' });
    else if (c === ',' || c === ';') t.push({ t: ',' });
    else if (c === '<' && (s[i + 1] === '=' || s[i + 1] === '>')) {
      t.push({ t: 'op', v: s.slice(i, i + 2) });
      i++;
    } else if (c === '>' && s[i + 1] === '=') {
      t.push({ t: 'op', v: '>=' });
      i++;
    } else if ('+-*/^&=<>%'.includes(c)) t.push({ t: 'op', v: c });
    else {
      t.push({ t: 'err', v: '#NAME?' });
    }
    i++;
  }
  return t;
}

/* ───────── Evaluación ───────── */

type Celdas = Valor[][]; // rango como matriz de filas

const esError = (v: unknown): v is ErrorExcel => v instanceof ErrorExcel;

function aNumero(v: Valor | Celdas): number | ErrorExcel {
  if (Array.isArray(v)) return aNumero(v[0]?.[0] ?? null);
  if (esError(v)) return v;
  if (v === null || v === '') return 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : new ErrorExcel('#VALUE!');
}

function aTexto(v: Valor | Celdas): string | ErrorExcel {
  if (Array.isArray(v)) return aTexto(v[0]?.[0] ?? null);
  if (esError(v)) return v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(Number(v.toPrecision(15)));
  return v;
}

function aLogico(v: Valor | Celdas): boolean | ErrorExcel {
  if (Array.isArray(v)) return aLogico(v[0]?.[0] ?? null);
  if (esError(v)) return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    if (/^true$/i.test(v)) return true;
    if (/^false$/i.test(v)) return false;
    return new ErrorExcel('#VALUE!');
  }
  return false;
}

function comparar(a: Valor, b: Valor, op: string): boolean | ErrorExcel {
  if (esError(a)) return a;
  if (esError(b)) return b;
  const tipo = (x: Valor) => (typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : typeof x === 'boolean' ? 3 : 0);
  let r: number;
  const x = a === null ? (typeof b === 'string' ? '' : 0) : a;
  const y = b === null ? (typeof a === 'string' ? '' : 0) : b;
  if (tipo(x) !== tipo(y)) r = tipo(x) - tipo(y);
  else if (typeof x === 'string') r = x.toLowerCase() < (y as string).toLowerCase() ? -1 : x.toLowerCase() > (y as string).toLowerCase() ? 1 : 0;
  else r = (x as number) - (y as number);
  return op === '=' ? r === 0 : op === '<>' ? r !== 0 : op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0;
}

export class Evaluador {
  private memo = new Map<string, Valor>();
  private enCurso = new Set<string>();

  constructor(private fuente: FuenteCeldas) {}

  /** Valor de una celda: el guardado o el resultado de su fórmula */
  celda(hoja: string, fila: number, col: number): Valor {
    const clave = `${hoja}\u0000${fila}\u0000${col}`;
    const previo = this.memo.get(clave);
    if (previo !== undefined) return previo;
    const f = this.fuente.formula(hoja, fila, col);
    let r: Valor;
    if (f === undefined) {
      const v = this.fuente.valor(hoja, fila, col);
      r = v === undefined ? null : v;
    } else {
      if (this.enCurso.has(clave)) return new ErrorExcel('#REF!');
      this.enCurso.add(clave);
      try {
        r = this.formula(f, hoja);
      } finally {
        this.enCurso.delete(clave);
      }
    }
    this.memo.set(clave, r);
    return r;
  }

  formula(texto: string, hoja: string): Valor {
    try {
      const tokens = leer(texto);
      const p = new Analizador(tokens, hoja, this);
      const r = p.expresion(0);
      if (p.pos < tokens.length) return new ErrorExcel('#NAME?');
      return Array.isArray(r) ? (r[0]?.[0] ?? null) : r;
    } catch (e) {
      return e instanceof ErrorExcel ? e : new ErrorExcel('#VALUE!');
    }
  }

  rango(hoja: string | null, actual: string, c1: number, f1: number, c2: number, f2: number): Celdas {
    const nombre = hoja ?? actual;
    if (hoja !== null && !this.fuente.existeHoja(nombre)) throw new ErrorExcel('#REF!');
    if ((c2 - c1 + 1) * (f2 - f1 + 1) > 500000) throw new ErrorExcel('#VALUE!');
    const salida: Celdas = [];
    for (let f = f1; f <= f2; f++) {
      const fila: Valor[] = [];
      for (let c = c1; c <= c2; c++) fila.push(this.celda(nombre, f, c));
      salida.push(fila);
    }
    return salida;
  }
}

const PRIORIDAD: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };

class Analizador {
  pos = 0;
  constructor(private t: Token[], private hoja: string, private ev: Evaluador) {}

  expresion(minimo: number): Valor | Celdas {
    let izq = this.unario();
    for (;;) {
      const tk = this.t[this.pos];
      if (!tk || tk.t !== 'op' || !(tk.v in PRIORIDAD) || PRIORIDAD[tk.v] < minimo) break;
      this.pos++;
      // «^» asocia por la izquierda en Excel
      const der = this.expresion(PRIORIDAD[tk.v] + 1);
      izq = this.binario(tk.v, izq, der);
    }
    return izq;
  }

  private unario(): Valor | Celdas {
    const tk = this.t[this.pos];
    if (tk?.t === 'op' && (tk.v === '-' || tk.v === '+')) {
      this.pos++;
      const v = this.unario();
      if (tk.v === '+') return v;
      const n = aNumero(v);
      return esError(n) ? n : -n;
    }
    let v = this.primario();
    while (this.t[this.pos]?.t === 'op' && (this.t[this.pos] as { v: string }).v === '%') {
      this.pos++;
      const n = aNumero(v);
      v = esError(n) ? n : n / 100;
    }
    return v;
  }

  private primario(): Valor | Celdas {
    const tk = this.t[this.pos++];
    if (!tk) return new ErrorExcel('#VALUE!');
    switch (tk.t) {
      case 'num':
        return tk.v;
      case 'str':
        return tk.v;
      case 'bool':
        return tk.v;
      case 'err':
        return new ErrorExcel(tk.v);
      case 'ref': {
        const m = this.ev.rango(tk.hoja, this.hoja, tk.c1, tk.f1, tk.c2, tk.f2);
        return tk.c1 === tk.c2 && tk.f1 === tk.f2 ? m[0][0] : m;
      }
      case '(': {
        const v = this.expresion(0);
        if (this.t[this.pos]?.t !== ')') return new ErrorExcel('#VALUE!');
        this.pos++;
        return v;
      }
      case 'fn': {
        if (this.t[this.pos]?.t !== '(') return new ErrorExcel('#NAME?');
        this.pos++;
        const args: (Valor | Celdas)[] = [];
        if (this.t[this.pos]?.t === ')') this.pos++;
        else {
          for (;;) {
            // Argumentos vacíos: «IF(A1,,2)»
            if (this.t[this.pos]?.t === ',' || this.t[this.pos]?.t === ')') args.push(null);
            else args.push(this.expresion(0));
            const sig = this.t[this.pos++];
            if (sig?.t === ')') break;
            if (sig?.t !== ',') return new ErrorExcel('#VALUE!');
          }
        }
        return funcion(tk.v, args, this.hoja, this.ev);
      }
      default:
        return new ErrorExcel('#VALUE!');
    }
  }

  private binario(op: string, a: Valor | Celdas, b: Valor | Celdas): Valor {
    if (op === '&') {
      const x = aTexto(a);
      const y = aTexto(b);
      return esError(x) ? x : esError(y) ? y : x + y;
    }
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
      const x = Array.isArray(a) ? (a[0]?.[0] ?? null) : a;
      const y = Array.isArray(b) ? (b[0]?.[0] ?? null) : b;
      return comparar(x, y, op);
    }
    const x = aNumero(a);
    const y = aNumero(b);
    if (esError(x)) return x;
    if (esError(y)) return y;
    switch (op) {
      case '+':
        return x + y;
      case '-':
        return x - y;
      case '*':
        return x * y;
      case '/':
        return y === 0 ? new ErrorExcel('#DIV/0!') : x / y;
      case '^':
        return Math.pow(x, y);
    }
    return new ErrorExcel('#VALUE!');
  }
}

/* ───────── Funciones ───────── */

function aplanar(args: (Valor | Celdas)[]): { valores: Valor[]; directos: Valor[] } {
  const valores: Valor[] = [];
  const directos: Valor[] = [];
  for (const a of args) {
    if (Array.isArray(a)) for (const fila of a) valores.push(...fila);
    else {
      valores.push(a);
      directos.push(a);
    }
  }
  return { valores, directos };
}

/** Números de los argumentos: en rangos solo cuentan los números; los valores sueltos se convierten */
function numerosDe(args: (Valor | Celdas)[]): number[] | ErrorExcel {
  const salida: number[] = [];
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const fila of a) for (const v of fila) {
        if (esError(v)) return v;
        if (typeof v === 'number') salida.push(v);
      }
    } else {
      if (esError(a)) return a;
      if (a === null) continue;
      const n = aNumero(a);
      if (esError(n)) return n;
      salida.push(n);
    }
  }
  return salida;
}

function criterio(c: Valor): (v: Valor) => boolean {
  if (typeof c === 'number') return (v) => v === c;
  const s = String(c ?? '');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!;
  const op = m[1] ?? '=';
  const resto = m[2];
  const n = Number(resto);
  const esNum = resto !== '' && Number.isFinite(n);
  return (v) => {
    if (esNum && typeof v === 'number') {
      return op === '=' ? v === n : op === '<>' ? v !== n : op === '<' ? v < n : op === '>' ? v > n : op === '<=' ? v <= n : v >= n;
    }
    const sv = v === null ? '' : String(v).toLowerCase();
    const rr = resto.toLowerCase();
    if (rr.includes('*') || rr.includes('?')) {
      const re = new RegExp('^' + rr.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return op === '<>' ? !re.test(sv) : re.test(sv);
    }
    return op === '<>' ? sv !== rr : op === '=' ? sv === rr : false;
  };
}

function funcion(nombre: string, args: (Valor | Celdas)[], hoja: string, ev: Evaluador): Valor {
  void hoja;
  void ev;
  const n = (i: number): number | ErrorExcel => aNumero(args[i] ?? null);
  const redondear = (x: number, d: number, modo: 'normal' | 'arriba' | 'abajo') => {
    const f = 10 ** d;
    const v = x * f;
    const r = modo === 'arriba' ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-12) : modo === 'abajo' ? Math.sign(v) * Math.floor(Math.abs(v) + 1e-12) : Math.sign(v) * Math.round(Math.abs(v) + 1e-12);
    return r / f;
  };
  switch (nombre) {
    case 'SUM':
    case 'SUMA': {
      const v = numerosDe(args);
      return esError(v) ? v : v.reduce((a, b) => a + b, 0);
    }
    case 'PRODUCT':
    case 'PRODUCTO': {
      const v = numerosDe(args);
      return esError(v) ? v : v.reduce((a, b) => a * b, 1);
    }
    case 'AVERAGE':
    case 'PROMEDIO': {
      const v = numerosDe(args);
      return esError(v) ? v : v.length ? v.reduce((a, b) => a + b, 0) / v.length : new ErrorExcel('#DIV/0!');
    }
    case 'MIN': {
      const v = numerosDe(args);
      return esError(v) ? v : v.length ? Math.min(...v) : 0;
    }
    case 'MAX': {
      const v = numerosDe(args);
      return esError(v) ? v : v.length ? Math.max(...v) : 0;
    }
    case 'MEDIAN':
    case 'MEDIANA': {
      const v = numerosDe(args);
      if (esError(v)) return v;
      if (!v.length) return new ErrorExcel('#NUM!');
      const o = [...v].sort((a, b) => a - b);
      return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
    }
    case 'COUNT':
    case 'CONTAR': {
      const { valores } = aplanar(args);
      return valores.filter((v) => typeof v === 'number').length;
    }
    case 'COUNTA':
    case 'CONTARA': {
      const { valores } = aplanar(args);
      return valores.filter((v) => v !== null && v !== '').length;
    }
    case 'ROUND':
    case 'REDONDEAR': {
      const x = n(0);
      const d = n(1);
      return esError(x) ? x : esError(d) ? d : redondear(x, d, 'normal');
    }
    case 'ROUNDUP':
    case 'REDONDEAR.MAS': {
      const x = n(0);
      const d = n(1);
      return esError(x) ? x : esError(d) ? d : redondear(x, d, 'arriba');
    }
    case 'ROUNDDOWN':
    case 'REDONDEAR.MENOS': {
      const x = n(0);
      const d = n(1);
      return esError(x) ? x : esError(d) ? d : redondear(x, d, 'abajo');
    }
    case 'ABS': {
      const x = n(0);
      return esError(x) ? x : Math.abs(x);
    }
    case 'INT':
    case 'ENTERO': {
      const x = n(0);
      return esError(x) ? x : Math.floor(x);
    }
    case 'SQRT':
    case 'RAIZ': {
      const x = n(0);
      return esError(x) ? x : x < 0 ? new ErrorExcel('#NUM!') : Math.sqrt(x);
    }
    case 'POWER':
    case 'POTENCIA': {
      const x = n(0);
      const y = n(1);
      return esError(x) ? x : esError(y) ? y : Math.pow(x, y);
    }
    case 'MOD':
    case 'RESIDUO': {
      const x = n(0);
      const y = n(1);
      if (esError(x)) return x;
      if (esError(y)) return y;
      return y === 0 ? new ErrorExcel('#DIV/0!') : x - y * Math.floor(x / y);
    }
    case 'IF':
    case 'SI': {
      const c = aLogico(args[0] ?? null);
      if (esError(c)) return c;
      const r = c ? args[1] : args.length > 2 ? args[2] : false;
      return Array.isArray(r) ? (r[0]?.[0] ?? null) : (r ?? 0);
    }
    case 'IFERROR':
    case 'SI.ERROR': {
      const v = Array.isArray(args[0]) ? (args[0][0]?.[0] ?? null) : (args[0] ?? null);
      const r = esError(v) ? args[1] : v;
      return Array.isArray(r) ? (r[0]?.[0] ?? null) : (r ?? null);
    }
    case 'AND':
    case 'Y':
    case 'OR':
    case 'O': {
      const { valores } = aplanar(args);
      const bools: boolean[] = [];
      for (const v of valores) {
        if (v === null || v === '') continue;
        const b = aLogico(v);
        if (esError(b)) return b;
        bools.push(b);
      }
      if (!bools.length) return new ErrorExcel('#VALUE!');
      return nombre === 'AND' || nombre === 'Y' ? bools.every(Boolean) : bools.some(Boolean);
    }
    case 'NOT':
    case 'NO': {
      const b = aLogico(args[0] ?? null);
      return esError(b) ? b : !b;
    }
    case 'CONCATENATE':
    case 'CONCAT':
    case 'CONCATENAR': {
      let s = '';
      for (const a of args) {
        const flat = Array.isArray(a) ? a.flat() : [a];
        for (const v of flat) {
          const t = aTexto(v);
          if (esError(t)) return t;
          s += t;
        }
      }
      return s;
    }
    case 'LEN':
    case 'LARGO': {
      const t = aTexto(args[0] ?? null);
      return esError(t) ? t : t.length;
    }
    case 'UPPER':
    case 'MAYUSC': {
      const t = aTexto(args[0] ?? null);
      return esError(t) ? t : t.toUpperCase();
    }
    case 'LOWER':
    case 'MINUSC': {
      const t = aTexto(args[0] ?? null);
      return esError(t) ? t : t.toLowerCase();
    }
    case 'TRIM':
    case 'ESPACIOS': {
      const t = aTexto(args[0] ?? null);
      return esError(t) ? t : t.replace(/\s+/g, ' ').trim();
    }
    case 'LEFT':
    case 'IZQUIERDA': {
      const t = aTexto(args[0] ?? null);
      const k = args.length > 1 ? n(1) : 1;
      return esError(t) ? t : esError(k) ? k : t.slice(0, Math.max(0, k));
    }
    case 'RIGHT':
    case 'DERECHA': {
      const t = aTexto(args[0] ?? null);
      const k = args.length > 1 ? n(1) : 1;
      return esError(t) ? t : esError(k) ? k : k <= 0 ? '' : t.slice(-k);
    }
    case 'MID':
    case 'EXTRAE': {
      const t = aTexto(args[0] ?? null);
      const a = n(1);
      const k = n(2);
      return esError(t) ? t : esError(a) ? a : esError(k) ? k : t.slice(Math.max(0, a - 1), Math.max(0, a - 1) + Math.max(0, k));
    }
    case 'SUMIF':
    case 'SUMAR.SI':
    case 'COUNTIF':
    case 'CONTAR.SI':
    case 'AVERAGEIF':
    case 'PROMEDIO.SI': {
      const rango = args[0];
      const c = args[1];
      if (!Array.isArray(rango)) return new ErrorExcel('#VALUE!');
      const test = criterio(Array.isArray(c) ? (c[0]?.[0] ?? null) : (c ?? null));
      const suma = args[2];
      const valores = rango.flat();
      const objetivo = Array.isArray(suma) ? suma.flat() : valores;
      let total = 0;
      let cuantos = 0;
      valores.forEach((v, i) => {
        if (!test(v)) return;
        cuantos++;
        const o = objetivo[i];
        if (typeof o === 'number') total += o;
      });
      if (nombre === 'COUNTIF' || nombre === 'CONTAR.SI') return cuantos;
      if (nombre === 'AVERAGEIF' || nombre === 'PROMEDIO.SI') return cuantos ? total / cuantos : new ErrorExcel('#DIV/0!');
      return total;
    }
    case 'PI':
      return Math.PI;
    default:
      return new ErrorExcel('#NAME?');
  }
}
