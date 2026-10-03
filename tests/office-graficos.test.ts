import { describe, expect, it } from 'vitest';
import { docxAHtml } from '../src/lib/office/docx';
import { completarCaches, graficoASvg } from '../src/lib/office/grafico';
import { leerTema } from '../src/lib/office/comun';
import { pptxAHtml } from '../src/lib/office/pptx';
import { xlsxAHtml } from '../src/lib/office/xlsx';
import { parsearXml } from '../src/lib/office/xml';
import { crearDocx, fixture } from './util/ooxml';

const tema = leerTema(null);
const NS = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const cache = (valores: (string | number)[], num = false) =>
  `<c:${num ? 'numCache' : 'strCache'}>${num ? '<c:formatCode>General</c:formatCode>' : ''}<c:ptCount val="${valores.length}"/>${valores.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:${num ? 'numCache' : 'strCache'}>`;

function serie(i: number, nombre: string, cats: string[], vals: number[], extra = '') {
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Hoja1!$${'BCD'[i]}$1</c:f>${cache([nombre])}</c:strRef></c:tx>${extra}<c:cat><c:strRef><c:f>Hoja1!$A$2:$A$4</c:f>${cache(cats)}</c:strRef></c:cat><c:val><c:numRef><c:f>Hoja1!$${'BCD'[i]}$2:$${'BCD'[i]}$4</c:f>${cache(vals, true)}</c:numRef></c:val></c:ser>`;
}

const grafico = (tipo: string, cuerpo: string, extra = '', titulo = '', leyenda = '<c:legend><c:legendPos val="b"/></c:legend>') =>
  parsearXml(`<c:chartSpace ${NS}><c:chart>${titulo ? `<c:title><c:tx><c:rich><a:p><a:r><a:t>${titulo}</a:t></a:r></a:p></c:rich></c:tx></c:title>` : '<c:autoTitleDeleted val="1"/>'}<c:plotArea><c:${tipo}>${cuerpo}</c:${tipo}><c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/><c:majorGridlines/></c:valAx></c:plotArea>${leyenda}</c:chart>${extra}</c:chartSpace>`);

const rects = (svg: string) => [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-f]{6})"\/>/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], color: m[5] }));
const textos = (svg: string) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe('gráficos → SVG', () => {
  const cats = ['Ene', 'Feb', 'Mar'];

  it('columnas agrupadas: una barra por dato con la altura proporcional, ejes, título y leyenda', () => {
    const x = grafico('barChart', `<c:barDir val="col"/><c:grouping val="clustered"/>${serie(0, 'Ventas', cats, [10, 20, 40])}${serie(1, 'Gastos', cats, [5, 15, 25])}<c:gapWidth val="100"/>`, '', 'Ventas y gastos');
    const { svg, aviso } = graficoASvg(x, 400, 250, tema);
    expect(aviso).toBeUndefined();
    const t = textos(svg);
    expect(t).toContain('Ventas y gastos');
    for (const s of ['Ene', 'Feb', 'Mar', 'Ventas', 'Gastos']) expect(t).toContain(s);
    // eje de valores 0…40 con paso 5 o 10 y rejilla
    expect(t).toContain('0');
    expect(t).toContain('40');
    expect(svg).toContain('stroke="#d9d9d9"');
    const azules = rects(svg).filter((r) => r.color === '#4472c4' && r.w !== r.h && r.x > 10); // sin el cuadradito de la leyenda
    expect(azules).toHaveLength(3);
    // la barra de 40 mide el doble que la de 20
    const alturas = azules.map((r) => r.h).sort((a, b) => a - b);
    expect(alturas[2] / alturas[1]).toBeCloseTo(2, 1);
    expect(alturas[1] / alturas[0]).toBeCloseTo(2, 1);
    // las dos series con colores distintos
    expect(new Set(rects(svg).map((r) => r.color)).size).toBeGreaterThanOrEqual(2);
  });

  it('barras horizontales, apiladas y al 100 %', () => {
    const h = graficoASvg(grafico('barChart', `<c:barDir val="bar"/><c:grouping val="clustered"/>${serie(0, 'A', cats, [10, 20, 30])}`), 400, 250, tema).svg;
    const barrasH = rects(h).filter((r) => r.color === '#4472c4' && r.w !== r.h && r.x > 20);
    expect(barrasH).toHaveLength(3);
    expect(new Set(barrasH.map((r) => r.h)).size).toBe(1); // misma altura, distinta longitud
    expect(new Set(barrasH.map((r) => r.w)).size).toBe(3);

    const apiladas = graficoASvg(grafico('barChart', `<c:barDir val="col"/><c:grouping val="stacked"/>${serie(0, 'A', cats, [10, 10, 10])}${serie(1, 'B', cats, [20, 20, 20])}`), 400, 250, tema).svg;
    const a = rects(apiladas).filter((r) => r.color === '#4472c4' && r.w !== r.h && r.x > 20);
    const b = rects(apiladas).filter((r) => r.color === '#ed7d31' && r.w !== r.h && r.x > 20);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    // B está justo encima de A (misma columna)
    expect(b[0].x).toBeCloseTo(a[0].x, 1);
    expect(b[0].y + b[0].h).toBeCloseTo(a[0].y, 1);
    expect(b[0].h / a[0].h).toBeCloseTo(2, 1);

    const pct = textos(graficoASvg(grafico('barChart', `<c:barDir val="col"/><c:grouping val="percentStacked"/>${serie(0, 'A', cats, [1, 1, 1])}${serie(1, 'B', cats, [3, 3, 3])}`), 400, 250, tema).svg);
    expect(pct).toContain('100%');
  });

  it('líneas con marcadores, áreas y dispersión', () => {
    const l = graficoASvg(grafico('lineChart', `<c:grouping val="standard"/>${serie(0, 'A', cats, [10, 30, 20], '<c:marker><c:symbol val="circle"/></c:marker>')}`), 400, 250, tema).svg;
    expect(l).toMatch(/<path d="M[\d. ]+L[\d. ]+L[\d. ]+" fill="none" stroke="#4472c4"/);
    expect((l.match(/<circle /g) ?? []).length).toBe(3);
    const area = graficoASvg(grafico('areaChart', `<c:grouping val="standard"/>${serie(0, 'A', cats, [10, 30, 20])}`), 400, 250, tema).svg;
    expect(area).toMatch(/<path d="M[^"]*Z" fill="#4472c4" fill-opacity="0.75"/);
    const disp = graficoASvg(
      parsearXml(`<c:chartSpace ${NS}><c:chart><c:plotArea><c:scatterChart><c:scatterStyle val="lineMarker"/><c:ser><c:idx val="0"/><c:order val="0"/><c:xVal><c:numRef><c:f>x</c:f>${cache([1, 2, 3], true)}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>y</c:f>${cache([5, 15, 10], true)}</c:numRef></c:yVal></c:ser></c:scatterChart><c:valAx><c:axId val="1"/></c:valAx><c:valAx><c:axId val="2"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`),
      300, 200, tema,
    ).svg;
    expect((disp.match(/<circle /g) ?? []).length).toBe(3);
  });

  it('sectores: un trozo por categoría, porcentajes en las etiquetas y leyenda con las categorías', () => {
    const x = grafico('pieChart', `<c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>x</c:f>${cache(['Cuota'])}</c:strRef></c:tx><c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/></c:dLbls><c:cat><c:strRef><c:f>x</c:f>${cache(['A', 'B', 'C'])}</c:strRef></c:cat><c:val><c:numRef><c:f>y</c:f>${cache([50, 30, 20], true)}</c:numRef></c:val></c:ser>`, '', '', '<c:legend><c:legendPos val="r"/></c:legend>');
    const { svg } = graficoASvg(x, 400, 250, tema);
    expect((svg.match(/<path d="M[\d. ]+L[\d. ]+A/g) ?? []).length).toBe(3);
    const t = textos(svg);
    expect(t).toEqual(expect.arrayContaining(['A', 'B', 'C', '50%', '30%', '20%']));
  });

  it('formato numérico del eje y etiquetas de datos', () => {
    const x = grafico('barChart', `<c:barDir val="col"/><c:grouping val="clustered"/>${serie(0, 'A', cats, [1000, 2500, 4000]).replace('</c:ser>', '<c:dLbls><c:numFmt formatCode="#,##0 &quot;€&quot;" sourceLinked="0"/><c:showVal val="1"/></c:dLbls></c:ser>')}`);
    const t = textos(graficoASvg(x, 400, 250, tema).svg);
    expect(t).toContain('2.500 €');
    expect(t).toContain('4.000 €');
  });

  it('un tipo no admitido (radar) se avisa con un recuadro', () => {
    const x = parsearXml(`<c:chartSpace ${NS}><c:chart><c:plotArea><c:radarChart><c:ser/></c:radarChart></c:plotArea></c:chart></c:chartSpace>`);
    const r = graficoASvg(x, 300, 200, tema);
    expect(r.aviso).toMatch(/radar/);
    expect(r.svg).toContain('no admitido');
  });

  it('los datos sin caché se completan desde las celdas', () => {
    const x = parsearXml(`<c:chartSpace ${NS}><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Datos!$B$1</c:f></c:strRef></c:tx><c:cat><c:strRef><c:f>Datos!$A$2:$A$3</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>Datos!$B$2:$B$3</c:f></c:numRef></c:val></c:ser></c:barChart><c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`);
    const sin = graficoASvg(x, 300, 200, tema);
    expect(textos(sin.svg)).not.toContain('Norte');
    const hoja: Record<string, string[]> = { 'Datos!$B$1': ['Total'], 'Datos!$A$2:$A$3': ['Norte', 'Sur'], 'Datos!$B$2:$B$3': ['7', '9'] };
    completarCaches(x, (f) => hoja[f] ?? null);
    const t = textos(graficoASvg(x, 300, 200, tema).svg);
    expect(t).toEqual(expect.arrayContaining(['Norte', 'Sur', '0', '10']));
  });

  it('el texto se reduce si el gráfico es pequeño y se respeta el tamaño declarado', () => {
    const x = grafico('barChart', `<c:barDir val="col"/><c:grouping val="clustered"/>${serie(0, 'A', cats, [1, 2, 3])}`, '<c:txPr><a:p><a:pPr><a:defRPr sz="1400"/></a:pPr></a:p></c:txPr>');
    expect(graficoASvg(x, 600, 400, tema).svg).toContain('font-size="14"');
    expect(graficoASvg(x, 120, 80, tema).svg).toMatch(/font-size="(6|7|8)(\.\d+)?"/);
    expect(graficoASvg(grafico('barChart', `<c:barDir val="col"/><c:grouping val="clustered"/>${serie(0, 'A', cats, [1, 2, 3])}`), 800, 500, tema, undefined, { tamBase: 18 }).svg).toContain('font-size="18"');
  });
});

describe('gráficos dentro de los documentos', () => {
  it('Excel: tres gráficos de openpyxl (sin datos en caché) con sus títulos y series', async () => {
    const { html, avisos } = await xlsxAHtml(fixture('libro.xlsx'));
    expect(avisos).toEqual([]);
    expect((html.match(/<svg /g) ?? []).length).toBe(3);
    for (const t of ['Ventas y gastos', 'Tendencia', 'Reparto']) expect(html).toContain(`>${t}</text>`);
    expect(html).toContain('>Ene</text>');
    // openpyxl no guarda los datos en el gráfico: se leen de las celdas (nombres de serie, categorías y valores)
    expect(html).toContain('>Ventas</text>');
    expect(html).toContain('>Gastos</text>');
    expect(html).toContain('>May</text>');
  });

  it('PowerPoint: gráficos de python-pptx con series, categorías, título y porcentajes', async () => {
    const { html, avisos } = await pptxAHtml(fixture('presentacion.pptx'));
    expect(avisos).toEqual([]);
    for (const t of ['Ventas por zona', 'Cuota', '2023', '2024', 'Norte', 'Oeste', 'A', 'B', 'C']) expect(html).toContain(`>${t}</text>`);
    expect(html).toMatch(/>\d+%<\/text>|>\d+; \d+%<\/text>/);
  });

  it('Word: un gráfico en línea con sus datos incrustados', async () => {
    const chart = `<?xml version="1.0"?><c:chartSpace ${NS}><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Gráfico en Word</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>${serie(0, 'Datos', ['a', 'b', 'c'], [3, 5, 4])}</c:barChart><c:catAx><c:axId val="1"/></c:catAx><c:valAx><c:axId val="2"/></c:valAx></c:plotArea></c:chart></c:chartSpace>`;
    const cuerpo = `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="4572000" cy="2743200"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rIdG"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    const d = await crearDocx({
      cuerpo,
      rels: ['<Relationship Id="rIdG" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml"/>'],
      extras: { 'word/charts/chart1.xml': chart },
    });
    const { html, avisos } = await docxAHtml(d);
    expect(avisos).toEqual([]);
    expect(html).toMatch(/<svg [^>]*viewBox="0 0 360 216"/);
    expect(html).toContain('>Gráfico en Word</text>');
    expect(html).toContain('>b</text>');
  });
});
