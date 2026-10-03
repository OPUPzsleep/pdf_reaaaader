import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { colorDeRegion } from '../src/lib/office/colorTexto';
import { OPCIONES_POWERPOINT_POR_DEFECTO, convertirPdfAPptx, type OpcionesPowerpoint } from '../src/lib/office/pdfAPptx';
import { fuentePptx } from '../src/lib/office/pptxEscribir';
import { pptxAHtml } from '../src/lib/office/pptx';
import { parsearXml } from '../src/lib/office/xml';
import { OPS_NODE, abrirDoc, renderNode } from './util/epub';
import { crearDocumentoPdf, crearPresentacionPdf } from './util/documento';
import { textosPorPagina } from './util/pdfs';

async function convertir(pdf: Uint8Array, opciones: Partial<OpcionesPowerpoint> = {}, nombre = 'diapositivas.pdf') {
  const doc = await abrirDoc(pdf);
  return convertirPdfAPptx({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_POWERPOINT_POR_DEFECTO, ...opciones }, nombreArchivo: nombre });
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

describe('PDF → PowerPoint', () => {
  it('modo editable: fondo sin texto + cuadros de texto con tamaño, negrita, fuente y color', async () => {
    const r = await convertir(await crearPresentacionPdf());
    expect(r.resumen).toMatchObject({ paginas: 2, imagenes: 2 });
    expect(r.resumen.cajas).toBe(5); // título y subtítulo; título, las tres viñetas juntas y el texto final
    const zip = await JSZip.loadAsync(r.datos);
    const d1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const d2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    // tamaño de las diapositivas = tamaño de la página
    expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
    // fondo de imagen y textos editables
    expect(d1).toMatch(/<p:bg><p:bgPr><a:blipFill/);
    expect(texto(d1)).toContain('Plan de lanzamiento');
    expect(texto(d1)).toContain('Producto nuevo - Otoño 2024');
    // título: 54 pt en negrita, blanco (color real detectado sobre el fondo azul), Arial
    expect(d1).toMatch(/sz="5400" b="1"[^>]*><a:solidFill><a:srgbClr val="FFFFFF"\/><\/a:solidFill><a:latin typeface="Arial"\/>[\s\S]*?Plan de lanzamiento/);
    // subtítulo en azul claro (204, 217, 255) y título de la diapositiva 2 en rojo oscuro (191, 13, 13), con la tolerancia del suavizado
    const cerca = (hex: string, esperado: number[]) => [0, 2, 4].every((i, k) => Math.abs(parseInt(hex.slice(i, i + 2), 16) - esperado[k]) <= 14);
    expect(cerca(/srgbClr val="([0-9A-F]{6})"[\s\S]{0,200}Producto nuevo/.exec(d1)![1], [204, 217, 255])).toBe(true);
    expect(cerca(/srgbClr val="([0-9A-F]{6})"[\s\S]{0,200}Objetivos/.exec(d2)![1], [191, 13, 13])).toBe(true);
    expect(d2).toMatch(/typeface="Times New Roman"/);
    const cajaGracias = [...d2.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]).find((c) => c.includes('Gracias por su atención'))!;
    const xGracias = Number(/<a:off x="(\d+)"/.exec(cajaGracias)![1]) / 12700;
    expect(xGracias).toBeGreaterThan(300); // el texto centrado de la página queda centrado en la diapositiva
    expect(xGracias).toBeLessThan(360);
    // el título, las viñetas (una sola caja de tres líneas) y el texto final son cajas distintas
    expect((d2.match(/<p:sp>/g) ?? []).length).toBe(3);
    expect(d2).toMatch(/<a:p>(?:(?!<\/a:p>)[\s\S])*Aumentar las ventas[\s\S]*?Reforzar la marca[\s\S]*?Abrir tres mercados/);
    // el fondo no contiene el texto (se omitió al dibujar), pero sí la banda roja
    const fondo2 = Object.keys(zip.files).find((f) => /^ppt\/media\/image2\.jpg$/.test(f));
    expect(fondo2).toBeTruthy();
  }, 120_000);

  it('el paquete OOXML es coherente (partes, relaciones y tipos de contenido)', async () => {
    const r = await convertir(await crearPresentacionPdf());
    const zip = await JSZip.loadAsync(r.datos);
    const nombres = Object.keys(zip.files);
    expect(nombres[0]).toBe('[Content_Types].xml');
    for (const n of nombres.filter((x) => /\.(xml|rels)$/.test(x))) parsearXml(await zip.file(n)!.async('string'));
    const tipos = await zip.file('[Content_Types].xml')!.async('string');
    for (const parte of nombres.filter((x) => /^ppt\/(slides\/slide\d+|slideMasters\/slideMaster\d+|slideLayouts\/slideLayout\d+|theme\/theme\d+|presentation|presProps|viewProps|tableStyles)\.xml$/.test(x))) {
      expect(tipos, parte).toContain(`PartName="/${parte}"`);
    }
    // cada relación de cada parte apunta a algo que existe
    for (const rels of nombres.filter((x) => x.endsWith('.rels'))) {
      const carpeta = rels.replace(/_rels\/[^/]+$/, '');
      for (const rel of parsearXml(await zip.file(rels)!.async('string')).h) {
        const destino = rel.a.Target.startsWith('/') ? rel.a.Target.slice(1) : new URL(rel.a.Target, `http://x/${carpeta}`).pathname.slice(1);
        expect(nombres, `${rels} → ${rel.a.Target}`).toContain(destino);
      }
    }
  }, 120_000);

  it('vuelve a leerse con el motor propio de PowerPoint → HTML (ida y vuelta)', async () => {
    const r = await convertir(await crearPresentacionPdf());
    const { html, unidades } = await pptxAHtml(r.datos);
    expect(unidades).toBe(2);
    const t = texto(html.replace(/<style[\s\S]*?<\/style>/g, ''));
    for (const s of ['Plan de lanzamiento', 'Objetivos', 'Aumentar las ventas', 'Gracias por su atención']) expect(t, s).toContain(s);
    expect(html).toMatch(/<svg|background:url|<image/); // el fondo
    expect(html).toMatch(/@page\{size:960pt 540pt/);
  }, 120_000);

  it('modo «solo imágenes»: una imagen por página y sin texto', async () => {
    const r = await convertir(await crearPresentacionPdf(), { modo: 'imagen' });
    const zip = await JSZip.loadAsync(r.datos);
    const d1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(d1).not.toContain('<p:sp>');
    expect(d1).toContain('<p:bg>');
    expect(r.resumen.cajas).toBe(0);
  }, 120_000);

  it('páginas de distinto tamaño: se ajustan a la diapositiva sin deformarse', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    d.addPage([800, 400]).drawText('Ancha', { x: 50, y: 200, size: 30, font: f });
    d.addPage([400, 800]).drawText('Alta', { x: 50, y: 400, size: 30, font: f });
    const r = await convertir(await d.save());
    const zip = await JSZip.loadAsync(r.datos);
    const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(s2).toContain('<p:pic>'); // otra proporción: la imagen va como imagen ajustada, no como fondo
    expect(s2).not.toContain('<p:bg>');
    const m = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(s2.slice(s2.indexOf('<p:pic>')))!;
    expect(Number(m[1]) / Number(m[2])).toBeCloseTo(0.5, 1);
  }, 120_000);

  it('PDF de texto con dos columnas y títulos: las columnas no se mezclan en un mismo cuadro', async () => {
    const r = await convertir(await crearDocumentoPdf({ conImagen: false }));
    const zip = await JSZip.loadAsync(r.datos);
    const s = await zip.file('ppt/slides/slide1.xml')!.async('string');
    // la tabla (4 columnas en la misma línea) genera un cuadro por columna
    for (const celda of ['Producto', 'Unidades', 'Precio', 'Total']) {
      const caja = [...s.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]).find((c) => c.includes(`>${celda}<`));
      expect(caja, celda).toBeTruthy();
      expect(texto(caja!).trim().startsWith(celda)).toBe(true);
    }
  }, 120_000);

  it('el color del texto se obtiene comparando la página con y sin texto', () => {
    const w = 20;
    const h = 10;
    const sin = new Uint8ClampedArray(w * h * 4).fill(255);
    const con = new Uint8ClampedArray(sin);
    for (let y = 3; y < 7; y++) for (let x = 4; x < 16; x++) con.set([200, 30, 30, 255], (y * w + x) * 4);
    expect(colorDeRegion({ ancho: w, alto: h, datos: con }, { ancho: w, alto: h, datos: sin }, { x0: 0, y0: 0, x1: w, y1: h })).toBe('C81E1E');
    expect(colorDeRegion({ ancho: w, alto: h, datos: sin }, { ancho: w, alto: h, datos: sin }, { x0: 0, y0: 0, x1: w, y1: h })).toBeNull();
  });

  it('asigna fuentes parecidas a las del PDF', () => {
    expect(fuentePptx('Calibri', false)).toBe('Calibri');
    expect(fuentePptx('Helvetica', false)).toBe('Arial');
    expect(fuentePptx('Times', false)).toBe('Times New Roman');
    expect(fuentePptx('Courier', true)).toBe('Courier New');
    expect(fuentePptx('Garamond Premier Pro', false)).toBe('Times New Roman');
    expect(fuentePptx(undefined, false)).toBe('Arial');
    expect(fuentePptx('Fuente Rara Sans', false)).toBe('Fuente Rara Sans');
  });

  describe.skipIf(!hayLibreOffice)('compatibilidad con otro programa (LibreOffice)', () => {
    it('LibreOffice abre el .pptx y lo convierte a PDF con el mismo texto', async () => {
      const r = await convertir(await crearPresentacionPdf());
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptx-lo-'));
      fs.writeFileSync(path.join(dir, 'salida.pptx'), r.datos);
      execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', 'pdf', '--outdir', dir, path.join(dir, 'salida.pptx')], { stdio: 'ignore', timeout: 180_000 });
      const textos = await textosPorPagina(new Uint8Array(fs.readFileSync(path.join(dir, 'salida.pdf'))));
      expect(textos).toHaveLength(2);
      expect(textos[0]).toContain('Plan de lanzamiento');
      expect(textos[1]).toContain('Aumentar las ventas');
    }, 240_000);
  });
});
