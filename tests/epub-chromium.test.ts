import { describe, expect, it } from 'vitest';
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { OPCIONES_EPUB_POR_DEFECTO, convertirPdfAEpub } from '../src/lib/epub';
import { OPS_NODE, abrirDoc, hayEpubcheck, leerEpub, renderNode, validarConEpubcheck } from './util/epub';

const LOREM = [
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.',
  'There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France.',
  'In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.',
  'It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual revelations were conceded to England at that favoured period, as at this.',
];
const parrafos = (n: number) => Array.from({ length: n }, (_, i) => `<p>${LOREM[i % LOREM.length]}</p>`).join('\n');

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
@page { size: A5; margin: 18mm 14mm; }
body { font: 11pt/1.45 'DejaVu Serif', serif; }
h1 { font: 700 22pt 'DejaVu Sans', sans-serif; break-before: page; margin: 0 0 12pt; }
h2 { font: 700 14pt 'DejaVu Sans', sans-serif; margin: 16pt 0 6pt; }
p { margin: 0 0 8pt; text-align: justify; }
.cols { column-count: 2; column-gap: 8mm; }
ul { margin: 0 0 8pt 16pt; }
</style></head><body>
<h1 style="break-before:auto">Chapter One: The Period</h1>
${parrafos(5)}
<h2>A second look</h2>
<p>This paragraph has <b>bold text</b>, <i>italic text</i> and a list afterwards:</p>
<ul><li>First item of the list</li><li>Second item of the list</li><li>Third item of the list</li></ul>
${parrafos(3)}
<h1>Chapter Two: Two columns</h1>
<div class="cols">${parrafos(8)}</div>
<h1>Chapter Three: The end</h1>
${parrafos(4)}
</body></html>`;

describe('PDF generado por Chromium (otro productor de PDF)', () => {
  it('convierte con encabezado/pie, marcadores y columnas', async () => {
    let navegador;
    try {
      navegador = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
    } catch {
      return; // sin Chromium no hay prueba
    }
    const page = await navegador.newPage();
    await page.setContent(HTML);
    const pdf = await page.pdf({
      format: 'A5',
      margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:8px;width:100%;text-align:center;font-family:DejaVu Sans">A Tale of Two Cities — sample</div>',
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;font-family:DejaVu Sans">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      outline: true,
      tagged: true,
      preferCSSPageSize: false,
    });
    await navegador.close();
    fs.writeFileSync('/tmp/chromium.pdf', pdf);
    const doc = await abrirDoc(new Uint8Array(pdf));
    const r = await convertirPdfAEpub({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_EPUB_POR_DEFECTO, capitulos: 'auto' }, nombreArchivo: 'tale.pdf' });
    fs.writeFileSync('/tmp/chromium.epub', r.datos);
    fs.writeFileSync('/tmp/chromium-resumen.json', JSON.stringify(r.resumen));
    const { texto, archivos } = await leerEpub(r.datos);
    for (const a of archivos.filter((x) => /cap\d+\.xhtml$/.test(x))) fs.appendFileSync('/tmp/chromium-caps.txt', `\n=== ${a}\n` + (await texto(a)).replace(/^[\s\S]*<section[^>]*>/, '').slice(0, 3000));
    expect(r.resumen).toMatchObject({ idioma: 'en', capitulos: 3, estrategia: 'marcadores del PDF' });
    const c1 = await texto('OEBPS/cap001.xhtml');
    const c2 = await texto('OEBPS/cap002.xhtml');
    expect(c1).toContain('<strong>bold text</strong>');
    expect(c1).toContain('<em>italic text</em>'); // cursiva sintética (inclinación del texto)
    expect(c2).toContain('<h1 id="c2-t1">Chapter Two: Two columns</h1>');
    expect(c1 + c2).not.toContain('A Tale of Two Cities');
    expect(c1 + c2).not.toMatch(/Page \d of \d/);
    // Ningún párrafo mezcla líneas de las dos columnas: todos son frases completas del texto original
    const ps = [...(c1 + c2 + (await texto('OEBPS/cap003.xhtml'))).matchAll(/<p>(.*?)<\/p>/gs)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    for (const p of ps) expect(LOREM.includes(p) || p.startsWith('This paragraph has') || /^(First|Second|Third) item of the list$/.test(p), p.slice(0, 60)).toBe(true);
    if (hayEpubcheck) expect(validarConEpubcheck(r.datos).errores).toEqual([]);
  }, 180_000);
});
