import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { OPCIONES_EPUB_POR_DEFECTO, convertirPdfAEpub, type OpcionesEpub } from '../src/lib/epub';
import { extraerPagina } from '../src/lib/epub/extraer';
import { OPS_NODE, abrirDoc, leerEpub, renderNode } from './util/epub';

const jpeg = async (color: string, ancho = 300, alto = 400) =>
  new Uint8Array(await sharp({ create: { width: ancho, height: alto, channels: 3, background: color } }).jpeg().toBuffer());

/**
 * Una novela ilustrada como las de los traductores aficionados: portada, cabecera con el título y un enlace en todas las
 * páginas, un número de página distinto en cada una, páginas de texto, dos ilustraciones a toda página, una tercera partida
 * en tres tiras y una figura más pequeña dentro de una página de texto.
 */
async function novelaIlustrada(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  const encabezado = (pagina: ReturnType<typeof doc.addPage>, n: number) => {
    pagina.drawText('Mi libro ilustrado', { x: 40, y: 580, size: 9, font: letra });
    pagina.drawText(String(n), { x: 380, y: 580, size: 9, font: letra });
    pagina.drawText('www.traductor.com/mi-libro', { x: 150, y: 580, size: 9, font: letra });
  };
  const texto = (pagina: ReturnType<typeof doc.addPage>, n: number) => {
    for (let k = 0; k < 12; k++) pagina.drawText(`Línea ${k + 1} de la página ${n}: texto de relleno de la novela`, { x: 40, y: 520 - k * 16, size: 9, font: letra });
  };

  const portada = doc.addPage([400, 600]);
  portada.drawImage(await doc.embedJpg(await jpeg('#3355aa')), { x: 0, y: 0, width: 400, height: 600 });
  portada.drawText('Mi libro ilustrado', { x: 60, y: 300, size: 30, font: letra });

  for (let n = 2; n <= 10; n++) {
    const p = doc.addPage([400, 600]);
    encabezado(p, n);
    if (n === 3 || n === 7) p.drawImage(await doc.embedJpg(await jpeg(n === 3 ? '#aa3333' : '#33aa55')), { x: 0, y: 0, width: 400, height: 600 });
    else if (n === 5) {
      for (let k = 0; k < 3; k++) p.drawImage(await doc.embedJpg(await jpeg(['#ccaa00', '#00aacc', '#aa00cc'][k], 400, 200)), { x: 0, y: 400 - k * 200, width: 400, height: 200 });
    } else {
      texto(p, n);
      if (n === 9) p.drawImage(await doc.embedJpg(await jpeg('#888888', 200, 150)), { x: 100, y: 100, width: 200, height: 150 });
    }
  }
  return doc.save();
}

async function convertir(pdf: Uint8Array, opciones: Partial<OpcionesEpub> = {}) {
  const doc = await abrirDoc(pdf);
  return convertirPdfAEpub({ doc, ops: OPS_NODE, render: renderNode(doc), opciones: { ...OPCIONES_EPUB_POR_DEFECTO, ...opciones }, nombreArchivo: 'ilustrado.pdf' });
}

async function capitulos(datos: Uint8Array) {
  const { texto, archivos } = await leerEpub(datos);
  const xhtml = archivos.filter((a) => /OEBPS\/cap\d+\.xhtml$/.test(a)).sort();
  return { todo: (await Promise.all(xhtml.map((a) => texto(a)))).join('\n'), archivos };
}

