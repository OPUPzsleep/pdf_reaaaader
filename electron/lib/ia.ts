import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BinarioNoDisponible, conTemporal, ejecutar, localizarModeloFondo, localizarRealEsrgan, type RutasExternas } from './externos';

const aBuffer = (d: Uint8Array) => Buffer.from(d.buffer, d.byteOffset, d.byteLength);

/* ───────────────────────── Quitar fondo (ONNX) ───────────────────────── */

interface ConfigModelo {
  lado: number;
  media: [number, number, number];
  desviacion: [number, number, number];
}

const MODELOS: Record<string, ConfigModelo> = {
  'isnet-general-use.onnx': { lado: 1024, media: [0.485, 0.456, 0.406], desviacion: [1, 1, 1] },
  'u2net.onnx': { lado: 320, media: [0.485, 0.456, 0.406], desviacion: [0.229, 0.224, 0.225] },
  'u2netp.onnx': { lado: 320, media: [0.485, 0.456, 0.406], desviacion: [0.229, 0.224, 0.225] },
};

type Ort = typeof import('onnxruntime-node');
let sesion: { ruta: string; ort: Ort; s: import('onnxruntime-node').InferenceSession } | null = null;

async function obtenerSesion(ruta: string) {
  if (sesion?.ruta === ruta) return sesion;
  const ort = (await import('onnxruntime-node')) as Ort;
  let s;
  try {
    // DirectML (tarjeta gráfica en Windows) si está disponible; si no, CPU
    s = await ort.InferenceSession.create(ruta, { executionProviders: process.platform === 'win32' ? ['dml', 'cpu'] : ['cpu'], graphOptimizationLevel: 'all' });
  } catch {
    s = await ort.InferenceSession.create(ruta, { executionProviders: ['cpu'] });
  }
  sesion = { ruta, ort, s };
  return sesion;
}

export function liberarModelos() {
  sesion = null;
}

