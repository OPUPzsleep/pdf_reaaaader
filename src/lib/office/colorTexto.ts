// Color de los textos de una página: se compara la página dibujada con texto y sin texto; los píxeles que cambian son el texto.

export interface Rgba {
  ancho: number;
  alto: number;
  datos: Uint8ClampedArray;
}

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Los extremos se redondean a negro y blanco puros: el suavizado de bordes y la compresión del JPEG los dejan en 2–3 puntos de diferencia */
const hex = (n: number) => {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return (v <= 10 ? 0 : v >= 245 ? 255 : v).toString(16).padStart(2, '0');
};

/** Color (RRGGBB) del texto dentro de una región en píxeles, o null si no hay diferencia apreciable entre las dos imágenes. */
export function colorDeRegion(con: Rgba, sin: Rgba, r: Region): string | null {
  const x0 = Math.max(0, Math.floor(r.x0));
  const y0 = Math.max(0, Math.floor(r.y0));
  const x1 = Math.min(con.ancho, sin.ancho, Math.ceil(r.x1));
  const y1 = Math.min(con.alto, sin.alto, Math.ceil(r.y1));
  if (x1 <= x0 || y1 <= y0) return null;
  let maximo = 0;
  const diff = (i: number, j: number) => Math.abs(con.datos[i] - sin.datos[j]) + Math.abs(con.datos[i + 1] - sin.datos[j + 1]) + Math.abs(con.datos[i + 2] - sin.datos[j + 2]);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const d = diff((y * con.ancho + x) * 4, (y * sin.ancho + x) * 4);
      if (d > maximo) maximo = d;
    }
  }
  if (maximo < 90) return null;
  // Se promedian los píxeles de mayor contraste: el interior de los trazos, sin el suavizado de los bordes
  let n = 0;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * con.ancho + x) * 4;
      if (diff(i, (y * sin.ancho + x) * 4) >= maximo * 0.8) {
        r1 += con.datos[i];
        g1 += con.datos[i + 1];
        b1 += con.datos[i + 2];
        n++;
      }
    }
  }
  if (n < 2) return null;
  return `${hex(r1 / n)}${hex(g1 / n)}${hex(b1 / n)}`.toUpperCase();
}
