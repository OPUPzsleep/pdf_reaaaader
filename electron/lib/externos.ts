import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DestinoOffice, EstadoBinario, PerfilCompresion } from '../../src/types/api';

const esWindows = process.platform === 'win32';

/* ───────────────────────── Búsqueda de binarios ───────────────────────── */

function buscarArchivo(dir: string, nombres: string[], profundidad = 4): string | null {
  const minus = nombres.map((n) => n.toLowerCase());
  const recorrer = (d: string, nivel: number): string | null => {
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entradas) if (e.isFile() && minus.includes(e.name.toLowerCase())) return path.join(d, e.name);
    if (nivel >= profundidad) return null;
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      const r = recorrer(path.join(d, e.name), nivel + 1);
      if (r) return r;
    }
    return null;
  };
  return recorrer(dir, 0);
}

function enPath(nombres: string[]): string | null {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) for (const n of nombres) {
    const ruta = path.join(d, n);
    try {
      if (fs.statSync(ruta).isFile()) return ruta;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

export interface RutasExternas {
  /** Carpeta «resources» con los binarios descargados (o process.resourcesPath empaquetado) */
  recursos: string;
}

export function localizarGhostscript({ recursos }: RutasExternas): string | null {
  const env = process.env.PDFREAAAADER_GS;
  if (env && fs.existsSync(env)) return env;
  const propio = buscarArchivo(path.join(recursos, 'ghostscript'), esWindows ? ['gswin64c.exe', 'gswin32c.exe'] : ['gs']);
  if (propio) return propio;
  return enPath(esWindows ? ['gswin64c.exe', 'gswin32c.exe'] : ['gs']);
}

export function localizarLibreOffice({ recursos }: RutasExternas): string | null {
  const env = process.env.PDFREAAAADER_SOFFICE;
  if (env && fs.existsSync(env)) return env;
  const nombres = esWindows ? ['soffice.exe'] : ['soffice'];
  const propio = buscarArchivo(path.join(recursos, 'libreoffice'), nombres, 5);
  if (propio) return propio;
  if (esWindows) {
    for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']]) {
      if (!base) continue;
      const r = path.join(base, 'LibreOffice', 'program', 'soffice.exe');
      if (fs.existsSync(r)) return r;
    }
  }
  return enPath(nombres);
}

export function localizarRealEsrgan({ recursos }: RutasExternas): string | null {
  return buscarArchivo(path.join(recursos, 'realesrgan'), esWindows ? ['realesrgan-ncnn-vulkan.exe'] : ['realesrgan-ncnn-vulkan'], 3) ?? enPath(esWindows ? ['realesrgan-ncnn-vulkan.exe'] : ['realesrgan-ncnn-vulkan']);
}

export const NOMBRE_MODELO_FONDO = 'isnet-general-use.onnx';

export function localizarModeloFondo({ recursos }: RutasExternas): string | null {
  const env = process.env.PDFREAAAADER_MODELO_FONDO;
  if (env && fs.existsSync(env)) return env;
  return buscarArchivo(path.join(recursos, 'models'), [NOMBRE_MODELO_FONDO, 'u2net.onnx', 'u2netp.onnx'], 2);
}

export function estadoBinarios(r: RutasExternas): EstadoBinario[] {
  const f = (id: EstadoBinario['id'], nombre: string, ruta: string | null, detalle: string): EstadoBinario => ({
    id, nombre, disponible: !!ruta, ruta: ruta ?? undefined, detalle: ruta ? undefined : detalle,
  });
  return [
    f('libreoffice', 'LibreOffice', localizarLibreOffice(r), 'Instálalo o ejecuta «npm run fetch-binaries» para incluirlo en la app.'),
    f('ghostscript', 'Ghostscript', localizarGhostscript(r), 'Instálalo o ejecuta «npm run fetch-binaries» para incluirlo en la app.'),
    f('realesrgan', 'Real-ESRGAN', localizarRealEsrgan(r), 'Ejecuta «npm run fetch-binaries» para descargarlo.'),
    f('modelo-fondo', 'Modelo para quitar fondos', localizarModeloFondo(r), 'Ejecuta «npm run fetch-binaries» para descargarlo.'),
  ];
}

export class BinarioNoDisponible extends Error {
  constructor(nombre: string) {
    super(`${nombre} no está disponible. Instálalo o ejecuta «npm run fetch-binaries» para incluirlo en la aplicación.`);
  }
}

/* ───────────────────────── Ejecución de procesos ───────────────────────── */

export interface ResultadoProceso {
  codigo: number | null;
  salida: string;
  error: string;
}

function matarArbol(p: ChildProcess) {
  if (!p.pid) return;
  if (esWindows) {
    spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-p.pid, 'SIGKILL');
    } catch {
      p.kill('SIGKILL');
    }
  }
}

