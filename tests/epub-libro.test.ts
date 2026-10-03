import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { OPCIONES_EPUB_POR_DEFECTO, convertirPdfAEpub, type OpcionesEpub } from '../src/lib/epub';
import { PARRAFOS, crearLibroPdf, hayLibreOffice } from './util/libro';
import { OPS_NODE, abrirDoc, hayEpubcheck, leerEpub, renderNode, validarConEpubcheck } from './util/epub';

async function convertir(pdf: Uint8Array, opciones: Partial<OpcionesEpub> = {}, nombre = 'cuaderno.pdf') {
  const doc = await abrirDoc(pdf);
  return convertirPdfAEpub({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_EPUB_POR_DEFECTO, ...opciones }, nombreArchivo: nombre });
}

const textosP = (html: string) => [...html.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => m[1].replace(/<[^>]+>/g, ''));
const validar = (datos: Uint8Array) => {
  if (!hayEpubcheck) return;
  const informe = validarConEpubcheck(datos);
  expect(informe.errores, informe.errores.join('\n')).toEqual([]);
  expect(informe.avisos, informe.avisos.join('\n')).toEqual([]);
};

describe.skipIf(!hayLibreOffice)('PDF a EPUB con un libro real (LibreOffice)', () => {
  let pdf: Uint8Array;
  beforeAll(async () => {
    pdf = await crearLibroPdf('normal');
  }, 120_000);

  it('detecta capítulos por los marcadores, con título, autor e idioma del PDF', async () => {
    const r = await convertir(pdf);
    expect(r.resumen).toMatchObject({ paginas: 8, capitulos: 3, idioma: 'es', estrategia: 'marcadores del PDF', escaneado: false });
    const { texto, archivos } = await leerEpub(r.datos);
    const opf = await texto('OEBPS/content.opf');
    expect(opf).toContain('<dc:title>El cuaderno azul</dc:title>');
    expect(opf).toContain('<dc:creator>Ana Prueba</dc:creator>');
    expect(opf).toContain('properties="cover-image"');
    expect(archivos.filter((a) => /cap\d+\.xhtml$/.test(a))).toHaveLength(3);
    const nav = await texto('OEBPS/nav.xhtml');
    expect(nav).toContain('Capítulo 1: La librería');
    expect(nav).toContain('Capítulo 3: El regreso');
    expect(nav).toContain('El comienzo'); // segundo nivel del índice
    validar(r.datos);
  }, 120_000);

  it('quita cabeceras, pies y números de página; conserva todo el texto, sin mezclar columnas', async () => {
    const r = await convertir(pdf);
    const { texto } = await leerEpub(r.datos);
    let todo = '';
    for (const n of [1, 2, 3]) todo += await texto(`OEBPS/cap00${n}.xhtml`);
    expect(todo).not.toContain('El cuaderno azul —');
    expect(todo).not.toMatch(/Página \d/);
    const parrafos = [...(await Promise.all([1, 2, 3].map(async (n) => textosP(await texto(`OEBPS/cap00${n}.xhtml`)))))].flat();
    const extra = new Set(['Era un libro muy importante y, según decían, casi imposible de encontrar. Marta lo sabía mejor que nadie, porque había pasado años buscándolo.', 'En las primeras páginas había tres tipos de anotaciones:']);
    for (const p of parrafos) expect(PARRAFOS.includes(p) || extra.has(p), `párrafo inesperado: ${p.slice(0, 80)}`).toBe(true);
    // 2 (cap. 1) + 5 + 1 + 6 + 6 (resto) + ... : todos los párrafos del original aparecen
    expect(parrafos.length).toBeGreaterThanOrEqual(38);
  }, 120_000);

  it('respeta negrita, cursiva, listas, títulos e imágenes', async () => {
    const r = await convertir(pdf);
    const { texto, archivos } = await leerEpub(r.datos);
    const c1 = await texto('OEBPS/cap001.xhtml');
    expect(c1).toContain('<strong>muy importante</strong>');
    expect(c1).toContain('<em>casi imposible de encontrar</em>');
    expect(c1).toContain('<h1 id="c1-t1">Capítulo 1: La librería</h1>');
    expect(c1).toContain('<h2');
    const c2 = await texto('OEBPS/cap002.xhtml');
    expect(c2).toMatch(/<ul>\s*<li>Fechas escritas[^<]*<\/li>\s*<li>Nombres de constelaciones[^<]*<\/li>\s*<li>Pequeños dibujos[^<]*<\/li>\s*<\/ul>/);
    const c3 = await texto('OEBPS/cap003.xhtml');
    expect(c3).toContain('<figure class="imagen"><img src="img/img001.jpg"');
    expect(archivos).toContain('OEBPS/img/img001.jpg');
    expect(archivos).toContain('OEBPS/img/portada.jpg');
    expect(r.resumen.imagenes).toBe(1);
  }, 120_000);

  it('el primer archivo es mimetype sin comprimir', async () => {
    const r = await convertir(pdf);
    expect(Buffer.from(r.datos.slice(0, 4)).toString('hex')).toBe('504b0304');
    expect(Buffer.from(r.datos.slice(30, 38)).toString()).toBe('mimetype');
    expect(Buffer.from(r.datos.slice(38, 58)).toString()).toBe('application/epub+zip');
  }, 120_000);

  it('capítulos cada N páginas', async () => {
    const r = await convertir(pdf, { capitulos: 'paginas', paginasPorCapitulo: 3 });
    expect(r.resumen.capitulos).toBe(3);
    expect(r.resumen.estrategia).toBe('cada 3 páginas');
    validar(r.datos);
  }, 120_000);

  it('capítulos por títulos detectados', async () => {
    const r = await convertir(pdf, { capitulos: 'titulos' });
    expect(r.resumen.estrategia).toBe('títulos detectados');
    expect(r.resumen.capitulos).toBeGreaterThanOrEqual(3);
    validar(r.datos);
  }, 120_000);

  it('sin portada, sin imágenes y sin quitar cabeceras', async () => {
    const r = await convertir(pdf, { portada: false, incluirImagenes: false, quitarCabeceras: false });
    const { texto, archivos } = await leerEpub(r.datos);
    expect(archivos.some((a) => a.includes('portada'))).toBe(false);
    expect(archivos.some((a) => a.includes('img/'))).toBe(false);
    expect((await texto('OEBPS/cap001.xhtml'))).toContain('El cuaderno azul — Ana Prueba');
    validar(r.datos);
  }, 120_000);

  it('modo de diseño fijo: una imagen por página con metadatos de maquetación fija', async () => {
    const r = await convertir(pdf, { modo: 'fijo' });
    const { texto, archivos } = await leerEpub(r.datos);
    expect(archivos.filter((a) => /img\/p\d+\.jpg$/.test(a))).toHaveLength(8);
    const opf = await texto('OEBPS/content.opf');
    expect(opf).toContain('<meta property="rendition:layout">pre-paginated</meta>');
    expect(await texto('OEBPS/p0001.xhtml')).toMatch(/<meta name="viewport" content="width=1200, height=\d+"\/>/);
    expect(r.resumen.estrategia).toBe('diseño fijo');
    validar(r.datos);
  }, 120_000);

  it('metadatos editados por el usuario', async () => {
    const r = await convertir(pdf, { titulo: 'Mi <título> & más', autor: 'Yo', idioma: 'en' });
    const { texto } = await leerEpub(r.datos);
    const opf = await texto('OEBPS/content.opf');
    expect(opf).toContain('<dc:title>Mi &lt;título&gt; &amp; más</dc:title>');
    expect(opf).toContain('<dc:creator>Yo</dc:creator>');
    expect(opf).toContain('<dc:language>en</dc:language>');
    validar(r.datos);
  }, 120_000);
});

