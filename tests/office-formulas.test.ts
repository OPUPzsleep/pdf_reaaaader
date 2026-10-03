import { describe, expect, it } from 'vitest';
import { desplazarFormula, ErrorExcel, Evaluador, type FuenteCeldas, type Valor } from '../src/lib/office/formulas';
import { xlsxAHtml } from '../src/lib/office/xlsx';
import { crearXlsx, fixture } from './util/ooxml';

const texto = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** Hojas de prueba: «A1» → valor, o «=…» → fórmula */
function evaluador(hojas: Record<string, Record<string, number | string | boolean>>) {
  const clave = (f: number, c: number) => {
    let col = '';
    for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
    return `${col}${f}`;
  };
  const buscar = (h: string) => Object.entries(hojas).find(([n]) => n.toLowerCase() === h.toLowerCase())?.[1];
  const fuente: FuenteCeldas = {
    valor: (h, f, c) => {
      const v = buscar(h)?.[clave(f, c)];
      return typeof v === 'string' && v.startsWith('=') ? undefined : v;
    },
    formula: (h, f, c) => {
      const v = buscar(h)?.[clave(f, c)];
      return typeof v === 'string' && v.startsWith('=') ? v.slice(1) : undefined;
    },
    existeHoja: (h) => buscar(h) !== undefined,
  };
  return new Evaluador(fuente);
}

const calcular = (formula: string, datos: Record<string, number | string | boolean> = {}): Valor => evaluador({ H: datos }).formula(formula, 'H');
const codigo = (v: Valor) => (v instanceof ErrorExcel ? v.codigo : v);