export function ejecutar(
  bin: string,
  args: string[],
  opciones: { timeoutMs?: number; cwd?: string; env?: NodeJS.ProcessEnv; alErrorEstandar?: (texto: string) => void } = {},
): Promise<ResultadoProceso> {
  return new Promise((resolver, rechazar) => {
    const p = spawn(bin, args, {
      cwd: opciones.cwd,
      env: { ...process.env, ...opciones.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: !esWindows, // grupo propio para poder matar a los hijos (soffice.bin)
    });
    let salida = '';
    let error = '';
    p.stdout.on('data', (d) => (salida += d));
    p.stderr.on('data', (d) => {
      error += d;
      opciones.alErrorEstandar?.(String(d));
    });
    const limite = opciones.timeoutMs ?? 300_000;
    const t = setTimeout(() => {
      matarArbol(p);
      rechazar(new Error(`El proceso tardó más de ${Math.round(limite / 1000)} s y se canceló.`));
    }, limite);
    p.on('error', (e) => {
      clearTimeout(t);
      rechazar(e);
    });
    p.on('close', (codigo) => {
      clearTimeout(t);
      resolver({ codigo, salida, error });
    });
  });
}

/** Carpeta temporal propia que se borra siempre al terminar. */
export async function conTemporal<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdfreaaaader-'));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const aBuffer = (d: Uint8Array) => Buffer.from(d.buffer, d.byteOffset, d.byteLength);

/** Comprueba por los primeros bytes que el archivo es lo que dice ser. */
export function esPdf(d: Uint8Array): boolean {
  return Buffer.from(d.subarray(0, 1024)).includes('%PDF-');
}

export function pareceOffice(d: Uint8Array, extension: string): boolean {
  const ext = extension.replace(/^\./, '').toLowerCase();
  const cab = Buffer.from(d.subarray(0, 8));
  const zip = cab[0] === 0x50 && cab[1] === 0x4b;
  const ole = cab[0] === 0xd0 && cab[1] === 0xcf && cab[2] === 0x11 && cab[3] === 0xe0;
  if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) return zip;
  if (['doc', 'xls', 'ppt'].includes(ext)) return ole || zip;
  if (ext === 'rtf') return cab.toString('latin1').startsWith('{\\rtf');
  return true;
}

/* ───────────────────────── Ghostscript ───────────────────────── */

const PERFIL_GS: Record<PerfilCompresion, string> = { bajo: '/screen', medio: '/ebook', alto: '/printer' };

