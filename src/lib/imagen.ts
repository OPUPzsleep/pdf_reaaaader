import { orientacionExif, type ImagenEntrada } from './pdf/imagenesAPdf';

/** Convierte cualquier imagen que el navegador sepa leer (WebP, GIF, BMP…) a JPG/PNG listo para pdf-lib. */
export async function normalizarImagen(datos: Uint8Array, nombre: string, tipoMime: string): Promise<ImagenEntrada> {
  const esJpg = /jpe?g/i.test(tipoMime) || /\.jpe?g$/i.test(nombre);
  const esPng = /png/i.test(tipoMime) || /\.png$/i.test(nombre);
  if (esJpg && orientacionExif(datos) === 1) return { datos, tipo: 'jpg' };
  if (esPng) return { datos, tipo: 'png' };
  // Re-codifica respetando la orientación EXIF. Los PNG con transparencia se conservan; el resto va a JPG.
  const mapa = await createImageBitmap(new Blob([datos.slice().buffer], { type: tipoMime }), { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  canvas.width = mapa.width;
  canvas.height = mapa.height;
  const ctx = canvas.getContext('2d')!;
  const conAlfa = !esJpg && /webp|gif|svg|avif/i.test(tipoMime + nombre);
  if (!conAlfa) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(mapa, 0, 0);
  mapa.close();
  const tipo = conAlfa ? 'png' : 'jpg';
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo convertir la imagen.'))), conAlfa ? 'image/png' : 'image/jpeg', 0.95),
  );
  return { datos: new Uint8Array(await blob.arrayBuffer()), tipo };
}
