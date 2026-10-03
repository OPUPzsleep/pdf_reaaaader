import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { OPCIONES_EPUB_POR_DEFECTO, convertirPdfAEpub } from '../src/lib/epub';
import { OPS_NODE, abrirDoc, leerEpub, renderNode } from './util/epub';

describe('páginas con /Rotate', () => {
  it('lee el texto derecho aunque la página esté girada 90°', async () => {
    const doc = await PDFDocument.create();
    const fuente = await doc.embedFont(StandardFonts.TimesRoman);
    // Página de 400×600 en el archivo, mostrada girada 90° (queda apaisada 600×400).
    // El texto se dibuja girado +90° en el contenido para que, con /Rotate 90 (horario), se lea derecho.
    for (let n = 0; n < 2; n++) {
      const p = doc.addPage([400, 600]);
      p.setRotation(degrees(90));
      for (let i = 0; i < 18; i++) {
        // Con /Rotate 90 el punto visual (vx, vy) del contenido es (x, y) = (400 - vy, vx)
        const vx = 50;
        const vy = 340 - i * 16;
        p.drawText(`Línea ${i + 1} de la página ${n + 1}: texto suficientemente largo para parecer un párrafo real.`, { x: 400 - vy, y: vx, size: 11, font: fuente, rotate: degrees(90) });
      }
    }
    const pdf = await doc.save();
    const abierto = await abrirDoc(pdf);
    const r = await convertirPdfAEpub({ doc: abierto, ops: OPS_NODE, render: renderNode(abierto), opciones: { ...OPCIONES_EPUB_POR_DEFECTO, portada: false, capitulos: 'paginas', paginasPorCapitulo: 1 }, nombreArchivo: 'girado.pdf' });
    const { texto } = await leerEpub(r.datos);
    const c1 = (await texto('OEBPS/cap001.xhtml')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(c1).toContain('Línea 1 de la página 1');
    expect(c1).toContain('Línea 18 de la página 1');
    // Orden de arriba abajo
    expect(c1.indexOf('Línea 2 ')).toBeLessThan(c1.indexOf('Línea 10 '));
  }, 120_000);
});
