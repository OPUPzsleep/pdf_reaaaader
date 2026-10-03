import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { OPCIONES_WORD_POR_DEFECTO, convertirPdfADocx, type OpcionesWord } from '../src/lib/office/pdfADocx';
import { docxAHtml } from '../src/lib/office/docx';
import { parsearXml, descendientes } from '../src/lib/office/xml';
import { OPS_NODE, abrirDoc, renderNode } from './util/epub';
import { crearDocumentoPdf } from './util/documento';
import { crearPdf } from './util/pdfs';

async function convertir(pdf: Uint8Array, opciones: Partial<OpcionesWord> = {}, nombre = 'informe.pdf') {
  const doc = await abrirDoc(pdf);
  return convertirPdfADocx({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_WORD_POR_DEFECTO, ...opciones }, nombreArchivo: nombre });
}

const hayLibreOffice = (() => {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const texto = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('PDF → Word', () => {
  it('reconstruye títulos, párrafos con formato, listas, tabla e imagen', async () => {
    const r = await convertir(await crearDocumentoPdf());
    const zip = await JSZip.loadAsync(r.datos);
    const doc = await zip.file('word/document.xml')!.async('string');
    const t = texto(doc);
    // títulos con estilo de título
    expect(doc).toMatch(/<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Informe de resultados</);
    expect(doc).toMatch(/<w:pStyle w:val="Heading2"\/>[\s\S]*?1\. Resumen|<w:pStyle w:val="Heading\d"\/>/);
    // el párrafo se une en uno solo y conserva negrita, cursiva y código
    expect(t).toContain('Este informe resume los resultados del trimestre y las previsiones para el periodo siguiente.');
    expect(doc).toMatch(/<w:b\/><w:bCs\/><\/w:rPr><w:t xml:space="preserve">texto importante</);
    expect(doc).toMatch(/<w:i\/><w:iCs\/><\/w:rPr><w:t xml:space="preserve">énfasis</);
    expect(doc).toMatch(/Courier New[^>]*\/><\/w:rPr><w:t xml:space="preserve">npm run build</);
    // listas: viñetas (numId 1) y numerada con reinicio propio
    expect((doc.match(/<w:numId w:val="1"\/>/g) ?? []).length).toBe(2);
    expect(doc).toMatch(/<w:numId w:val="3"\/>/);
    expect(t).toContain('Preparar los datos');
    // tabla con 4 columnas y 4 filas, cabecera en negrita y números alineados a la derecha
    expect((doc.match(/<w:tbl>/g) ?? []).length).toBe(1);
    expect((doc.match(/<w:tr>/g) ?? []).length).toBe(4);
    expect(doc).toContain('<w:tblHeader/>');
    expect(doc).toMatch(/<w:jc w:val="right"\/><\/w:pPr><w:r><w:t xml:space="preserve">120</);
    expect((doc.match(/<w:gridCol /g) ?? []).length).toBe(4);
    // la imagen
    expect(doc).toContain('<w:drawing>');
    expect(Object.keys(zip.files).some((f) => /^word\/media\/image1\.(jpg|png)$/.test(f))).toBe(true);
    expect(r.resumen).toMatchObject({ paginas: 1, tablas: 1, imagenes: 1, idioma: 'es' });
    // el texto de la tabla no se repite en el flujo de párrafos
    expect(t.split('Manzanas').length - 1).toBe(1);
  }, 60_000);

  it('el documento generado es un paquete OOXML coherente', async () => {
    const r = await convertir(await crearDocumentoPdf());
    const zip = await JSZip.loadAsync(r.datos);
    const nombres = Object.keys(zip.files);
    expect(nombres[0]).toBe('[Content_Types].xml');
    // Todas las partes XML están bien formadas
    for (const n of nombres.filter((x) => /\.(xml|rels)$/.test(x))) parsearXml(await zip.file(n)!.async('string'));
    // Cada relación apunta a una parte que existe
    const rels = parsearXml(await zip.file('word/_rels/document.xml.rels')!.async('string'));
    for (const rel of descendientes(rels, 'Relationship')) expect(nombres, rel.a.Target).toContain(`word/${rel.a.Target}`);
    // Tipos de contenido declarados para cada parte
    const tipos = await zip.file('[Content_Types].xml')!.async('string');
    for (const parte of ['/word/document.xml', '/word/styles.xml', '/word/numbering.xml', '/word/settings.xml', '/docProps/core.xml']) expect(tipos).toContain(`PartName="${parte}"`);
    // Metadatos
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('<dc:title>informe</dc:title>');
  }, 60_000);

  it('opciones: sin tablas el texto fluye, sin imágenes no se incluyen, título y autor propios', async () => {
    const r = await convertir(await crearDocumentoPdf(), { tablas: false, incluirImagenes: false, titulo: 'Mi informe', autor: 'Ana' });
    const zip = await JSZip.loadAsync(r.datos);
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).not.toContain('<w:tbl>');
    expect(doc).not.toContain('<w:drawing>');
    expect(texto(doc)).toContain('Manzanas');
    const core = await zip.file('docProps/core.xml')!.async('string');
    expect(core).toContain('<dc:title>Mi informe</dc:title>');
    expect(core).toContain('<dc:creator>Ana</dc:creator>');
  }, 60_000);

  it('vuelve a leerse con el motor propio de Word → HTML (ida y vuelta)', async () => {
    const r = await convertir(await crearDocumentoPdf());
    const { html } = await docxAHtml(r.datos);
    const t = texto(html.replace(/<style[\s\S]*?<\/style>/g, ''));
    for (const s of ['Informe de resultados', '1. Resumen', 'texto importante', 'Primer punto de la lista', '1. Preparar los datos', '2. Revisar las cifras', 'Manzanas', '139,50']) expect(t, s).toContain(s);
    expect(html).toContain('<table');
    expect(html).toMatch(/<img src="data:image\/(jpeg|png);base64,/);
    expect(html).toMatch(/@page s1\{size:595pt 842pt/);
  }, 60_000);

  it('un PDF sin texto avisa de que parece escaneado', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const d = await PDFDocument.create();
    d.addPage([300, 400]);
    const r = await convertir(await d.save());
    expect(r.resumen.advertencias.join(' ')).toMatch(/parece escaneado/);
  }, 60_000);

  it('varias páginas: los párrafos que cruzan de página se unen y se respeta el idioma', async () => {
    const r = await convertir(await crearPdf(3, { texto: (i) => `Línea de la página ${i}` }), { idioma: 'en' });
    expect(r.resumen).toMatchObject({ paginas: 3, idioma: 'en' });
    const zip = await JSZip.loadAsync(r.datos);
    expect(await zip.file('word/styles.xml')!.async('string')).toContain('w:lang w:val="en-US"');
  }, 60_000);

  describe.skipIf(!hayLibreOffice)('compatibilidad con otro programa (LibreOffice)', () => {
    it('LibreOffice abre el .docx y lo convierte a PDF con el mismo texto', async () => {
      const r = await convertir(await crearDocumentoPdf());
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-lo-'));
      fs.writeFileSync(path.join(dir, 'salida.docx'), r.datos);
      execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', 'pdf', '--outdir', dir, path.join(dir, 'salida.docx')], { stdio: 'ignore', timeout: 180_000 });
      const { textosPorPagina } = await import('./util/pdfs');
      const t = (await textosPorPagina(new Uint8Array(fs.readFileSync(path.join(dir, 'salida.pdf'))))).join(' ');
      for (const s of ['Informe de resultados', 'texto importante', 'Primer punto', 'Manzanas', 'Preparar los datos']) expect(t, s).toContain(s);
    }, 240_000);
  });
});
