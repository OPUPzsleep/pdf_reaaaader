import { ENTRADA, SALIDA, ejecutarQpdf } from './qpdf';

/**
 * - `sin-proteccion`: el PDF no está cifrado.
 * - `restricciones`: se abre sin contraseña, pero tiene permisos limitados (imprimir, copiar, editar…).
 * - `clave`: pide una contraseña para abrirse.
 * - `invalido`: no parece un PDF, o está dañado.
 */
export type EstadoProteccion = 'sin-proteccion' | 'restricciones' | 'clave' | 'invalido';

export interface OpcionesDesbloqueo {
  /** Ruta o dirección de qpdf.wasm; por defecto, la de la aplicación */
  wasm?: string;
}

const MENSAJES = {
  invalido: 'No se pudo abrir el PDF: no parece válido o está dañado.',
  claveIncorrecta: 'La contraseña no es correcta.',
  claveNecesaria: 'Este PDF necesita una contraseña para abrirse.',
  sinSalida: 'No se pudo quitar la protección de este PDF.',
};

async function ubicarWasm(o?: OpcionesDesbloqueo): Promise<string> {
  return o?.wasm ?? (await import('./qpdfWasm')).default;
}

const bytes = (texto: string) => Uint8Array.from(texto, (c) => c.charCodeAt(0));

/** ¿Aparece esta secuencia de bytes? (búsqueda directa: los PDF pueden pesar cientos de MB) */
function contiene(datos: Uint8Array, patron: string, hasta = datos.length): boolean {
  const p = bytes(patron);
  const limite = Math.min(hasta, datos.length) - p.length;
  for (let i = 0; i <= limite; i++) {
    if (datos[i] !== p[0]) continue;
    let k = 1;
    while (k < p.length && datos[i + k] === p[k]) k++;
    if (k === p.length) return true;
  }
  return false;
}

/** Averigua si el PDF está protegido y de qué manera, sin necesitar la contraseña. */
export async function inspeccionarProteccion(datos: Uint8Array, opciones?: OpcionesDesbloqueo): Promise<EstadoProteccion> {
  const wasm = await ubicarWasm(opciones);
  // qpdf --is-encrypted: 0 = cifrado (y se abre sin contraseña), 2 = no cifrado o no se puede abrir
  const cifrado = await ejecutarQpdf(datos, ['--is-encrypted', ENTRADA], wasm);
  if (cifrado.estado === 0) return 'restricciones';
  // Si se abre y no está cifrado, `--show-encryption` termina bien; si no se abre, termina con error
  const abre = await ejecutarQpdf(datos, ['--show-encryption', ENTRADA], wasm);
  if (abre.estado === 0 || abre.estado === 3) return 'sin-proteccion';
  // No se abre: pide contraseña si es un PDF cifrado; si no, es que no es un PDF válido
  return contiene(datos, '%PDF-', 1024) && contiene(datos, '/Encrypt') ? 'clave' : 'invalido';
}

/** Devuelve una copia del PDF sin contraseña ni restricciones. Si pide contraseña, hay que darla (la de apertura o la de propietario). */
export async function desbloquearPdf(datos: Uint8Array, clave = '', opciones?: OpcionesDesbloqueo): Promise<Uint8Array> {
  const wasm = await ubicarWasm(opciones);
  const args = [...(clave ? [`--password=${clave}`] : []), '--decrypt', ENTRADA, SALIDA];
  const r = await ejecutarQpdf(datos, args, wasm, true);
  // 0 = bien; 3 = bien, con avisos (qpdf reparó algo menor)
  if (r.salida && (r.estado === 0 || r.estado === 3)) return r.salida;

  const estado = await inspeccionarProteccion(datos, opciones);
  if (estado === 'invalido') throw new Error(MENSAJES.invalido);
  if (estado === 'clave') throw new Error(clave ? MENSAJES.claveIncorrecta : MENSAJES.claveNecesaria);
  throw new Error(MENSAJES.sinSalida);
}
