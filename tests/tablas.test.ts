import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { analizarNumero, detectarDecimal } from '../src/lib/tablas/numeros';
import { crearXlsx, letraDeColumna, nombresDeHoja } from '../src/lib/tablas/xlsx';
import { detectarTablas } from '../src/lib/tablas/detectar';
import { OPCIONES_TABLAS_POR_DEFECTO, pdfAXlsx, paginasAXlsx } from '../src/lib/tablas';
import type { Fragmento, PaginaExtraida } from '../src/lib/epub/tipos';
import { NS_ODF, crearPdfDesdeOdf, xlsxACsv } from './util/office';
import { hayLibreOffice } from './util/libro';
import { OPS_NODE, abrirDoc } from './util/epub';

const frag = (texto: string, x: number, y: number, extra: Partial<Fragmento> = {}): Fragmento => ({
  texto, x, y, ancho: texto.length * 5.2, tam: 11, negrita: false, cursiva: false, mono: false, ...extra,
});
const pagina = (indice: number, fragmentos: Fragmento[]): PaginaExtraida => ({ indice, ancho: 400, alto: 600, giro: 0, origenY: 0, fragmentos, imagenes: [] });

describe('números', () => {
  it('interpreta formatos español e inglés', () => {
    expect(analizarNumero('1.234,56', 'coma')?.valor).toBe(1234.56);
    expect(analizarNumero('1,234.56', 'punto')?.valor).toBe(1234.56);
    expect(analizarNumero('1,234.56', 'coma')?.valor).toBe(1234.56); // formato contrario inequívoco
    expect(analizarNumero('12,5', 'coma')?.valor).toBe(12.5);
    expect(analizarNumero('1.234', 'coma')?.valor).toBe(1234);
    expect(analizarNumero('1,234', 'punto')?.valor).toBe(1234);
    expect(analizarNumero('3.14', 'coma')?.valor).toBe(3.14);
    expect(analizarNumero('-45', 'coma')?.valor).toBe(-45);
    expect(analizarNumero('(1.200,00)', 'coma')?.valor).toBe(-1200);
    expect(analizarNumero('€ 99,90', 'coma')?.valor).toBe(99.9);
    expect(analizarNumero('45 %', 'coma')).toEqual({ valor: 0.45, porcentaje: true });
  });
  it('deja como texto los códigos y las fechas', () => {
    for (const t of ['00123', '2024-01-05', '12/03/2024', 'A12', '600123456789', '1.2.3', '', '12,', 'Total']) expect(analizarNumero(t, 'coma'), t).toBeNull();
  });
  it('detecta el separador decimal del documento', () => {
    expect(detectarDecimal(['1,5', '2,25', '1.234,50', 'texto'])).toBe('coma');
    expect(detectarDecimal(['1.5', '2.25', '1,234.50'])).toBe('punto');
    expect(detectarDecimal(['10', '20'])).toBe('coma');
  });
});

