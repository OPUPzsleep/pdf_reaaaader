import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { comprimirPdf, estadoBinarios, localizarGhostscript, localizarLibreOffice, officeAPdf, pdfAOffice, pdfAPdfA, type RutasExternas } from '../electron/lib/externos';
import { crearOffice, hayGhostscript } from './util/office';
import { hayLibreOffice } from './util/libro';
import { crearPdf, textosPorPagina } from './util/pdfs';

const rutas: RutasExternas = { recursos: path.join(os.tmpdir(), 'no-existe-recursos') };
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'perfil-lo-'));

describe('localización de binarios', () => {
  it('informa de lo que hay en el sistema', () => {
    const estado = estadoBinarios(rutas);
    expect(estado.map((e) => e.id)).toEqual(['libreoffice', 'ghostscript', 'realesrgan', 'modelo-fondo']);
    expect(estado.find((e) => e.id === 'ghostscript')?.disponible).toBe(hayGhostscript);
    expect(estado.find((e) => e.id === 'libreoffice')?.disponible).toBe(hayLibreOffice);
    expect(estado.find((e) => e.id === 'modelo-fondo')?.detalle).toMatch(/fetch-binaries/);
  });
  it('prefiere los binarios incluidos en la carpeta de recursos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recursos-'));
    fs.mkdirSync(path.join(dir, 'ghostscript', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'libreoffice', 'LibreOffice', 'program'), { recursive: true });
    const gs = path.join(dir, 'ghostscript', 'bin', process.platform === 'win32' ? 'gswin64c.exe' : 'gs');
    const so = path.join(dir, 'libreoffice', 'LibreOffice', 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice');
    fs.writeFileSync(gs, '');
    fs.writeFileSync(so, '');
    expect(localizarGhostscript({ recursos: dir })).toBe(gs);
    expect(localizarLibreOffice({ recursos: dir })).toBe(so);
  });
});

