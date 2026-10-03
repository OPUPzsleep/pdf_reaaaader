import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { desbloquearPdf, inspeccionarProteccion } from '../src/lib/pdf/desbloquear';
import { ejecutarQpdf, SALIDA, ENTRADA } from '../src/lib/pdf/qpdf';
import { abrirConPdfjs, crearPdf, textosPorPagina } from './util/pdfs';

const wasm = path.resolve('node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
const op = { wasm };

/** Cifra un PDF con qpdf (para fabricar los casos de prueba) */
async function cifrar(datos: Uint8Array, ...args: string[]): Promise<Uint8Array> {
  const r = await ejecutarQpdf(datos, [ENTRADA, '--allow-weak-crypto', ...args, SALIDA], wasm, true);
  if (!r.salida) throw new Error(`qpdf no pudo cifrar (estado ${r.estado})`);
  return r.salida;
}

const original = () => crearPdf(3, { texto: (i) => `Contenido ${i}` });
const TEXTOS = ['Contenido 1', 'Contenido 2', 'Contenido 3'];

describe('Desbloquear PDF', () => {
  it('un PDF sin protección se detecta y se copia intacto', async () => {
    const datos = await original();
    expect(await inspeccionarProteccion(datos, op)).toBe('sin-proteccion');
    const salida = await desbloquearPdf(datos, '', op);
    expect(await textosPorPagina(salida)).toEqual(TEXTOS);
  });

  // Cada método de cifrado: RC4 de 40 y 128 bits, AES de 128 y AES de 256 (revisión 6)
  const METODOS: [string, string[]][] = [
    ['RC4 40 bits', ['40']],
    ['RC4 128 bits', ['128', '--use-aes=n']],
    ['AES 128 bits', ['128', '--use-aes=y']],
    ['AES 256 bits', ['256']],
  ];
  for (const [nombre, extra] of METODOS) {
    it(`con contraseña de apertura (${nombre}): pide la clave, rechaza la mala y desbloquea con la buena`, async () => {
      const cifrado = await cifrar(await original(), '--encrypt', 'secreto', 'propietario', ...extra, '--');
      expect(await inspeccionarProteccion(cifrado, op)).toBe('clave');

      await expect(desbloquearPdf(cifrado, '', op)).rejects.toThrow(/necesita una contraseña/);
      await expect(desbloquearPdf(cifrado, 'equivocada', op)).rejects.toThrow(/no es correcta/);

      const salida = await desbloquearPdf(cifrado, 'secreto', op);
      expect(await inspeccionarProteccion(salida, op)).toBe('sin-proteccion');
      expect(await textosPorPagina(salida)).toEqual(TEXTOS);
      // Ya no hace falta nada para abrirlo con otras herramientas
      expect((await PDFDocument.load(salida)).getPageCount()).toBe(3);
    });
  }

  it('también vale la contraseña de propietario', async () => {
    const cifrado = await cifrar(await original(), '--encrypt', 'secreto', 'propietario', '256', '--');
    const salida = await desbloquearPdf(cifrado, 'propietario', op);
    expect(await textosPorPagina(salida)).toEqual(TEXTOS);
  });

  it('un PDF con restricciones (sin contraseña de apertura) se desbloquea sin pedir nada', async () => {
    const cifrado = await cifrar(await original(), '--encrypt', '', 'propietario', '256', '--print=none', '--extract=n', '--modify=none', '--');
    expect(await inspeccionarProteccion(cifrado, op)).toBe('restricciones');
    // pdf.js lo abre, pero marca que no se puede imprimir ni copiar
    const doc = await abrirConPdfjs(cifrado);
    expect(await doc.getPermissions()).not.toBeNull();

    const salida = await desbloquearPdf(cifrado, '', op);
    expect(await inspeccionarProteccion(salida, op)).toBe('sin-proteccion');
    const limpio = await abrirConPdfjs(salida);
    expect(await limpio.getPermissions()).toBeNull();
    expect(await textosPorPagina(salida)).toEqual(TEXTOS);
  });

  it('contraseñas con acentos, eñes, espacios y símbolos', async () => {
    const clave = 'contraseña ñ ü = "1"';
    const cifrado = await cifrar(await original(), '--encrypt', clave, clave + '!', '256', '--');
    expect(await inspeccionarProteccion(cifrado, op)).toBe('clave');
    expect(await textosPorPagina(await desbloquearPdf(cifrado, clave, op))).toEqual(TEXTOS);
  });

  it('conserva los PDF con flujos de objetos comprimidos', async () => {
    const comprimido = await cifrar(await original(), '--object-streams=generate', '--encrypt', 'abc', 'def', '256', '--');
    const salida = await desbloquearPdf(comprimido, 'abc', op);
    expect(await textosPorPagina(salida)).toEqual(TEXTOS);
  });

  it('lo que no es un PDF se rechaza con un mensaje claro', async () => {
    const basura = new TextEncoder().encode('esto no es un pdf, ni de lejos');
    expect(await inspeccionarProteccion(basura, op)).toBe('invalido');
    await expect(desbloquearPdf(basura, '', op)).rejects.toThrow(/no parece válido/);
    await expect(desbloquearPdf(basura, 'abc', op)).rejects.toThrow(/no parece válido/);
  });
});