/** Comprime un PDF. Devuelve el más pequeño entre el resultado y el original. */
export async function comprimirPdf(r: RutasExternas, datos: Uint8Array, perfil: PerfilCompresion): Promise<{ datos: Uint8Array; reducido: boolean }> {
  const gs = localizarGhostscript(r);
  if (!gs) throw new BinarioNoDisponible('Ghostscript');
  if (!esPdf(datos)) throw new Error('El archivo no es un PDF válido.');
  return conTemporal(async (dir) => {
    const entrada = path.join(dir, 'entrada.pdf');
    const salida = path.join(dir, 'salida.pdf');
    await fsp.writeFile(entrada, aBuffer(datos));
    const args = [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.5', '-dNOPAUSE', '-dQUIET', '-dBATCH', '-dSAFER',
      `-dPDFSETTINGS=${PERFIL_GS[perfil]}`,
      '-dDetectDuplicateImages=true', '-dCompressFonts=true', '-dSubsetFonts=true', '-dAutoRotatePages=/None',
      `-sOutputFile=${salida}`, entrada,
    ];
    const res = await ejecutar(gs, args, { timeoutMs: 600_000 });
    if (res.codigo !== 0 || !fs.existsSync(salida)) throw new Error(`Ghostscript no pudo procesar el PDF. ${res.error.trim().split('\n').pop() ?? ''}`.trim());
    const nuevo = new Uint8Array(await fsp.readFile(salida));
    return nuevo.byteLength < datos.byteLength ? { datos: nuevo, reducido: true } : { datos, reducido: false };
  });
}

function buscarPerfilIcc(gs: string): string | null {
  const cercanos = [path.resolve(path.dirname(gs), '..'), path.resolve(path.dirname(gs), '..', '..'), '/usr/share/ghostscript', '/usr/local/share/ghostscript'];
  for (const c of cercanos) {
    const r = buscarArchivo(c, ['default_rgb.icc'], 4);
    if (r) return r;
  }
  return null;
}

const psEscapar = (s: string) => s.replace(/\\/g, '/').replace(/([()])/g, '\\$1');

/** Convierte a PDF/A-2b con Ghostscript. */
export async function pdfAPdfA(r: RutasExternas, datos: Uint8Array, titulo = 'Documento'): Promise<Uint8Array> {
  const gs = localizarGhostscript(r);
  if (!gs) throw new BinarioNoDisponible('Ghostscript');
  if (!esPdf(datos)) throw new Error('El archivo no es un PDF válido.');
  const icc = buscarPerfilIcc(gs);
  if (!icc) throw new Error('No se encontró el perfil de color sRGB de Ghostscript (default_rgb.icc).');
  return conTemporal(async (dir) => {
    const entrada = path.join(dir, 'entrada.pdf');
    const salida = path.join(dir, 'salida.pdf');
    const def = path.join(dir, 'PDFA_def.ps');
    await fsp.writeFile(entrada, aBuffer(datos));
    await fsp.writeFile(
      def,
      `%!PS
% Definición mínima de PDF/A: perfil de salida sRGB
[ /Title (${psEscapar(titulo)}) /DOCINFO pdfmark
[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark
[{icc_PDFA} <</N 3>> /PUT pdfmark
[{icc_PDFA} (${psEscapar(icc)}) (r) file /PUT pdfmark
[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark
[{OutputIntent_PDFA} <<
  /Type /OutputIntent
  /S /GTS_PDFA1
  /DestOutputProfile {icc_PDFA}
  /OutputConditionIdentifier (sRGB)
  /Info (sRGB IEC61966-2.1)
>> /PUT pdfmark
[{Catalog} <</OutputIntents [ {OutputIntent_PDFA} ]>> /PUT pdfmark
`,
    );
    const args = [
      '-dPDFA=2', '-dPDFACompatibilityPolicy=1', '-dBATCH', '-dNOPAUSE', '-dQUIET', '-dNOOUTERSAVE',
      '-dSAFER', `--permit-file-read=${icc}`,
      '-sColorConversionStrategy=RGB', '-sProcessColorModel=DeviceRGB', '-sDEVICE=pdfwrite',
      `-sOutputFile=${salida}`, def, entrada,
    ];
    const res = await ejecutar(gs, args, { timeoutMs: 600_000 });
    if (res.codigo !== 0 || !fs.existsSync(salida)) throw new Error(`Ghostscript no pudo convertir a PDF/A. ${res.error.trim().split('\n').pop() ?? ''}`.trim());
    return new Uint8Array(await fsp.readFile(salida));
  });
}

