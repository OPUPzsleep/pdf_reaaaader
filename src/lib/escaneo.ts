export type FiltroEscaneo = 'color' | 'gris' | 'documento' | 'bn';

export const NOMBRE_FILTRO: Record<FiltroEscaneo, string> = {
  color: 'Color',
  gris: 'Escala de grises',
  documento: 'Documento (mejorado)',
  bn: 'Blanco y negro',
};

const luminancia = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

/** Umbral de Otsu sobre un histograma de 256 niveles. */
export function umbralOtsu(hist: number[], total: number): number {
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaB = 0;
  let pesoB = 0;
  let mejor = 0;
  let umbral = 128;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (pesoB === 0) continue;
    const pesoF = total - pesoB;
    if (pesoF === 0) break;
    sumaB += t * hist[t];
    const mB = sumaB / pesoB;
    const mF = (suma - sumaB) / pesoF;
    const varianza = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (varianza > mejor) {
      mejor = varianza;
      umbral = t;
    }
  }
  return umbral;
}

function percentil(hist: number[], total: number, p: number): number {
  const objetivo = total * p;
  let acum = 0;
  for (let i = 0; i < 256; i++) {
    acum += hist[i];
    if (acum >= objetivo) return i;
  }
  return 255;
}

/** Aplica el filtro sobre datos RGBA (ImageData.data) modificándolos en el sitio. */
export function aplicarFiltroDatos(data: Uint8ClampedArray, filtro: FiltroEscaneo): void {
  if (filtro === 'color') return;
  const n = data.length / 4;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < n; i++) {
    const y = luminancia(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = y;
    hist[y]++;
  }
  if (filtro === 'gris') return;

  if (filtro === 'bn') {
    const t = umbralOtsu(hist, n);
    for (let i = 0; i < n; i++) {
      const v = data[i * 4] > t ? 255 : 0;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    }
    return;
  }

  // "documento": el papel (la mayoría de los píxeles claros) pasa a blanco y la tinta se oscurece.
  const bajo = percentil(hist, n, 0.02);
  const alto = Math.max(bajo + 8, percentil(hist, n, 0.75));
  const tabla = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const x = Math.min(1, Math.max(0, (v - bajo) / (alto - bajo)));
    tabla[v] = Math.round(255 * Math.pow(x, 1.4));
  }
  for (let i = 0; i < n; i++) {
    const v = tabla[data[i * 4]];
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
  }
}

/** Dibuja la imagen en un canvas con el giro y el filtro aplicados. `maxLado` limita el tamaño del resultado. */
export function dibujarEscaneo(
  fuente: CanvasImageSource & { width: number; height: number },
  rotacion: number,
  filtro: FiltroEscaneo,
  maxLado: number,
): HTMLCanvasElement {
  const giro = ((rotacion % 360) + 360) % 360;
  const vertical = giro === 90 || giro === 270;
  const escala = Math.min(1, maxLado / Math.max(fuente.width, fuente.height));
  const w = Math.max(1, Math.round(fuente.width * escala));
  const h = Math.max(1, Math.round(fuente.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? h : w;
  canvas.height = vertical ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((giro * Math.PI) / 180);
  ctx.drawImage(fuente, -w / 2, -h / 2, w, h);
  if (filtro !== 'color') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const datos = ctx.getImageData(0, 0, canvas.width, canvas.height);
    aplicarFiltroDatos(datos.data, filtro);
    ctx.putImageData(datos, 0, 0);
  }
  return canvas;
}