describe('escritor de xlsx', () => {
  it('letras de columna y nombres de hoja', () => {
    expect([0, 25, 26, 27, 701, 702].map(letraDeColumna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(nombresDeHoja(['Tabla/1', 'tabla 1', 'x'.repeat(40), 'Tabla 1'])).toEqual(['Tabla 1', 'tabla 1 (2)', 'x'.repeat(31), 'Tabla 1 (3)']);
  });
  it('genera un libro con texto, números y estilos', async () => {
    const x = await crearXlsx([{ nombre: 'Datos', filas: [[{ v: 'Nombre', estilo: 'negrita' }, { v: 'Valor' }], [{ v: 'A & <B>' }, { v: 12.5 }], [null, { v: 0.25, estilo: 'porcentaje' }]], fusiones: ['A1:B1'] }]);
    const zip = await JSZip.loadAsync(x);
    const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(hoja).toContain('A &amp; &lt;B&gt;');
    expect(hoja).toContain('<c r="B2"><v>12.5</v></c>');
    expect(hoja).toContain('<mergeCell ref="A1:B1"/>');
    expect(Object.keys(zip.files)).toContain('[Content_Types].xml');
  });
  it('sin hojas es un error', async () => {
    await expect(crearXlsx([])).rejects.toThrow(/No hay datos/);
  });
});

describe('detección de tablas (páginas sintéticas)', () => {
  const columnas = [50, 150, 250];
  const fila = (y: number, a: string, b: string, c: string, extra: Partial<Fragmento> = {}) => [frag(a, columnas[0], y, extra), frag(b, columnas[1], y, extra), frag(c, columnas[2], y, extra)];

  it('separa la tabla del texto', () => {
    const f = [
      frag('Informe de ventas del trimestre', 50, 560),
      ...fila(500, 'Producto', 'Unidades', 'Precio', { negrita: true }),
      ...fila(484, 'Manzanas', '120', '1,50'),
      ...fila(468, 'Peras', '80', '2,25'),
      ...fila(452, 'Uvas', '45', '3,10'),
      frag('Fuente: departamento comercial', 50, 400),
    ];
    const r = detectarTablas(pagina(0, f));
    expect(r.tablas).toHaveLength(1);
    expect(r.tablas[0].filas).toEqual([['Producto', 'Unidades', 'Precio'], ['Manzanas', '120', '1,50'], ['Peras', '80', '2,25'], ['Uvas', '45', '3,10']]);
    expect(r.tablas[0].filasNegrita[0]).toBe(true);
    expect(r.texto).toEqual(['Informe de ventas del trimestre', 'Fuente: departamento comercial']);
  });

  it('no confunde un párrafo con una tabla', () => {
    const f = Array.from({ length: 8 }, (_, i) => frag(`Línea ${i} de un párrafo normal de texto corrido`, 50, 500 - i * 14, { ancho: 300 }));
    const r = detectarTablas(pagina(0, f));
    expect(r.tablas).toHaveLength(0);
    expect(r.texto).toHaveLength(8);
  });

  it('acepta celdas vacías y columnas con texto de varias palabras', () => {
    const f = [
      ...fila(500, 'Nombre', 'Ciudad', 'Edad', { negrita: true }),
      frag('Ana', 50, 484), frag('Santa Cruz', 150, 484), frag('31', 250, 484),
      frag('Luis', 50, 468), frag('44', 250, 468), // sin ciudad
      frag('Marta', 50, 452), frag('Buenos Aires', 150, 452), frag('29', 250, 452),
    ];
    const r = detectarTablas(pagina(0, f));
    expect(r.tablas[0].filas).toEqual([['Nombre', 'Ciudad', 'Edad'], ['Ana', 'Santa Cruz', '31'], ['Luis', '', '44'], ['Marta', 'Buenos Aires', '29']]);
  });

  it('una fila con una sola celda entre dos filas completas no corta la tabla', () => {
    const f = [...fila(500, 'A', 'B', 'C'), ...fila(484, 'a1', 'b1', 'c1'), frag('solo la primera', 50, 468), ...fila(452, 'a3', 'b3', 'c3')];
    const r = detectarTablas(pagina(0, f));
    expect(r.tablas).toHaveLength(1);
    expect(r.tablas[0].filas).toHaveLength(4);
    expect(r.tablas[0].filas[2]).toEqual(['solo la primera', '', '']);
  });

  it('una celda que abarca varias columnas se fusiona', () => {
    const f = [
      ...fila(500, 'x', 'y', 'z'),
      frag('Subtotal de la sección A completa', 50, 484, { ancho: 260 }),
      ...fila(468, 'x1', 'y1', 'z1'),
      ...fila(452, 'x2', 'y2', 'z2'),
    ];
    const r = detectarTablas(pagina(0, f));
    expect(r.tablas[0].fusiones).toEqual([[1, 0, 2]]);
    expect(r.tablas[0].filas[1]).toEqual(['Subtotal de la sección A completa', '', '']);
  });

  it('une tablas que continúan en la página siguiente y omite la cabecera repetida', async () => {
    const p1 = pagina(0, [...fila(80, 'Producto', 'Unidades', 'Precio', { negrita: true }), ...fila(64, 'a', '1', '2'), ...fila(48, 'b', '3', '4')]);
    const p2 = pagina(1, [...fila(560, 'Producto', 'Unidades', 'Precio', { negrita: true }), ...fila(544, 'c', '5', '6'), ...fila(528, 'd', '7', '8')]);
    const { datos, resumen } = await paginasAXlsx([p1, p2], OPCIONES_TABLAS_POR_DEFECTO);
    expect(resumen).toMatchObject({ tablas: 1, filas: 5 });
    const zip = await JSZip.loadAsync(datos);
    const hoja = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(hoja).toContain('<c r="A5" t="inlineStr"><is><t xml:space="preserve">d</t></is></c>');
  });

  it('sin tablas avisa y guarda el texto', async () => {
    const f = Array.from({ length: 6 }, (_, i) => frag(`Texto corrido número ${i}`, 50, 500 - i * 14, { ancho: 250 }));
    const { resumen } = await paginasAXlsx([pagina(0, f)], OPCIONES_TABLAS_POR_DEFECTO);
    expect(resumen.tablas).toBe(0);
    expect(resumen.advertencias.join(' ')).toMatch(/No se encontraron tablas/);
  });
});

describe.skipIf(!hayLibreOffice)('PDF a Excel con PDF reales de LibreOffice', () => {
  const tabla = (filas: string[][]) =>
    `<table:table table:name="T"><table:table-column table:number-columns-repeated="${filas[0].length}"/>${filas
      .map((f) => `<table:table-row>${f.map((c) => `<table:table-cell office:value-type="string"><text:p>${c}</text:p></table:table-cell>`).join('')}</table:table-row>`)
      .join('')}</table:table>`;

  it('extrae la tabla de una hoja de cálculo exportada a PDF y el libro se abre en LibreOffice', async () => {
    const fods = `<?xml version="1.0" encoding="UTF-8"?><office:document ${NS_ODF} office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>
<table:table table:name="Ventas">
<table:table-row><table:table-cell office:value-type="string"><text:p>Producto</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Unidades</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Precio</text:p></table:table-cell></table:table-row>
${[['Manzanas', '120', '1,50'], ['Peras', '80', '2,25'], ['Uvas', '45', '3,10'], ['Kiwis', '1.250', '0,95']].map((r) => `<table:table-row>${r.map((c) => `<table:table-cell office:value-type="string"><text:p>${c}</text:p></table:table-cell>`).join('')}</table:table-row>`).join('')}
</table:table></office:spreadsheet></office:body></office:document>`;
    const pdf = crearPdfDesdeOdf('ventas.fods', fods);
    const doc = await abrirDoc(pdf);
    const { datos, resumen } = await pdfAXlsx(doc, OPS_NODE, OPCIONES_TABLAS_POR_DEFECTO);
    expect(resumen.tablas).toBe(1);
    expect(resumen.filas).toBe(5);
    const csv = xlsxACsv(datos);
    expect(csv).toContain('Producto');
    expect(csv).toMatch(/Manzanas,120,1[.,]5/);
    expect(csv).toMatch(/Kiwis,1250,0[.,]95/);
  }, 240_000);

  it('un documento de texto con una tabla: la tabla va a su hoja y el texto a «Texto»', async () => {
    const fodt = `<?xml version="1.0" encoding="UTF-8"?><office:document ${NS_ODF} office:mimetype="application/vnd.oasis.opendocument.text"><office:body><office:text>
<text:p>Informe de existencias del almacén central</text:p>
<text:p>La siguiente tabla recoge las unidades disponibles.</text:p>
${tabla([['Código', 'Artículo', 'Stock'], ['A-1', 'Tornillos', '500'], ['B-2', 'Tuercas', '320'], ['C-3', 'Arandelas', '1.100']])}
<text:p>Fin del informe.</text:p>
</office:text></office:body></office:document>`;
    const doc = await abrirDoc(crearPdfDesdeOdf('informe.fodt', fodt));
    const { datos, resumen } = await pdfAXlsx(doc, OPS_NODE, OPCIONES_TABLAS_POR_DEFECTO);
    expect(resumen.tablas).toBe(1);
    const tablaCsv = xlsxACsv(datos, 1);
    expect(tablaCsv).toMatch(/Tornillos,500/);
    expect(tablaCsv).toMatch(/Arandelas,1100/);
    const textoCsv = xlsxACsv(datos, 2);
    expect(textoCsv).toContain('Informe de existencias');
    expect(textoCsv).toContain('Fin del informe.');
    expect(textoCsv).not.toContain('Tornillos');
  }, 240_000);
});
