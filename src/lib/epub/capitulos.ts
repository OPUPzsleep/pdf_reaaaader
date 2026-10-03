import type { Bloque, Capitulo, EntradaIndice, EstrategiaCapitulos, PaginaExtraida } from './tipos';
import { normalizarClave } from './texto';

export interface ResultadoCapitulos {
  capitulos: Capitulo[];
  /** Estrategia que realmente se usó */
  usada: 'marcadores' | 'titulos' | 'paginas';
  /** Entradas de segundo nivel del índice (marcadores de menor jerarquía), para anidar en el TOC */
  subentradas: EntradaIndice[];
}

const textoDeBloque = (b: Bloque): string =>
  b.tipo === 'h' ? b.texto : b.tipo === 'p' || b.tipo === 'li' ? b.spans.map((s) => s.texto).join('') : '';

function titulosSimilares(a: string, b: string): boolean {
  // Sin espacios: algunos generadores de PDF pierden el espacio donde el título salta de línea
  const x = normalizarClave(a).replace(/ /g, '');
  const y = normalizarClave(b).replace(/ /g, '');
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function posicionDe(b: Bloque, paginas: Map<number, PaginaExtraida>): { pagina: number; y: number } {
  void paginas;
  return { pagina: b.pagina, y: b.y };
}

/** Garantiza que el capítulo empiece por un título coherente con su nombre. */
function conTitulo(titulo: string, bloques: Bloque[]): Bloque[] {
  const primero = bloques.find((b) => b.tipo !== 'img');
  if (primero && primero.tipo === 'h' && titulosSimilares(primero.texto, titulo)) {
    // Si el título del marcador es más completo, se respeta el del contenido tal cual
    return bloques;
  }
  const pagina = bloques[0]?.pagina ?? 0;
  const y = bloques[0]?.y ?? 0;
  return [{ tipo: 'h', nivel: 1, texto: titulo, pagina, y, tam: 0 }, ...bloques];
}

/** Convierte las entradas del índice (marcadores) en límites de capítulo. */
function limitesDeMarcadores(entradas: EntradaIndice[]): { principales: EntradaIndice[]; secundarias: EntradaIndice[] } {
  const nivel0 = entradas.filter((e) => e.nivel === 0);
  let principales: EntradaIndice[];
  if (nivel0.length >= 2) principales = nivel0;
  else {
    const hasta1 = entradas.filter((e) => e.nivel <= 1);
    principales = hasta1.length >= 2 ? hasta1 : [];
  }
  // Mismo lugar = mismo capítulo (se queda el de menor nivel)
  const unicas: EntradaIndice[] = [];
  for (const e of [...principales].sort((a, b) => a.pagina - b.pagina || (b.y ?? 1e9) - (a.y ?? 1e9) || a.nivel - b.nivel)) {
    const u = unicas[unicas.length - 1];
    if (u && u.pagina === e.pagina && (u.y === null || e.y === null || Math.abs(u.y - e.y) < 6)) continue;
    unicas.push(e);
  }
  const secundarias = entradas.filter((e) => !principales.includes(e));
  return { principales: unicas, secundarias };
}

function dividirEn(
  bloques: Bloque[],
  inicios: { titulo: string; pagina: number; y: number | null }[],
  tituloInicio: string,
): Capitulo[] {
  const capitulos: Capitulo[] = [];
  let actual: { titulo: string; bloques: Bloque[] } = { titulo: tituloInicio, bloques: [] };
  let k = 0;
  const cerrar = (final = false) => {
    if (actual.bloques.length === 0 && (capitulos.length === 0 || !final)) {
      // capítulos vacíos solo se conservan si tienen título propio (para no perder entradas del índice)
      if (actual.bloques.length === 0) return;
    }
    const paginasUsadas = actual.bloques.map((b) => b.pagina);
    capitulos.push({
      titulo: actual.titulo,
      bloques: actual.bloques,
      desde: Math.min(...paginasUsadas),
      hasta: Math.max(...paginasUsadas),
    });
  };
  for (const b of bloques) {
    while (k < inicios.length) {
      const e = inicios[k];
      const empieza = b.pagina > e.pagina || (b.pagina === e.pagina && (e.y === null || b.y <= e.y + 3));
      if (!empieza) break;
      cerrar();
      actual = { titulo: e.titulo, bloques: [] };
      k++;
    }
    actual.bloques.push(b);
  }
  cerrar(true);
  // Entradas del índice sin contenido propio (p. ej. dos marcadores en el mismo sitio) ya se filtraron arriba
  return capitulos.map((c) => {
    // Si el contenido ya empieza por el título, se usa el texto real de la página (el del marcador puede venir mal escrito)
    const primero = c.bloques.find((b) => b.tipo !== 'img');
    const titulo = primero && primero.tipo === 'h' && titulosSimilares(primero.texto, c.titulo) ? primero.texto : c.titulo;
    return { ...c, titulo, bloques: conTitulo(titulo, c.bloques) };
  });
}

function porTitulos(bloques: Bloque[], tituloInicio: string): Capitulo[] | null {
  for (const nivel of [1, 2, 3] as const) {
    const titulos = bloques.filter((b) => b.tipo === 'h' && b.nivel === nivel);
    if (titulos.length >= 2) {
      const inicios = titulos.map((b) => ({ titulo: (b as Extract<Bloque, { tipo: 'h' }>).texto, pagina: b.pagina, y: b.y + 1 }));
      return dividirEn(bloques, inicios, tituloInicio);
    }
  }
  return null;
}

function porPaginas(bloques: Bloque[], totalPaginas: number, cadaN: number, tituloInicio: string): Capitulo[] {
  const n = Math.max(1, Math.floor(cadaN) || 15);
  const capitulos: Capitulo[] = [];
  for (let desde = 0; desde < totalPaginas; desde += n) {
    const hasta = Math.min(totalPaginas - 1, desde + n - 1);
    const lista = bloques.filter((b) => b.pagina >= desde && b.pagina <= hasta);
    if (lista.length === 0) continue;
    const primerTitulo = lista.find((b) => b.tipo === 'h');
    const titulo = primerTitulo && primerTitulo.tipo === 'h' ? primerTitulo.texto : capitulos.length === 0 && desde === 0 ? tituloInicio : `Páginas ${desde + 1}–${hasta + 1}`;
    capitulos.push({ titulo, bloques: lista, desde, hasta });
  }
  return capitulos;
}

export function dividirCapitulos(
  bloques: Bloque[],
  paginas: PaginaExtraida[],
  indice: EntradaIndice[],
  estrategia: EstrategiaCapitulos,
  paginasPorCapitulo: number,
  tituloInicio: string,
): ResultadoCapitulos {
  void posicionDe;
  const total = paginas.length;
  const anotar = (cs: Capitulo[]) => cs.filter((c) => c.bloques.length > 0);

  if (estrategia === 'auto' || estrategia === 'marcadores') {
    const { principales, secundarias } = limitesDeMarcadores(indice);
    if (principales.length >= 2) {
      // Los destinos y de los marcadores usan el sistema de la página (y hacia arriba) sin desplazamiento de MediaBox
      const ajustadas = principales.map((e) => ({ titulo: e.titulo, pagina: e.pagina, y: e.y === null ? null : e.y - (paginas[e.pagina]?.origenY ?? 0) }));
      const caps = anotar(dividirEn(bloques, ajustadas, tituloInicio));
      if (caps.length >= 2) return { capitulos: caps, usada: 'marcadores', subentradas: secundarias };
    }
  }
  if (estrategia === 'auto' || estrategia === 'titulos' || estrategia === 'marcadores') {
    const caps = porTitulos(bloques, tituloInicio);
    if (caps && anotar(caps).length >= 2) return { capitulos: anotar(caps), usada: 'titulos', subentradas: [] };
  }
  const caps = porPaginas(bloques, total, paginasPorCapitulo, tituloInicio);
  return { capitulos: anotar(caps).length ? anotar(caps) : [{ titulo: tituloInicio, bloques, desde: 0, hasta: Math.max(0, total - 1) }], usada: 'paginas', subentradas: [] };
}

export { textoDeBloque, titulosSimilares };