describe.skipIf(!hayLibreOffice)('PDF sin marcadores, sin sangría, sin justificar y sin cabeceras', () => {
  it('separa párrafos por espacio y detecta capítulos por los títulos', async () => {
    const pdf = await crearLibroPdf('simple');
    const r = await convertir(pdf);
    expect(r.resumen.estrategia).toBe('títulos detectados');
    expect(r.resumen.capitulos).toBe(3);
    const { texto } = await leerEpub(r.datos);
    const parrafos = (await Promise.all([1, 2, 3].map(async (n) => textosP(await texto(`OEBPS/cap00${n}.xhtml`))))).flat();
    const extra = new Set(['Era un libro muy importante y, según decían, casi imposible de encontrar. Marta lo sabía mejor que nadie, porque había pasado años buscándolo.', 'En las primeras páginas había tres tipos de anotaciones:']);
    // En texto sin justificar ni sangría un párrafo que cruza de página puede quedar partido en sus frases,
    // pero nunca se mezclan párrafos distintos ni se pierde texto.
    const fuentes = [...PARRAFOS, ...extra];
    const malos = parrafos.filter((p) => !fuentes.some((f) => f.includes(p)));
    expect(malos).toEqual([]);
    const todo = parrafos.join(' ');
    for (const f of PARRAFOS) {
      expect(todo, f.slice(0, 40)).toContain(f.slice(0, 40));
      expect(todo, f.slice(-30)).toContain(f.slice(-30));
    }
    expect(parrafos.length).toBeLessThanOrEqual(48);
    validar(r.datos);
  }, 120_000);
});

describe('PDF sin texto (escaneado)', () => {
  async function pdfEscaneado() {
    const doc = await PDFDocument.create();
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#eeeeee' } }).png().toBuffer();
    const img = await doc.embedPng(png);
    for (let i = 0; i < 3; i++) {
      const p = doc.addPage([420, 560]);
      p.drawImage(img, { x: 0, y: 0, width: 420, height: 560 });
    }
    return doc.save();
  }

  it('avisa de que está escaneado y conserva las páginas como imágenes', async () => {
    const r = await convertir(await pdfEscaneado(), { capitulos: 'paginas', paginasPorCapitulo: 1 }, 'escaneo.pdf');
    expect(r.resumen.escaneado).toBe(true);
    expect(r.resumen.advertencias.join(' ')).toMatch(/escaneado/);
    expect(r.resumen.imagenes).toBe(3);
    validar(r.datos);
  }, 120_000);
});

describe('PDF simple creado con pdf-lib', () => {
  it('sin marcadores ni títulos: se divide cada N páginas y funciona', async () => {
    const doc = await PDFDocument.create();
    const fuente = await doc.embedFont(StandardFonts.TimesRoman);
    for (let i = 0; i < 4; i++) {
      const p = doc.addPage([420, 595]);
      for (let l = 0; l < 20; l++) p.drawText(`Línea ${l + 1} de la página ${i + 1}: texto de relleno suficientemente largo para parecer real.`, { x: 40, y: 540 - l * 14, size: 11, font: fuente, color: rgb(0, 0, 0) });
    }
    const r = await convertir(await doc.save(), { paginasPorCapitulo: 2 }, 'plano.pdf');
    expect(r.resumen.capitulos).toBe(2);
    expect(r.resumen.estrategia).toBe('cada 2 páginas');
    validar(r.datos);
  }, 120_000);
});
