import type { FormatoImagen, OpImagen, ResultadoImagen } from '../types/api';
import { requerirApi } from './platform';

export const extensionDe = (f: FormatoImagen) => (f === 'jpeg' ? 'jpg' : f === 'tiff' ? 'tif' : f);

export const mimeDe = (f: FormatoImagen) => `image/${f}`;

/** sharp no lee BMP: se decodifica con el navegador y se envía como PNG. */
export async function prepararParaSharp(archivo: File, datos: Uint8Array): Promise<Uint8Array> {
  if (!/\.bmp$/i.test(archivo.name) && archivo.type !== 'image/bmp') return datos;
  const mapa = await createImageBitmap(new Blob([datos.slice().buffer], { type: 'image/bmp' }));
  const canvas = document.createElement('canvas');
  canvas.width = mapa.width;
  canvas.height = mapa.height;
  canvas.getContext('2d')!.drawImage(mapa, 0, 0);
  mapa.close();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer el BMP.'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function procesarImagenEnApp(datos: Uint8Array, operacion: OpImagen): Promise<ResultadoImagen> {
  return requerirApi().imagen.procesar({ datos, operacion });
}
