// qpdf compilado a WebAssembly (@neslinesli93/qpdf-wasm). Se carga una instancia nueva por operación: tras terminar
// `callMain` el programa de Emscripten ya ha «salido» y no admite una segunda llamada.
import crearModulo from '@neslinesli93/qpdf-wasm';

interface Sistema {
  writeFile(ruta: string, datos: Uint8Array): void;
  readFile(ruta: string): Uint8Array;
}

interface Instancia {
  callMain(args: string[]): number | undefined;
  FS: Sistema;
}

export interface ResultadoQpdf {
  /** Código de salida de qpdf: 0 = bien, 3 = bien con avisos, 2 = error */
  estado: number;
  /** Contenido del archivo de salida, si qpdf lo generó */
  salida: Uint8Array | null;
  /** Lo que qpdf escribió en la consola (solo se captura en el navegador) */
  texto: string;
}

export const ENTRADA = '/entrada.pdf';
export const SALIDA = '/salida.pdf';

/**
 * Ejecuta qpdf con los argumentos dados sobre `entrada` (disponible en `/entrada.pdf`).
 * `wasm` es la ruta o la dirección del módulo `qpdf.wasm`. Si se pasa `leerSalida`, se devuelve ese archivo.
 */
export async function ejecutarQpdf(entrada: Uint8Array, args: string[], wasm: string, leerSalida = false): Promise<ResultadoQpdf> {
  const consola: number[] = [];
  const guardar = (c: number | null) => {
    if (c !== null) consola.push(c & 255);
  };
  const crear = crearModulo as unknown as (opciones: Record<string, unknown>) => Promise<Instancia>;
  const qpdf = await crear({ locateFile: () => wasm, noInitialRun: true, stdout: guardar, stderr: guardar });
  qpdf.FS.writeFile(ENTRADA, entrada);

  let estado = 0;
  try {
    estado = qpdf.callMain(args) ?? 0;
  } catch (e) {
    // Emscripten lanza ExitStatus cuando el programa llama a exit(): el código va en `status`
    const codigo = (e as { status?: unknown } | null)?.status;
    if (typeof codigo !== 'number') throw e;
    estado = codigo;
  }

  let salida: Uint8Array | null = null;
  if (leerSalida) {
    try {
      salida = qpdf.FS.readFile(SALIDA);
    } catch {
      salida = null;
    }
  }
  return { estado, salida, texto: new TextDecoder().decode(new Uint8Array(consola)) };
}
