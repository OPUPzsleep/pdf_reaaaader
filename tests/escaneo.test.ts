import { describe, expect, it } from 'vitest';
import { aplicarFiltroDatos, umbralOtsu } from '../src/lib/escaneo';

/** Imagen sintética: 80 % papel (190) con ruido leve y 20 % tinta (50). */
function papelConTinta() {
  const n = 1000;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const tinta = i % 5 === 0;
    const v = tinta ? 50 : 190 + (i % 7);
    data.set([v, v, v, 255], i * 4);
  }
  return { data, n };
}

describe('filtros de escaneo', () => {
  it('color no cambia nada', () => {
    const { data } = papelConTinta();
    const copia = data.slice();
    aplicarFiltroDatos(data, 'color');
    expect(Array.from(data)).toEqual(Array.from(copia));
  });
  it('gris iguala los canales con la luminancia', () => {
    const data = new Uint8ClampedArray([200, 100, 0, 255]);
    aplicarFiltroDatos(data, 'gris');
    expect(data[0]).toBe(data[1]);
    expect(data[1]).toBe(data[2]);
    expect(data[0]).toBe(Math.round(0.299 * 200 + 0.587 * 100));
    expect(data[3]).toBe(255);
  });
  it('blanco y negro separa papel y tinta', () => {
    const { data, n } = papelConTinta();
    aplicarFiltroDatos(data, 'bn');
    for (let i = 0; i < n; i++) expect(data[i * 4]).toBe(i % 5 === 0 ? 0 : 255);
  });
  it('documento blanquea el papel y mantiene la tinta oscura', () => {
    const { data, n } = papelConTinta();
    aplicarFiltroDatos(data, 'documento');
    const papel = data[1 * 4];
    const tinta = data[0 * 4];
    expect(papel).toBeGreaterThan(245);
    expect(tinta).toBeLessThan(40);
    expect(n).toBe(1000);
  });
  it('Otsu encuentra el valle entre dos picos', () => {
    const hist = new Array(256).fill(0);
    hist[40] = 100;
    hist[200] = 100;
    const t = umbralOtsu(hist, 200);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(200);
  });
});
