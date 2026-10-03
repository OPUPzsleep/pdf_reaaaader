/**
 * Interpreta rangos de páginas escritos por el usuario ("1-3, 5, 8-") y devuelve índices base 0.
 * Admite "n", "a-b", "a-" (hasta el final) y "-b" (desde el principio).
 */
export function parsearGrupos(texto: string, total: number): number[][] {
  const limpio = texto.trim();
  if (!limpio) throw new Error('Escribe al menos un rango de páginas, por ejemplo: 1-3, 5');
  const grupos: number[][] = [];
  for (const crudo of limpio.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)(?:(-)(\d*))?$/.exec(crudo);
    if (!m || (!m[1] && !m[3])) throw new Error(`No entiendo «${crudo}». Usa números y rangos como 1-3, 5, 8-`);
    const a = m[1] ? parseInt(m[1], 10) : 1;
    const b = m[2] ? (m[3] ? parseInt(m[3], 10) : total) : a;
    if (a < 1 || b < 1) throw new Error('Las páginas empiezan en 1.');
    if (a > total || b > total) throw new Error(`La página ${Math.max(a, b)} no existe: el PDF tiene ${total}.`);
    if (a > b) throw new Error(`El rango ${a}-${b} está al revés.`);
    const g: number[] = [];
    for (let i = a; i <= b; i++) g.push(i - 1);
    grupos.push(g);
  }
  return grupos;
}

/** Igual que parsearGrupos pero devuelve una lista plana, sin repetidos y en orden ascendente. */
export function parsearPaginas(texto: string, total: number): number[] {
  const set = new Set(parsearGrupos(texto, total).flat());
  return [...set].sort((x, y) => x - y);
}

/** Convierte índices base 0 en un texto compacto: [0,1,2,4] → "1-3, 5". */
export function formatearPaginas(indices: number[]): string {
  const orden = [...new Set(indices)].sort((a, b) => a - b);
  const partes: string[] = [];
  let i = 0;
  while (i < orden.length) {
    let j = i;
    while (j + 1 < orden.length && orden[j + 1] === orden[j] + 1) j++;
    partes.push(j > i ? `${orden[i] + 1}-${orden[j] + 1}` : `${orden[i] + 1}`);
    i = j + 1;
  }
  return partes.join(', ');
}