describe.skipIf(!hayGhostscript)('Ghostscript', () => {
  async function pdfPesado() {
    // Imagen ruidosa grande: comprime mucho al bajar la resolución
    const ruido = Buffer.alloc(1600 * 1200 * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 2654435761) >>> 24;
    const jpg = await sharp(ruido, { raw: { width: 1600, height: 1200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const doc = await PDFDocument.create();
    const img = await doc.embedJpg(jpg);
    const p = doc.addPage([595, 842]);
    p.drawImage(img, { x: 20, y: 300, width: 555, height: 416 });
    p.drawText('Texto seleccionable de la página', { x: 40, y: 200, size: 20 });
    return doc.save();
  }

  it('comprime y mantiene el texto seleccionable', async () => {
    const original = await pdfPesado();
    const bajo = await comprimirPdf(rutas, original, 'bajo');
    const medio = await comprimirPdf(rutas, original, 'medio');
    expect(bajo.reducido).toBe(true);
    expect(bajo.datos.byteLength).toBeLessThan(original.byteLength * 0.6);
    expect(bajo.datos.byteLength).toBeLessThanOrEqual(medio.datos.byteLength);
    expect((await textosPorPagina(bajo.datos))[0]).toContain('Texto seleccionable');
    expect((await PDFDocument.load(bajo.datos)).getPageCount()).toBe(1);
  }, 120_000);

  it('si no hay mejora devuelve el original', async () => {
    const pequeno = await crearPdf(1);
    const r = await comprimirPdf(rutas, pequeno, 'alto');
    expect(r.reducido ? r.datos.byteLength < pequeno.byteLength : r.datos === pequeno).toBe(true);
  }, 60_000);

  it('rechaza archivos que no son PDF con un mensaje claro', async () => {
    await expect(comprimirPdf(rutas, new Uint8Array([1, 2, 3, 4]), 'medio')).rejects.toThrow(/no es un PDF válido/);
  }, 60_000);

  it('convierte a PDF/A-2 con perfil de salida y metadatos XMP', async () => {
    const r = await pdfAPdfA(rutas, await crearPdf(2, { texto: (i) => `Contenido ${i}` }), 'Prueba');
    expect((await textosPorPagina(r))[1]).toContain('Contenido 2');
    const doc = await PDFDocument.load(r);
    const catalogo = doc.catalog;
    const intents = catalogo.lookup(PDFName.of('OutputIntents'), PDFArray);
    expect(intents.size()).toBeGreaterThan(0);
    const meta = catalogo.lookup(PDFName.of('Metadata'), PDFStream);
    const xmp = Buffer.from(decodePDFRawStream(meta as PDFRawStream).decode()).toString('utf8');
    expect(xmp).toMatch(/pdfaid:part=.2./);
    expect(xmp).toMatch(/pdfaid:conformance=.B./);
    expect(catalogo.lookup(PDFName.of('OutputIntents'), PDFArray).lookup(0, PDFDict).get(PDFName.of('S'))?.toString()).toBe('/GTS_PDFA1');
  }, 120_000);
});

describe.skipIf(!hayLibreOffice)('LibreOffice', () => {
  it('Word a PDF', async () => {
    const pdf = await officeAPdf(rutas, perfil, crearOffice('docx'), 'docx');
    expect((await textosPorPagina(pdf))[0]).toContain('Informe trimestral de ventas');
  }, 240_000);

  it('Excel a PDF', async () => {
    const pdf = await officeAPdf(rutas, perfil, crearOffice('xlsx'), '.xlsx');
    const t = (await textosPorPagina(pdf))[0];
    expect(t).toContain('Producto');
    expect(t).toContain('Manzanas');
  }, 240_000);

  it('PowerPoint a PDF: una página por diapositiva', async () => {
    const pdf = await officeAPdf(rutas, perfil, crearOffice('pptx'), 'pptx');
    const t = await textosPorPagina(pdf);
    expect(t).toHaveLength(2);
    expect(t[0]).toContain('Plan de lanzamiento');
    expect(t[1]).toContain('Resultados esperados');
  }, 240_000);

  it('dos conversiones simultáneas no se pisan (cola)', async () => {
    const [a, b] = await Promise.all([officeAPdf(rutas, perfil, crearOffice('docx'), 'docx'), officeAPdf(rutas, perfil, crearOffice('xlsx'), 'xlsx')]);
    expect((await textosPorPagina(a))[0]).toContain('Informe');
    expect((await textosPorPagina(b))[0]).toContain('Producto');
  }, 300_000);

  it('un archivo dañado da un error en español', async () => {
    await expect(officeAPdf(rutas, perfil, new Uint8Array([1, 2, 3, 4, 5]), 'docx')).rejects.toThrow(/no parece un documento de Office válido/);
    await expect(pdfAOffice(rutas, perfil, new Uint8Array([1, 2, 3, 4, 5]), 'docx')).rejects.toThrow(/no es un PDF válido/);
  }, 240_000);

  it('PDF a Excel no pasa por LibreOffice', async () => {
    await expect(pdfAOffice(rutas, perfil, await crearPdf(1), 'xlsx')).rejects.toThrow(/extracción de tablas/);
  });

  it('PDF a Word conserva el texto', async () => {
    const pdf = await officeAPdf(rutas, perfil, crearOffice('docx'), 'docx');
    const docx = await pdfAOffice(rutas, perfil, pdf, 'docx');
    const zip = await JSZip.loadAsync(docx);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.replace(/<[^>]+>/g, '')).toContain('Informe trimestral');
  }, 300_000);

  it('PDF a PowerPoint genera diapositivas', async () => {
    const pdf = await officeAPdf(rutas, perfil, crearOffice('pptx'), 'pptx');
    const pptx = await pdfAOffice(rutas, perfil, pdf, 'pptx');
    const zip = await JSZip.loadAsync(pptx);
    const diapositivas = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(diapositivas.length).toBe(2);
  }, 300_000);

});
