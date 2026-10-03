// Lector XML mínimo para los formatos de Office (OOXML). Sin dependencias y sin DOMParser, así funciona igual en Node (pruebas)
// y en el navegador. Los nombres de elementos y atributos se guardan sin prefijo de espacio de nombres («w:p» → «p», «r:id» → «id»).

export interface Nodo {
  /** Nombre local del elemento */
  n: string;
  /** Atributos por nombre local (se ignoran xmlns:*) */
  a: Record<string, string>;
  /** Elementos hijos, en orden */
  h: Nodo[];
  /** Texto directo del elemento (concatenado) */
  t: string;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function desescapar(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENTIDADES[e] ?? m;
  });
}

const sinPrefijo = (s: string) => {
  const i = s.indexOf(':');
  return i < 0 ? s : s.slice(i + 1);
};

const ESPACIO = /[\s]/;

/** Interpreta un documento XML y devuelve el elemento raíz. Lanza un error si no encuentra ninguno. */
export function parsearXml(xml: string): Nodo {
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  const raiz: Nodo = { n: '#raiz', a: {}, h: [], t: '' };
  const pila: Nodo[] = [raiz];
  const largo = xml.length;
  let i = 0;
  while (i < largo) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) {
      const actual = pila[pila.length - 1];
      if (pila.length > 1) actual.t += desescapar(xml.slice(i, lt));
    }
    if (xml.startsWith('<!--', lt)) {
      const fin = xml.indexOf('-->', lt + 4);
      i = fin < 0 ? largo : fin + 3;
    } else if (xml.startsWith('<![CDATA[', lt)) {
      const fin = xml.indexOf(']]>', lt + 9);
      const texto = xml.slice(lt + 9, fin < 0 ? largo : fin);
      if (pila.length > 1) pila[pila.length - 1].t += texto;
      i = fin < 0 ? largo : fin + 3;
    } else if (xml[lt + 1] === '?') {
      const fin = xml.indexOf('?>', lt + 2);
      i = fin < 0 ? largo : fin + 2;
    } else if (xml[lt + 1] === '!') {
      // <!DOCTYPE ...> (con posible subconjunto interno entre corchetes)
      let j = lt + 2;
      let corchetes = 0;
      while (j < largo) {
        const c = xml[j];
        if (c === '[') corchetes++;
        else if (c === ']') corchetes--;
        else if (c === '>' && corchetes <= 0) break;
        j++;
      }
      i = j + 1;
    } else if (xml[lt + 1] === '/') {
      const fin = xml.indexOf('>', lt + 2);
      if (pila.length > 1) pila.pop();
      i = fin < 0 ? largo : fin + 1;
    } else {
      // Etiqueta de apertura: nombre, atributos, ¿autocierre?
      let j = lt + 1;
      while (j < largo && !ESPACIO.test(xml[j]) && xml[j] !== '>' && xml[j] !== '/') j++;
      const nodo: Nodo = { n: sinPrefijo(xml.slice(lt + 1, j)), a: {}, h: [], t: '' };
      let autocierre = false;
      for (;;) {
        while (j < largo && ESPACIO.test(xml[j])) j++;
        if (j >= largo) break;
        const c = xml[j];
        if (c === '>') {
          j++;
          break;
        }
        if (c === '/') {
          autocierre = true;
          j++;
          continue;
        }
        const ini = j;
        while (j < largo && xml[j] !== '=' && !ESPACIO.test(xml[j]) && xml[j] !== '>' && xml[j] !== '/') j++;
        const nombre = xml.slice(ini, j);
        while (j < largo && ESPACIO.test(xml[j])) j++;
        let valor = '';
        if (xml[j] === '=') {
          j++;
          while (j < largo && ESPACIO.test(xml[j])) j++;
          const comilla = xml[j];
          if (comilla === '"' || comilla === "'") {
            const fin = xml.indexOf(comilla, j + 1);
            valor = xml.slice(j + 1, fin < 0 ? largo : fin);
            j = fin < 0 ? largo : fin + 1;
          } else {
            const ini2 = j;
            while (j < largo && !ESPACIO.test(xml[j]) && xml[j] !== '>') j++;
            valor = xml.slice(ini2, j);
          }
        }
        if (nombre && nombre !== 'xmlns' && !nombre.startsWith('xmlns:')) nodo.a[sinPrefijo(nombre)] = desescapar(valor);
      }
      pila[pila.length - 1].h.push(nodo);
      if (!autocierre) pila.push(nodo);
      i = j;
    }
  }
  const primero = raiz.h[0];
  if (!primero) throw new Error('El archivo XML está vacío o dañado.');
  return primero;
}

/* ───────── Utilidades de recorrido ───────── */

/** Primer hijo con ese nombre */
export function hijo(n: Nodo | undefined | null, nombre: string): Nodo | undefined {
  if (!n) return undefined;
  for (const c of n.h) if (c.n === nombre) return c;
  return undefined;
}

/** Todos los hijos con ese nombre */
export function hijos(n: Nodo | undefined | null, nombre: string): Nodo[] {
  return n ? n.h.filter((c) => c.n === nombre) : [];
}

/** Camino de hijos: `ruta(n, 'a', 'b', 'c')` */
export function ruta(n: Nodo | undefined | null, ...nombres: string[]): Nodo | undefined {
  let actual = n ?? undefined;
  for (const nombre of nombres) {
    actual = hijo(actual, nombre);
    if (!actual) return undefined;
  }
  return actual;
}

/** Primer descendiente con ese nombre (búsqueda en profundidad) */
export function descendiente(n: Nodo | undefined | null, nombre: string): Nodo | undefined {
  if (!n) return undefined;
  for (const c of n.h) {
    if (c.n === nombre) return c;
    const r = descendiente(c, nombre);
    if (r) return r;
  }
  return undefined;
}

/** Todos los descendientes con ese nombre */
export function descendientes(n: Nodo | undefined | null, nombre: string, salida: Nodo[] = []): Nodo[] {
  if (!n) return salida;
  for (const c of n.h) {
    if (c.n === nombre) salida.push(c);
    descendientes(c, nombre, salida);
  }
  return salida;
}

/** Atributo numérico o `def` */
export function num(n: Nodo | undefined | null, atributo: string, def = 0): number {
  const v = n?.a[atributo];
  if (v === undefined || v === '') return def;
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}

/** Interpreta atributos booleanos de OOXML: ausente = verdadero cuando el elemento existe sin `val` */
export function booleano(n: Nodo | undefined | null, atributo = 'val'): boolean | undefined {
  if (!n) return undefined;
  const v = n.a[atributo];
  if (v === undefined) return true;
  return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}

/** Texto de todos los descendientes con ese nombre, concatenado */
export function textoDe(n: Nodo | undefined | null, nombre: string): string {
  return descendientes(n, nombre)
    .map((x) => x.t)
    .join('');
}
