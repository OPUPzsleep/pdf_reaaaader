import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { OPCIONES_EPUB_POR_DEFECTO, convertirPdfAEpub } from '../src/lib/epub';
import { OPS_NODE, abrirDoc, hayEpubcheck, leerEpub, renderNode, validarConEpubcheck } from './util/epub';

const TEXTO = [
  { titulo: 'The Bright Morning', lineas: [] as string[] },
  {
    titulo: '',
    lineas: [
      'The morning was bright and the streets were quiet when',
      'Anna opened the old wooden door of the little bakery.',
      'She lit the oven and began to prepare the bread that',
      'the whole village would eat before the church bells rang.',
    ],
  },
  {
    titulo: '',
    lineas: [
      'Later, the baker arrived with a basket full of apples.',
      'They talked about the weather and about the winter that',
      'was coming, and neither of them noticed the long hour.',
    ],
  },
];

/** Una página «escaneada»: solo una imagen con texto dibujado, sin capa de texto. */
async function pdfEscaneadoConTexto() {
  const w = 1240;
  const h = 1754;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#111111';
  const fuente = GlobalFonts.has('DejaVu Sans') ? 'DejaVu Sans' : 'sans-serif';
  ctx.font = `bold 64px "${fuente}"`;
  ctx.fillText(TEXTO[0].titulo, 120, 220);
  ctx.font = `38px "${fuente}"`;
  let y = 360;
  for (const bloque of TEXTO.slice(1)) {
    for (const linea of bloque.lineas) {
      ctx.fillText(linea, 120, y);
      y += 58;
    }
    y += 70;
  }
  const png = canvas.toBuffer('image/png');
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(png);
  const p = doc.addPage([595.28, 841.89]);
  p.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return doc.save();
}

describe('OCR de PDF escaneados', () => {
  it('reconoce el texto de una página escaneada y lo estructura en párrafos', async () => {
    const pdf = await pdfEscaneadoConTexto();
    const doc = await abrirDoc(pdf);
    const r = await convertirPdfAEpub({
      doc, ops: OPS_NODE, render: renderNode(doc, { idioma: 'eng' }),
      opciones: { ...OPCIONES_EPUB_POR_DEFECTO, ocr: true, idiomaOcr: 'eng', portada: false, capitulos: 'paginas', idioma: 'en' },
      nombreArchivo: 'escaneo.pdf',
    });
    const { texto } = await leerEpub(r.datos);
    const cap = await texto('OEBPS/cap001.xhtml');
    const plano = cap.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(plano).toContain('Bright Morning');
    expect(plano).toMatch(/bakery/i);
    expect(plano).toMatch(/basket full of apples/i);
    // Dos párrafos tras el título
    expect([...cap.matchAll(/<p>/g)].length).toBeGreaterThanOrEqual(2);
    expect(r.resumen.advertencias.join(' ')).toMatch(/OCR/);
    expect(r.resumen.escaneado).toBe(false);
    if (hayEpubcheck) expect(validarConEpubcheck(r.datos).errores).toEqual([]);
  }, 180_000);

  it('sin OCR avisa de que el PDF es una imagen', async () => {
    const doc = await abrirDoc(await pdfEscaneadoConTexto());
    const r = await convertirPdfAEpub({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_EPUB_POR_DEFECTO, portada: false }, nombreArchivo: 'escaneo.pdf' });
    expect(r.resumen.escaneado).toBe(true);
    expect(r.resumen.advertencias.join(' ')).toMatch(/Activa el OCR/);
  }, 120_000);
});