describe('Fórmulas: evaluador', () => {
  it('operadores con su precedencia, porcentaje y concatenación', () => {
    expect(calcular('1+2*3')).toBe(7);
    expect(calcular('(1+2)*3')).toBe(9);
    expect(calcular('2^3^2')).toBe(64); // en Excel «^» asocia por la izquierda: (2^3)^2
    expect(calcular('-2^2')).toBe(4); // y el signo menos va antes
    expect(calcular('50%')).toBe(0.5);
    expect(calcular('10/4')).toBe(2.5);
    expect(calcular('"a"&"b"&1')).toBe('ab1');
    expect(calcular('1<2')).toBe(true);
    expect(calcular('"a"="A"')).toBe(true);
    expect(calcular('1<>1')).toBe(false);
  });

  it('errores: división por cero, texto en operaciones y funciones desconocidas', () => {
    expect(codigo(calcular('1/0'))).toBe('#DIV/0!');
    expect(codigo(calcular('"x"+1'))).toBe('#VALUE!');
    expect(codigo(calcular('INVENTADA(1)'))).toBe('#NAME?');
    expect(codigo(calcular('SQRT(-1)'))).toBe('#NUM!');
    expect(calcular('IFERROR(1/0,"sin datos")')).toBe('sin datos');
  });

  it('referencias, rangos y funciones de agregación (inglés y español)', () => {
    const d = { A1: 10, A2: 20, A3: 30, A4: 'texto', B1: 1, B2: 2, B3: 3 };
    expect(calcular('SUM(A1:A3)', d)).toBe(60);
    expect(calcular('SUMA(A1:A4)', d)).toBe(60); // el texto de un rango se ignora
    expect(calcular('AVERAGE(A1:A3)', d)).toBe(20);
    expect(calcular('PROMEDIO(A1:A3)', d)).toBe(20);
    expect(calcular('MIN(A1:B3)', d)).toBe(1);
    expect(calcular('MAX(A1:B3)', d)).toBe(30);
    expect(calcular('COUNT(A1:A4)', d)).toBe(3);
    expect(calcular('COUNTA(A1:A4)', d)).toBe(4);
    expect(calcular('MEDIAN(A1:A3)', d)).toBe(20);
    expect(calcular('SUM(A1:A3,B1,100)', d)).toBe(161);
    expect(calcular('$A$1+B$2', d)).toBe(12);
    expect(calcular('A1*B1+A2*B2+A3*B3', d)).toBe(140);
  });

  it('condicionales y lógicas', () => {
    const d = { A1: 5, A2: 15 };
    expect(calcular('IF(A1>10,"alto","bajo")', d)).toBe('bajo');
    expect(calcular('SI(A2>10,"alto","bajo")', d)).toBe('alto');
    expect(calcular('IF(AND(A1>1,A2>1),1,0)', d)).toBe(1);
    expect(calcular('IF(OR(A1>10,A2>100),1,0)', d)).toBe(0);
    expect(calcular('NOT(A1>10)', d)).toBe(true);
    expect(calcular('IF(A1>100,1)', d)).toBe(false); // sin la rama falsa, FALSO
  });

  it('redondeos, matemáticas y texto', () => {
    expect(calcular('ROUND(2.567,2)')).toBe(2.57);
    expect(calcular('ROUND(1234,-2)')).toBe(1200);
    expect(calcular('ROUNDUP(2.121,2)')).toBe(2.13);
    expect(calcular('ROUNDDOWN(2.129,2)')).toBe(2.12);
    expect(calcular('ABS(-3)')).toBe(3);
    expect(calcular('INT(-1.5)')).toBe(-2);
    expect(calcular('MOD(10,3)')).toBe(1);
    expect(calcular('POWER(2,10)')).toBe(1024);
    expect(calcular('SQRT(16)')).toBe(4);
    expect(calcular('UPPER("hola")')).toBe('HOLA');
    expect(calcular('LEN("hola")')).toBe(4);
    expect(calcular('LEFT("abcdef",2)&RIGHT("abcdef",2)')).toBe('abef');
    expect(calcular('MID("abcdef",2,3)')).toBe('bcd');
    expect(calcular('CONCATENATE("a",1,"b")')).toBe('a1b');
    expect(calcular('TRIM("  a   b  ")')).toBe('a b');
  });

  it('SUMIF / COUNTIF con criterios de texto, comparadores y rango de suma', () => {
    const d = { A1: 'x', A2: 'y', A3: 'x', B1: 10, B2: 20, B3: 30 };
    expect(calcular('SUMIF(A1:A3,"x",B1:B3)', d)).toBe(40);
    expect(calcular('SUMAR.SI(B1:B3,">15")', d)).toBe(50);
    expect(calcular('COUNTIF(A1:A3,"x")', d)).toBe(2);
    expect(calcular('CONTAR.SI(B1:B3,"<=20")', d)).toBe(2);
  });

  it('referencias a otra hoja (con y sin comillas) y fórmulas encadenadas', () => {
    const ev = evaluador({
      Datos: { A1: 3, A2: 4 },
      'Mi hoja': { A1: 100 },
      Resumen: { A1: '=SUM(Datos!A1:A2)', A2: "='Mi hoja'!A1*2", A3: '=A1+A2', A4: '=Fantasma!A1' },
    });
    expect(ev.celda('Resumen', 1, 1)).toBe(7);
    expect(ev.celda('Resumen', 2, 1)).toBe(200);
    expect(ev.celda('Resumen', 3, 1)).toBe(207);
    expect(codigo(ev.celda('Resumen', 4, 1))).toBe('#REF!');
  });

  it('las referencias circulares no se cuelgan', () => {
    const ev = evaluador({ H: { A1: '=B1+1', B1: '=A1+1' } });
    expect(codigo(ev.celda('H', 1, 1))).toBe('#REF!');
  });

  it('desplaza las referencias relativas de las fórmulas compartidas', () => {
    expect(desplazarFormula('A2*B2', 1, 0)).toBe('A3*B3');
    expect(desplazarFormula('$A2*B$2+SUM(C2:C5)', 2, 1)).toBe('$A4*C$2+SUM(D4:D7)');
    expect(desplazarFormula('Hoja1!A1+"A1"', 1, 1)).toBe('Hoja1!A1+"A1"'); // la hoja y el texto no se tocan
  });
});

const hojaConFormulas = (filas: string) => `<sheetData>${filas}</sheetData>`;