/** Quita el fondo con una red de segmentación (ISNet / U²-Net) y devuelve un PNG con transparencia. */
export async function quitarFondo(r: RutasExternas, datos: Uint8Array): Promise<Uint8Array> {
  const modelo = localizarModeloFondo(r);
  if (!modelo) throw new BinarioNoDisponible('El modelo para quitar fondos');
  const cfg = MODELOS[path.basename(modelo).toLowerCase()] ?? MODELOS['isnet-general-use.onnx'];

  let original: Buffer;
  try {
    original = await sharp(aBuffer(datos), { failOn: 'none' }).rotate().ensureAlpha().png().toBuffer();
  } catch {
    throw new Error('Formato de imagen no compatible o archivo dañado.');
  }
  const meta = await sharp(original).metadata();
  const ancho = meta.width ?? 0;
  const alto = meta.height ?? 0;

  const { lado } = cfg;
  const rgb = await sharp(original).removeAlpha().resize(lado, lado, { fit: 'fill' }).raw().toBuffer();
  let maximo = 1e-6;
  for (let i = 0; i < rgb.length; i++) if (rgb[i] > maximo) maximo = rgb[i];
  const plano = lado * lado;
  const entrada = new Float32Array(3 * plano);
  for (let i = 0; i < plano; i++) {
    for (let c = 0; c < 3; c++) entrada[c * plano + i] = (rgb[i * 3 + c] / maximo - cfg.media[c]) / cfg.desviacion[c];
  }

  const { ort, s } = await obtenerSesion(modelo);
  const tensor = new ort.Tensor('float32', entrada, [1, 3, lado, lado]);
  const salida = await s.run({ [s.inputNames[0]]: tensor });
  const bruto = salida[s.outputNames[0]].data as Float32Array;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < plano; i++) {
    if (bruto[i] < mn) mn = bruto[i];
    if (bruto[i] > mx) mx = bruto[i];
  }
  const rango = mx - mn || 1;
  const mascara = Buffer.alloc(plano);
  for (let i = 0; i < plano; i++) mascara[i] = Math.round(((bruto[i] - mn) / rango) * 255);

  const mascaraFinal = await sharp(mascara, { raw: { width: lado, height: lado, channels: 1 } }).resize(ancho, alto, { fit: 'fill', kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer();
  // Si la imagen ya tenía transparencia se respeta multiplicándola por la máscara
  const alfaOriginal = await sharp(original).extractChannel(3).raw().toBuffer();
  for (let i = 0; i < mascaraFinal.length; i++) mascaraFinal[i] = Math.round((mascaraFinal[i] * alfaOriginal[i]) / 255);
  // RGBA a mano: así el canal alfa llega seguro al PNG
  const colores = await sharp(original).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(ancho * alto * 4);
  for (let i = 0, n = ancho * alto; i < n; i++) {
    rgba[i * 4] = colores[i * 3];
    rgba[i * 4 + 1] = colores[i * 3 + 1];
    rgba[i * 4 + 2] = colores[i * 3 + 2];
    rgba[i * 4 + 3] = mascaraFinal[i];
  }
  const png = await sharp(rgba, { raw: { width: ancho, height: alto, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return new Uint8Array(png);
}

/* ───────────────────────── Ampliar (Real-ESRGAN) ───────────────────────── */

export const MAX_PIXELES_AMPLIAR = 8_000_000;

export async function ampliar(
  r: RutasExternas,
  datos: Uint8Array,
  escala: 2 | 3 | 4,
  tipo: 'foto' | 'ilustracion',
  alProgreso?: (fraccion: number) => void,
): Promise<Uint8Array> {
  const exe = localizarRealEsrgan(r);
  if (!exe) throw new BinarioNoDisponible('Real-ESRGAN');

  let entrada: Buffer;
  try {
    entrada = await sharp(aBuffer(datos), { failOn: 'none' }).rotate().png().toBuffer();
  } catch {
    throw new Error('Formato de imagen no compatible o archivo dañado.');
  }
  const meta = await sharp(entrada).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w * h > MAX_PIXELES_AMPLIAR) {
    throw new Error(`La imagen es demasiado grande para ampliarla (${(w * h / 1e6).toFixed(1)} megapíxeles; el máximo es ${MAX_PIXELES_AMPLIAR / 1e6}).`);
  }

  return conTemporal(async (dir) => {
    const archivoEntrada = path.join(dir, 'entrada.png');
    const archivoSalida = path.join(dir, 'salida.png');
    await fsp.writeFile(archivoEntrada, entrada);
    const modelos = path.join(path.dirname(exe), 'models');
    const nombreModelo = tipo === 'foto' ? 'realesrgan-x4plus' : 'realesrgan-x4plus-anime';
    if (!fs.existsSync(path.join(modelos, `${nombreModelo}.param`))) throw new Error(`Falta el modelo «${nombreModelo}» de Real-ESRGAN en ${modelos}.`);
    let ultimo = 0;
    const res = await ejecutar(
      exe,
      ['-i', archivoEntrada, '-o', archivoSalida, '-n', nombreModelo, '-s', '4', '-m', modelos, '-f', 'png'],
      {
        cwd: path.dirname(exe),
        timeoutMs: 1_800_000,
        alErrorEstandar: (t) => {
          const m = [...t.matchAll(/(\d+(?:\.\d+)?)%/g)].pop();
          if (m) {
            ultimo = Math.max(ultimo, Math.min(1, Number(m[1]) / 100));
            alProgreso?.(ultimo);
          }
        },
      },
    );
    if (!fs.existsSync(archivoSalida)) {
      const texto = res.error + res.salida;
      if (/vkEnumeratePhysicalDevices|invalid gpu|no vulkan|vulkan/i.test(texto)) {
        throw new Error('No se encontró una tarjeta gráfica compatible con Vulkan. Esta herramienta la necesita (actualiza los controladores de tu GPU).');
      }
      throw new Error(`Real-ESRGAN no pudo ampliar la imagen. ${texto.trim().split('\n').filter((l) => !/%$/.test(l.trim())).pop() ?? ''}`.trim());
    }
    let salida = sharp(archivoSalida);
    // El modelo siempre amplía x4: para x2 y x3 se reduce el resultado, que da mejor calidad que un modelo propio
    if (escala !== 4) salida = salida.resize(Math.round(w * escala), Math.round(h * escala), { kernel: 'lanczos3' });
    return new Uint8Array(await salida.png({ compressionLevel: 9 }).toBuffer());
  });
}
