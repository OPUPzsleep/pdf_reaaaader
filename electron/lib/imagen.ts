import sharp, { type Sharp } from 'sharp';
import type { FormatoImagen, InfoImagen, OpImagen, ResultadoImagen } from '../../src/types/api';

const aBuffer = (d: Uint8Array) => Buffer.from(d.buffer, d.byteOffset, d.byteLength);

export async function infoImagen(datos: Uint8Array): Promise<InfoImagen> {
  const m = await sharp(aBuffer(datos), { failOn: 'none' }).metadata();
  const girada = (m.orientation ?? 1) >= 5;
  return {
    ancho: (girada ? m.height : m.width) ?? 0,
    alto: (girada ? m.width : m.height) ?? 0,
    formato: m.format ?? 'desconocido',
    bytes: datos.byteLength,
  };
}

function formatoDe(f: string | undefined): FormatoImagen {
  switch (f) {
    case 'jpeg': case 'jpg': return 'jpeg';
    case 'png': return 'png';
    case 'webp': return 'webp';
    case 'gif': return 'gif';
    case 'tiff': return 'tiff';
    case 'avif': return 'avif';
    case 'heif': return 'avif';
    default: return 'png'; // svg y otros se rasterizan a PNG
  }
}

function codificar(img: Sharp, formato: FormatoImagen, calidad: number | undefined, fondo = '#ffffff') {
  switch (formato) {
    case 'jpeg': return img.flatten({ background: fondo }).jpeg({ quality: calidad ?? 90, mozjpeg: true });
    case 'png': return img.png({ compressionLevel: 9 });
    case 'webp': return img.webp({ quality: calidad ?? 90 });
    case 'gif': return img.gif();
    case 'tiff': return img.tiff({ quality: calidad ?? 90, compression: 'jpeg' });
    case 'avif': return img.avif({ quality: calidad ?? 60 });
  }
}

async function salida(img: Sharp, formato: FormatoImagen, calidad?: number, fondo?: string): Promise<ResultadoImagen> {
  const { data, info } = await codificar(img, formato, calidad, fondo).toBuffer({ resolveWithObject: true });
  return { datos: new Uint8Array(data), formato, ancho: info.width, alto: info.height };
}

/** Orienta según EXIF y rasteriza SVG para que el resto de operaciones trabajen sobre píxeles "como se ven". */
async function base(datos: Uint8Array): Promise<{ buf: Buffer; formato: FormatoImagen; origen: string | undefined }> {
  const buf = aBuffer(datos);
  const meta = await sharp(buf, { failOn: 'none' }).metadata();
  const origen = meta.format;
  const esSvg = origen === 'svg';
  const animado = origen === 'gif' && (meta.pages ?? 1) > 1;
  const entrada = sharp(buf, { failOn: 'none', density: esSvg ? 192 : undefined, animated: animado });
  const orientada = await (esSvg ? entrada.png() : entrada.rotate()).toFormat(esSvg ? 'png' : (formatoDe(origen) === 'avif' ? 'png' : formatoDe(origen))).toBuffer();
  return { buf: orientada, formato: esSvg ? 'png' : formatoDe(origen), origen };
}

/** Aplica una operación y devuelve la imagen resultante. */
export async function procesarImagen(datos: Uint8Array, op: OpImagen): Promise<ResultadoImagen> {
  if (op.tipo === 'convertir') {
    const entrada = sharp(aBuffer(datos), { failOn: 'none', density: 192, animated: op.formato === 'gif' });
    const orientada = op.formato === 'gif' ? entrada : entrada.rotate();
    return salida(orientada, op.formato, op.calidad, op.fondo);
  }

  const { buf, formato } = await base(datos);
  const destino = ('formato' in op && op.formato) || formato;
  const calidad = 'calidad' in op ? op.calidad : undefined;
  const img = sharp(buf, { failOn: 'none' });

  switch (op.tipo) {
    case 'redimensionar': {
      const meta = await img.metadata();
      let ancho = op.ancho && op.ancho > 0 ? Math.round(op.ancho) : undefined;
      let alto = op.alto && op.alto > 0 ? Math.round(op.alto) : undefined;
      if (op.porcentaje) {
        const f = Math.max(1, Math.min(500, op.porcentaje)) / 100;
        ancho = Math.max(1, Math.round((meta.width ?? 1) * f));
        alto = Math.max(1, Math.round((meta.height ?? 1) * f));
      }
      if (!ancho && !alto) throw new Error('Indica un ancho, un alto o un porcentaje.');
      const exacto = op.ajuste === 'fill' && !op.porcentaje;
      return salida(
        img.resize({
          width: ancho,
          height: alto,
          fit: exacto && ancho && alto ? 'fill' : 'inside',
          withoutEnlargement: !!op.sinAgrandar && !op.porcentaje,
        }),
        destino,
        calidad,
      );
    }
    case 'recortar': {
      const meta = await img.metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      const left = Math.max(0, Math.min(w - 1, Math.round(op.x)));
      const top = Math.max(0, Math.min(h - 1, Math.round(op.y)));
      const width = Math.max(1, Math.min(w - left, Math.round(op.ancho)));
      const height = Math.max(1, Math.min(h - top, Math.round(op.alto)));
      return salida(img.extract({ left, top, width, height }), destino, calidad);
    }
    case 'girar': {
      let r = img;
      if (op.grados) r = r.rotate(op.grados);
      if (op.volteoV) r = r.flip();
      if (op.volteoH) r = r.flop();
      return salida(r, destino, calidad);
    }
    case 'comprimir': {
      const f: FormatoImagen = op.formato ?? (destino === 'jpeg' || destino === 'png' || destino === 'webp' ? destino : 'jpeg');
      if (f === 'png') {
        return salida(img.png({ palette: true, quality: op.calidad, compressionLevel: 9, effort: 10 }), 'png');
      }
      return salida(img, f, op.calidad);
    }
  }
}
