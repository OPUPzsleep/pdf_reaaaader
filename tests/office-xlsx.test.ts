import { describe, expect, it } from 'vitest';
import { xlsxAHtml } from '../src/lib/office/xlsx';
import { crearXlsx, ESTILOS_XLSX_BASICOS, fixture } from './util/ooxml';

const texto = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const fila = (n: number, celdas: string, extra = '') => `<row r="${n}"${extra}>${celdas}</row>`;

describe('Excel → HTML: libro real (openpyxl)', () => {
  it('formatos de número, fechas, combinaciones, estilos y hojas', async () => {
    const { html, unidades, avisos } = await xlsxAHtml(fixture('libro.xlsx'));
    const t = texto(html);
    expect(unidades).toBe(4);
    expect(avisos).toEqual([]);
    expect(t).toContain('Informe de ventas 2024');
    expect(html).toMatch(/<td class="x\d+" colspan="5"/); // A1:E1 combinada
    expect(t).toContain('15/01/2024'); // dd/mm/yyyy
    expect(t).toContain('1.234.567'); // #,##0
    expect(t).toContain('1,50 €'); // #,##0.00 "€" con coma decimal
    expect(t).toContain('13,00 €');
    expect(t).toContain('25,5%'); // 0.0%
    expect(t).toContain('Uvas rojas de mesa sin pepitas');
    // estilos de celda: relleno de la cabecera y texto en cursiva gris
    expect(html).toMatch(/\.x\d+\{[^}]*background:#1f3864/);
    expect(html).toMatch(/\.x\d+\{[^}]*font-style:italic/);
    // booleanos y negativos en rojo con el formato [Red]
    expect(t).toContain('VERDADERO');
    expect(t).toContain('FALSO');
    expect(t).toContain('-230,25');
    expect(html).toMatch(/style="[^"]*color:#ff0000[^"]*">-230,25/);
    // el texto largo sin ajuste invade las celdas vacías (colspan) y el texto con ajuste se parte
    expect(html).toMatch(/colspan="\d+"[^>]*>Notas con texto largo/);
    expect(html).toMatch(/white-space:pre-wrap[^}]*\}/);
  });

  it('una página por hoja y las hojas muy anchas se reparten en bandas de columnas', async () => {
    const { html } = await xlsxAHtml(fixture('libro.xlsx'));
    expect(html.match(/<section style="page:h\d+"/g)).toHaveLength(4);
    const ancha = html.split('<section style="page:h3"')[1].split('<section style="page:h4"')[0];
    const bandas = (ancha.match(/<table/g) ?? []).length;
    expect(bandas).toBeGreaterThanOrEqual(2); // 24 columnas no caben a un tamaño legible → varias bandas
    expect(bandas).toBeLessThanOrEqual(3);
    expect(ancha).toContain('break-before:page');
    expect(html).toMatch(/@page h3\{size:841\.89pt 595\.28pt|@page h3\{size:842\.\d+pt 595\.\d+pt/); // horizontal
  });
});

describe('Excel → HTML: casos concretos', () => {
  it('cadenas compartidas, texto enriquecido, inline, booleanos y errores', async () => {
    const x = await crearXlsx({
      compartidas: ['Hola', '<r><t>Rico </t></r><r><rPr><b/></rPr><t>texto</t></r>'],
      hoja: `<sheetData>${fila(1, '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>en línea</t></is></c><c r="D1" t="b"><v>1</v></c><c r="E1" t="e"><v>#DIV/0!</v></c><c r="F1" t="str"><v>fórmula</v></c>')}</sheetData>`,
    });
    const { html } = await xlsxAHtml(x);
    const t = texto(html);
    for (const s of ['Hola', 'Rico texto', 'en línea', 'VERDADERO', '#DIV/0!', 'fórmula']) expect(t).toContain(s);
  });

  it('idioma de los números y sistema de fechas 1904', async () => {
    const x = await crearXlsx({
      estilos: ESTILOS_XLSX_BASICOS,
      libro: '<workbookPr date1904="1"/>',
      hoja: `<sheetData>${fila(1, '<c r="A1" s="1"><v>0</v></c><c r="B1" s="3"><v>1234.5</v></c>')}</sheetData>`,
    });
    expect(texto((await xlsxAHtml(x)).html)).toContain('01/01/1904');
    const sin1904 = await crearXlsx({ estilos: ESTILOS_XLSX_BASICOS, hoja: `<sheetData>${fila(1, '<c r="A1" s="3"><v>1234.5</v></c>')}</sheetData>` });
    expect(texto((await xlsxAHtml(sin1904)).html)).toContain('1.234,50 €');
    expect(texto((await xlsxAHtml(sin1904, { idioma: 'en' })).html)).toContain('1,234.50 €');
  });

  it('filas y columnas ocultas no se imprimen y los anchos se respetan', async () => {
    const x = await crearXlsx({
      hoja: `<cols><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="9" hidden="1"/></cols><sheetData>${fila(1, '<c r="A1" t="inlineStr"><is><t>visible</t></is></c><c r="B1" t="inlineStr"><is><t>ancha</t></is></c><c r="C1" t="inlineStr"><is><t>columna oculta</t></is></c>')}${fila(2, '<c r="A2" t="inlineStr"><is><t>fila oculta</t></is></c>', ' hidden="1"')}${fila(3, '<c r="A3" t="inlineStr"><is><t>otra fila</t></is></c>', ' ht="30" customHeight="1"')}</sheetData>`,
    });
    const { html } = await xlsxAHtml(x);
    expect(html).not.toContain('columna oculta');
    expect(html).not.toContain('fila oculta');
    expect(html).toContain('otra fila');
    expect(html).toContain('<col style="width:145px">'); // 20 caracteres → 145 px
    expect(html).toContain('height:30pt');
  });

  it('combinaciones con filas y columnas', async () => {
    const x = await crearXlsx({
      hoja: `<sheetData>${fila(1, '<c r="A1" t="inlineStr"><is><t>M</t></is></c><c r="C1" t="inlineStr"><is><t>x</t></is></c>')}${fila(2, '<c r="C2" t="inlineStr"><is><t>y</t></is></c>')}</sheetData><mergeCells count="1"><mergeCell ref="A1:B2"/></mergeCells>`,
    });
    const { html } = await xlsxAHtml(x);
    expect(html).toMatch(/<td[^>]*colspan="2"[^>]*rowspan="2"[^>]*>M<\/td>|<td[^>]*rowspan="2"[^>]*colspan="2"[^>]*>M<\/td>/);
    expect((html.match(/<td/g) ?? []).length).toBe(3);
  });

  it('el área de impresión limita el contenido', async () => {
    const x = await crearXlsx({
      libro: '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Hoja1!$A$1:$B$2</definedName></definedNames>',
      hoja: `<sheetData>${fila(1, '<c r="A1" t="inlineStr"><is><t>dentro</t></is></c><c r="D1" t="inlineStr"><is><t>fuera</t></is></c>')}${fila(5, '<c r="A5" t="inlineStr"><is><t>abajo</t></is></c>')}</sheetData>`,
    });
    const { html } = await xlsxAHtml(x);
    expect(html).toContain('dentro');
    expect(html).not.toContain('fuera');
    expect(html).not.toContain('abajo');
  });

  it('escapa el contenido y las hojas vacías dan error claro', async () => {
    const x = await crearXlsx({ hoja: `<sheetData>${fila(1, '<c r="A1" t="inlineStr"><is><t>&lt;img src=x onerror=alert(1)&gt;</t></is></c>')}</sheetData>` });
    const { html } = await xlsxAHtml(x);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x');
    await expect(xlsxAHtml(await crearXlsx({ hoja: '<sheetData/>' }))).rejects.toThrow(/no tiene hojas con datos/);
  });

  it('limita las hojas enormes y lo avisa', async () => {
    const filas = Array.from({ length: 10050 }, (_, i) => fila(i + 1, `<c r="A${i + 1}" t="inlineStr"><is><t>f${i + 1}</t></is></c>`)).join('');
    const { html, avisos } = await xlsxAHtml(await crearXlsx({ hoja: `<sheetData>${filas}</sheetData>` }));
    expect(avisos.join(' ')).toMatch(/más de 10000 filas/);
    expect(html).toContain('f10000');
    expect(html).not.toContain('f10001');
  });

  it('un archivo que no es xlsx da un error claro', async () => {
    await expect(xlsxAHtml(new Uint8Array([1, 2, 3]))).rejects.toThrow(/no parece un documento de Office/);
  });
});
