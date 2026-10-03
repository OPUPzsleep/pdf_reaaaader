import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { unirPdfs } from '../src/lib/pdf/unir';
import { dividirPdf } from '../src/lib/pdf/dividir';
import { eliminarPaginas, extraerPaginas, reordenarPaginas } from '../src/lib/pdf/paginas';
import { rotarPdf } from '../src/lib/pdf/rotar';
import { crearZip } from '../src/lib/pdf/zip';
import { crearPdf, textosPorPagina } from './util/pdfs';
import JSZip from 'jszip';

const paginas = async (d: Uint8Array) => (await PDFDocument.load(d)).getPageCount();

describe('unir', () => {
  it('une en el orden dado', async () => {
    const a = await crearPdf(2, { texto: (i) => `A${i}` });
    const b = await crearPdf(3, { texto: (i) => `B${i}` });
    const r = await unirPdfs([{ nombre: 'b', datos: b }, { nombre: 'a', datos: a }]);
    expect(await textosPorPagina(r)).toEqual(['B1', 'B2', 'B3', 'A1', 'A2']);
  });
  it('exige al menos dos PDF', async () => {
    await expect(unirPdfs([{ nombre: 'a', datos: await crearPdf(1) }])).rejects.toThrow(/al menos dos/);
  });
  it('explica el error si el archivo no es un PDF', async () => {
    await expect(
      unirPdfs([{ nombre: 'x.pdf', datos: new Uint8Array([1, 2, 3]) }, { nombre: 'y', datos: await crearPdf(1) }]),
    ).rejects.toThrow(/No se pudo leer x\.pdf/);
  });
});

describe('dividir', () => {
  it('por rangos', async () => {
    const pdf = await crearPdf(6);
    const partes = await dividirPdf(pdf, { tipo: 'rangos', texto: '1-2, 4, 5-6' });
    expect(partes.map((p) => p.etiqueta)).toEqual(['p1-2', 'p4', 'p5-6']);
    expect(await Promise.all(partes.map((p) => paginas(p.datos)))).toEqual([2, 1, 2]);
    expect(await textosPorPagina(partes[1].datos)).toEqual(['Página 4']);
  });
  it('cada N páginas (la última parte puede ser menor)', async () => {
    const partes = await dividirPdf(await crearPdf(7), { tipo: 'cada', n: 3 });
    expect(await Promise.all(partes.map((p) => paginas(p.datos)))).toEqual([3, 3, 1]);
  });
  it('una página por archivo', async () => {
    const partes = await dividirPdf(await crearPdf(4), { tipo: 'una' });
    expect(partes).toHaveLength(4);
  });
});

describe('eliminar / extraer / reordenar', () => {
  it('elimina páginas', async () => {
    const r = await eliminarPaginas(await crearPdf(5), [1, 3]);
    expect(await textosPorPagina(r)).toEqual(['Página 1', 'Página 3', 'Página 5']);
  });
  it('no deja eliminar todo', async () => {
    await expect(eliminarPaginas(await crearPdf(2), [0, 1])).rejects.toThrow(/todas las páginas/);
  });
  it('extrae páginas', async () => {
    const r = await extraerPaginas(await crearPdf(5), [4, 0]);
    expect(await textosPorPagina(r)).toEqual(['Página 5', 'Página 1']);
  });
  it('reordena, gira y mezcla fuentes', async () => {
    const a = await crearPdf(3, { texto: (i) => `A${i}` });
    const b = await crearPdf(1, { texto: () => 'B1' });
    const r = await reordenarPaginas(
      [a, b],
      [
        { fuente: 0, pagina: 2, rotacion: 0 },
        { fuente: 1, pagina: 0, rotacion: 90 },
        { fuente: 0, pagina: 0, rotacion: 0 },
      ],
    );
    expect(await textosPorPagina(r)).toEqual(['A3', 'B1', 'A1']);
    const doc = await PDFDocument.load(r);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90, 0]);
  });
});

describe('rotar', () => {
  it('suma el giro al existente', async () => {
    const pdf = await crearPdf(3, { rotaciones: { 1: 90 } });
    const r = await rotarPdf(pdf, 270);
    const doc = await PDFDocument.load(r);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([270, 0, 270]);
  });
  it('puede limitarse a páginas concretas', async () => {
    const r = await rotarPdf(await crearPdf(3), 180, [2]);
    const doc = await PDFDocument.load(r);
    expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 180]);
  });
});

describe('zip', () => {
  it('evita nombres repetidos', async () => {
    const z = await crearZip([
      { nombre: 'a.pdf', datos: new Uint8Array([1]) },
      { nombre: 'a.pdf', datos: new Uint8Array([2]) },
    ]);
    const abierto = await JSZip.loadAsync(z);
    expect(Object.keys(abierto.files).sort()).toEqual(['a (2).pdf', 'a.pdf']);
  });
});
