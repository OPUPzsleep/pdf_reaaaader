import { describe, expect, it } from 'vitest';
import { esFormatoFecha, formatearValor, FORMATOS_INTEGRADOS, type OpcionesFormato } from '../src/lib/office/xlsxFormato';

const es: OpcionesFormato = { fechas1904: false, idioma: 'es' };
const en: OpcionesFormato = { fechas1904: false, idioma: 'en' };
const f = (v: number | string, codigo: string, o = es) => formatearValor(v, codigo, o);

describe('formatos numéricos de Excel', () => {
  it('General', () => {
    expect(f(1234.5, 'General')).toBe('1234,5');
    expect(f(0.1 + 0.2, 'General')).toBe('0,3');
    expect(f(42, 'General')).toBe('42');
    expect(f(-7.25, 'General', en)).toBe('-7.25');
    expect(f(1e12, 'General')).toBe('1E+12');
    expect(f(0, 'General')).toBe('0');
  });

  it('decimales, miles y relleno con ceros', () => {
    expect(f(3.14159, '0.00')).toBe('3,14');
    expect(f(1234567, '#,##0')).toBe('1.234.567');
    expect(f(1234.5, '#,##0.00')).toBe('1.234,50');
    expect(f(1234.5, '#,##0.00', en)).toBe('1,234.50');
    expect(f(7, '000')).toBe('007');
    expect(f(2.5, '0.0#')).toBe('2,5');
    expect(f(2.567, '0.0#')).toBe('2,57');
    expect(f(0.5, '0')).toBe('1');
    expect(f(2.675, '0.00')).toBe('2,68');
  });

  it('porcentajes y notación científica', () => {
    expect(f(0.256, '0%')).toBe('26%');
    expect(f(0.256, '0.0%')).toBe('25,6%');
    expect(f(1, '0%')).toBe('100%');
    expect(f(12345, '0.00E+00')).toBe('1,23E+04');
  });

  it('literales, monedas y signo', () => {
    expect(f(1500, '#,##0 "€"')).toBe('1.500 €');
    expect(f(1234.5, '[$€-407] #,##0.00')).toBe('€ 1.234,50');
    expect(f(1234.5, '"$"#,##0.00', en)).toBe('$1,234.50');
    expect(f(-2.5, '0.00')).toBe('-2,50');
    expect(f(-1234, '#,##0;(#,##0)')).toBe('(1.234)');
    expect(f(1234, '#,##0;(#,##0)')).toBe('1.234');
    expect(f(0, '0;-0;"cero"')).toBe('cero');
    expect(f(5000, '#,##0.0,')).toBe('5,0');
    expect(f(1234567, '0.0,,"M"')).toBe('1,2M');
  });

  it('texto y fracciones', () => {
    expect(f('hola', '@')).toBe('hola');
    expect(f('hola', '"Cliente: "@')).toBe('Cliente: hola');
    expect(f('hola', 'General')).toBe('hola');
    expect(f(1.5, '# ?/?')).toBe('1 1/2');
  });

  it('formatos integrados', () => {
    expect(f(0.1234, FORMATOS_INTEGRADOS[10])).toBe('12,34%');
    expect(f(1234.5, FORMATOS_INTEGRADOS[4])).toBe('1.234,50');
  });
});

describe('fechas y horas', () => {
  it('fechas', () => {
    expect(f(45000, 'dd/mm/yyyy')).toBe('15/03/2023');
    expect(f(45000, 'd-mmm-yy')).toBe('15-mar-23');
    expect(f(45000, 'mmmm yyyy')).toBe('marzo 2023');
    expect(f(45000, 'dddd')).toBe('miércoles');
    expect(f(45000, 'dddd, d mmmm yyyy', en)).toBe('Wednesday, 15 March 2023');
    expect(f(1, 'dd/mm/yyyy')).toBe('01/01/1900');
    expect(f(61, 'dd/mm/yyyy')).toBe('01/03/1900');
    expect(f(60, 'dd/mm/yyyy')).toBe('29/02/1900');
    expect(f(0, 'dd/mm/yyyy', { fechas1904: true, idioma: 'es' as const })).toBe('01/01/1904');
  });

  it('horas, minutos y mes en el mismo código', () => {
    expect(f(0.75, 'h:mm AM/PM')).toBe('6:00 PM');
    expect(f(0.5, 'hh:mm:ss')).toBe('12:00:00');
    expect(f(1.5, '[h]:mm')).toBe('36:00');
    expect(f(45000.5625, 'dd/mm/yyyy hh:mm')).toBe('15/03/2023 13:30');
    expect(f(45000.5625, 'm/d/yyyy h:mm', en)).toBe('3/15/2023 13:30');
    expect(f(0.00069444, 'mm:ss')).toBe('01:00');
  });

  it('reconoce los formatos de fecha', () => {
    expect(esFormatoFecha('dd/mm/yyyy')).toBe(true);
    expect(esFormatoFecha('h:mm')).toBe(true);
    expect(esFormatoFecha('#,##0.00')).toBe(false);
    expect(esFormatoFecha('General')).toBe(false);
    expect(esFormatoFecha('"día" 0')).toBe(false);
  });
});