describe('PDF a EPUB: ilustraciones de una novela ilustrada', () => {
  let pdf: Uint8Array;
  beforeAll(async () => {
    pdf = await novelaIlustrada();
  }, 60_000);

  it('conserva todas las ilustraciones aunque lleven cabecera, enlace y un número de página distinto', async () => {
    const r = await convertir(pdf);
    // 2 ilustraciones + la partida en tiras (una sola) + la figura. La portada no se repite dentro del libro.
    expect(r.resumen.imagenes).toBe(4);
    const { todo, archivos } = await capitulos(r.datos);
    expect(archivos.filter((a) => /OEBPS\/img\/img\d+\.jpg$/.test(a))).toHaveLength(4);
    expect(archivos).toContain('OEBPS/img/portada.jpg');
    expect(todo.match(/<figure class="imagen pagina-completa">/g)).toHaveLength(4);
    // La cabecera y los números de página no pasan al texto
    expect(todo).not.toContain('Mi libro ilustrado');
    expect(todo).not.toContain('www.traductor.com');
    expect(todo).toContain('Línea 1 de la página 2');
    expect(todo).toContain('Línea 12 de la página 10');
  }, 120_000);

  it('las imágenes salen en su sitio, entre las páginas de texto', async () => {
    const { todo } = await capitulos((await convertir(pdf)).datos);
    const posicion = (t: string) => todo.indexOf(t);
    const figuras = [...todo.matchAll(/<figure class="imagen pagina-completa"><img src="img\/(img\d+\.jpg)"/g)].map((m) => m.index!);
    expect(figuras).toHaveLength(4);
    // página 3 → tras el texto de la 2 y antes del de la 4; página 7 → entre la 6 y la 8
    expect(posicion('Línea 12 de la página 2')).toBeLessThan(figuras[0]);
    expect(figuras[0]).toBeLessThan(posicion('Línea 1 de la página 4'));
    expect(posicion('Línea 12 de la página 6')).toBeLessThan(figuras[2]);
    expect(figuras[2]).toBeLessThan(posicion('Línea 1 de la página 8'));
  }, 120_000);

  it('sin «página completa» las imágenes van dentro del texto', async () => {
    const { todo } = await capitulos((await convertir(pdf, { imagenesPaginaCompleta: false })).datos);
    expect(todo.match(/<figure class="imagen">/g)).toHaveLength(4);
    expect(todo).not.toContain('pagina-completa');
  }, 120_000);

  it('sin portada, la primera página cuenta como una ilustración más', async () => {
    const r = await convertir(pdf, { portada: false });
    expect(r.resumen.imagenes).toBe(5);
  }, 120_000);
});

describe('imágenes dibujadas más grandes que la página', () => {
  it('solo cuenta la parte que se ve', async () => {
    const doc = await PDFDocument.create();
    const imagen = await doc.embedJpg(await jpeg('#336699', 800, 800));
    const enorme = doc.addPage([400, 600]); // la imagen cubre la página y se sale por todos los lados
    enorme.drawImage(imagen, { x: -100, y: -300, width: 2000, height: 2000 });
    const aMedias = doc.addPage([400, 600]); // la mitad derecha queda fuera
    aMedias.drawImage(imagen, { x: 200, y: 0, width: 400, height: 600 });
    const fuera = doc.addPage([400, 600]); // no se ve nada
    fuera.drawImage(imagen, { x: 1000, y: 1000, width: 100, height: 100 });
    const pdfDoc = await abrirDoc(await doc.save());
    const leer = async (n: number) => (await extraerPagina(await pdfDoc.getPage(n), OPS_NODE, { imagenes: true })).imagenes;

    const [a] = await leer(1);
    expect(a).toMatchObject({ x: 0, y: 0 });
    expect(a.ancho).toBeCloseTo(400, 0);
    expect(a.alto).toBeCloseTo(600, 0);
    const [b] = await leer(2);
    expect(b.x).toBeCloseTo(200, 0);
    expect(b.ancho).toBeCloseTo(200, 0);
    expect(b.alto).toBeCloseTo(600, 0);
    expect(await leer(3)).toEqual([]);
  }, 60_000);

  it('en el EPUB la imagen sale con la forma de la página y no como un recuadro casi vacío', async () => {
    const doc = await PDFDocument.create();
    const letra = await doc.embedFont(StandardFonts.Helvetica);
    for (let n = 1; n <= 5; n++) {
      const p = doc.addPage([400, 600]);
      if (n === 3) p.drawImage(await doc.embedJpg(await jpeg('#cc5522', 800, 800)), { x: -100, y: -300, width: 2000, height: 2000 });
      else for (let k = 0; k < 12; k++) p.drawText(`Línea ${k + 1} de la página ${n}: texto de relleno de la novela`, { x: 40, y: 520 - k * 16, size: 9, font: letra });
    }
    const r = await convertir(await doc.save(), { portada: false });
    const { todo } = await capitulos(r.datos);
    const m = /<img src="img\/img001\.jpg" alt="[^"]*" width="(\d+)" height="(\d+)"/.exec(todo);
    expect(m).not.toBeNull();
    expect(Number(m![2]) / Number(m![1])).toBeCloseTo(1.5, 1); // 600 / 400, no 1:1 como la imagen sin recortar
  }, 120_000);
});
