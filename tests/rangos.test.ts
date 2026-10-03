import { describe, expect, it } from 'vitest';
import { formatearPaginas, parsearGrupos, parsearPaginas } from '../src/lib/pdf/rangos';

describe('rangos', () => {
  it('interpreta números, rangos y abiertos', () => {
    expect(parsearPaginas('1-3, 5', 10)).toEqual([0, 1, 2, 4]);
    expect(parsearPaginas('8-', 10)).toEqual([7, 8, 9]);
    expect(parsearPaginas('-2', 10)).toEqual([0, 1]);
    expect(parsearPaginas('3 1 3', 10)).toEqual([0, 2]);
  });
  it('mantiene los grupos para dividir', () => {
    expect(parsearGrupos('1-2, 4, 6-7', 7)).toEqual([[0, 1], [3], [5, 6]]);
  });
  it('rechaza entradas inválidas con mensajes en español', () => {
    expect(() => parsearPaginas('', 5)).toThrow(/al menos un rango/);
    expect(() => parsearPaginas('abc', 5)).toThrow(/No entiendo/);
    expect(() => parsearPaginas('9', 5)).toThrow(/no existe/);
    expect(() => parsearPaginas('4-2', 5)).toThrow(/al revés/);
    expect(() => parsearPaginas('0', 5)).toThrow(/empiezan en 1/);
  });
  it('formatea de forma compacta', () => {
    expect(formatearPaginas([0, 1, 2, 4, 9, 8])).toBe('1-3, 5, 9-10');
    expect(formatearPaginas([])).toBe('');
  });
});