/* ───────────────────────── LibreOffice ───────────────────────── */

// LibreOffice no admite dos conversiones a la vez con el mismo perfil: se encolan.
let colaOffice: Promise<unknown> = Promise.resolve();

function enCola<T>(fn: () => Promise<T>): Promise<T> {
  const r = colaOffice.then(fn, fn);
  colaOffice = r.catch(() => undefined);
  return r;
}

const urlDePerfil = (dir: string) => 'file://' + (esWindows ? '/' : '') + dir.replace(/\\/g, '/');

const FILTROS_SALIDA: Record<'docx' | 'pptx', { ext: string; filtro: string; entrada: string }> = {
  docx: { ext: 'docx', filtro: 'docx:MS Word 2007 XML', entrada: 'writer_pdf_import' },
  pptx: { ext: 'pptx', filtro: 'pptx:Impress MS PowerPoint 2007 XML', entrada: 'impress_pdf_import' },
};

async function convertirConLibreOffice(
  r: RutasExternas,
  perfilDir: string,
  datos: Uint8Array,
  extensionEntrada: string,
  filtroSalida: string,
  extensionSalida: string,
  filtroEntrada?: string,
): Promise<Uint8Array> {
  const soffice = localizarLibreOffice(r);
  if (!soffice) throw new BinarioNoDisponible('LibreOffice');
  if (extensionEntrada === 'pdf' ? !esPdf(datos) : !pareceOffice(datos, extensionEntrada)) {
    throw new Error(extensionEntrada === 'pdf' ? 'El archivo no es un PDF válido.' : 'El archivo no parece un documento de Office válido (está dañado o su extensión no coincide).');
  }
  return enCola(() =>
    conTemporal(async (dir) => {
      const entrada = path.join(dir, `documento.${extensionEntrada}`);
      await fsp.writeFile(entrada, aBuffer(datos));
      const salidaDir = path.join(dir, 'salida');
      await fsp.mkdir(salidaDir);
      await fsp.mkdir(perfilDir, { recursive: true });
      const args = [
        '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo', '--nofirststartwizard',
        `-env:UserInstallation=${urlDePerfil(perfilDir)}`,
        ...(filtroEntrada ? [`--infilter=${filtroEntrada}`] : []),
        '--convert-to', filtroSalida,
        '--outdir', salidaDir,
        entrada,
      ];
      const res = await ejecutar(soffice, args, { timeoutMs: 600_000 });
      const salida = path.join(salidaDir, `documento.${extensionSalida}`);
      if (!fs.existsSync(salida)) {
        const detalle = (res.error + res.salida).trim().split('\n').filter(Boolean).pop() ?? '';
        throw new Error(`LibreOffice no pudo convertir el archivo (¿está dañado o protegido con contraseña?). ${detalle}`.trim());
      }
      return new Uint8Array(await fsp.readFile(salida));
    }),
  );
}

export function officeAPdf(r: RutasExternas, perfilDir: string, datos: Uint8Array, extension: string): Promise<Uint8Array> {
  return convertirConLibreOffice(r, perfilDir, datos, extension.replace(/^\./, '').toLowerCase(), 'pdf:writer_pdf_Export', 'pdf');
}

export function pdfAOffice(r: RutasExternas, perfilDir: string, datos: Uint8Array, destino: DestinoOffice): Promise<Uint8Array> {
  if (destino === 'xlsx') return Promise.reject(new Error('PDF a Excel se hace con la extracción de tablas propia, no con LibreOffice.'));
  const f = FILTROS_SALIDA[destino];
  return convertirConLibreOffice(r, perfilDir, datos, 'pdf', f.filtro, f.ext, f.entrada);
}