describe('Fórmulas: dentro de la conversión de Excel', () => {
  it('calcula las fórmulas que el libro no trae calculadas (el «Total» de libro.xlsx)', async () => {
    const { html } = await xlsxAHtml(fixture('libro.xlsx'));
    const t = texto(html);
    expect(t).toContain('Total 1234812'); // =SUM(C4:C7) = 120 + 80 + 45 + 1.234.567
    expect(t).not.toContain('#NAME?');
  });

  it('usa el resultado guardado si lo hay y recalcula si el libro lo pide', async () => {
    const filas = '<row r="1"><c r="A1"><v>2</v></c><c r="B1"><v>3</v></c><c r="C1"><f>A1+B1</f><v>99</v></c></row>';
    const guardado = await crearXlsx({ hoja: hojaConFormulas(filas) });
    expect(texto((await xlsxAHtml(guardado)).html)).toContain('99');
    const recalculado = await crearXlsx({ hoja: hojaConFormulas(filas), libro: '<calcPr fullCalcOnLoad="1"/>' });
    const t = texto((await xlsxAHtml(recalculado)).html);
    expect(t).toContain(' 5 ');
    expect(t).not.toContain('99');
  });

  it('resuelve fórmulas compartidas, de varias hojas, de texto y de error', async () => {
    const hoja1 = hojaConFormulas(
      '<row r="1"><c r="A1"><v>10</v></c><c r="B1"><v>2</v></c><c r="C1"><f t="shared" ref="C1:C3" si="0">A1*B1</f></c></row>' +
        '<row r="2"><c r="A2"><v>20</v></c><c r="B2"><v>3</v></c><c r="C2"><f t="shared" si="0"/></c></row>' +
        '<row r="3"><c r="A3"><v>30</v></c><c r="B3"><v>4</v></c><c r="C3"><f t="shared" si="0"/></c></row>' +
        '<row r="4"><c r="C4"><f>SUM(C1:C3)</f></c><c r="D4"><f>IF(C4&gt;100,"mucho","poco")</f></c><c r="E4"><f>1/0</f></c><c r="F4"><f>Hoja2!A1+1</f></c></row>',
    );
    const hoja2 = hojaConFormulas('<row r="1"><c r="A1"><f>6*7</f></c></row>');
    const { html, avisos } = await xlsxAHtml(await crearXlsx({ hoja: hoja1, hojasExtra: [hoja2] }));
    const t = texto(html);
    expect(t).toContain(' 20 '); // C1
    expect(t).toContain(' 60 '); // C2
    expect(t).toContain(' 120 '); // C3
    expect(t).toContain(' 200 '); // C4 = 20+60+120
    expect(t).toContain('mucho');
    expect(t).toContain('#DIV/0!');
    expect(t).toContain(' 43 '); // F4 = (6*7)+1
    expect(t).toContain(' 42 '); // la hoja 2
    expect(avisos).toEqual([]);
  });

  it('una función no admitida conserva el resultado guardado; sin él, avisa y muestra #NAME?', async () => {
    const conCache = hojaConFormulas('<row r="1"><c r="A1"><f>FUNCION_RARA(1)</f><v>77</v></c></row>');
    const a = await xlsxAHtml(await crearXlsx({ hoja: conCache, libro: '<calcPr fullCalcOnLoad="1"/>' }));
    expect(texto(a.html)).toContain('77');
    expect(a.avisos).toEqual([]);
    const sinCache = hojaConFormulas('<row r="1"><c r="A1"><f>FUNCION_RARA(1)</f></c></row>');
    const b = await xlsxAHtml(await crearXlsx({ hoja: sinCache }));
    expect(texto(b.html)).toContain('#NAME?');
    expect(b.avisos.join(' ')).toMatch(/fórmula/);
  });

  it('un gráfico lee de las celdas de fórmula el valor calculado', async () => {
    // Sin caché: los datos del gráfico salen de las celdas, también de las que son fórmulas
    const hoja = hojaConFormulas(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="B1"><f>2*5</f></c></row>' + '<row r="2"><c r="A2" t="inlineStr"><is><t>b</t></is></c><c r="B2"><f>B1*3</f></c></row>',
    );
    const { html } = await xlsxAHtml(await crearXlsx({ hoja }));
    expect(texto(html)).toContain(' 10 ');
    expect(texto(html)).toContain(' 30 ');
  });
});
