import { describe, expect, it } from 'vitest';
import { NUMEROS_POR_DEFECTO, numerarPaginas, textoDeNumero, ubicarTexto } from '../src/lib/pdf/numeros';
import { crearPdf, elementosDePagina, textosPorPagina } from './util/pdfs';

describe('números de página', () => {
  it('formatos de texto', () => {
    expect(textoDeNumero('n', 3, 10)).toBe('3');
    expect(textoDeNumero('Página n de N', 3, 10)).toBe('Página 3 de 10');
    expect(textoDeNumero('n / N', 3, 10)).toBe('3 / 10');
    expect(textoDeNumero('- n -', 3, 10)).toBe('- 3 -');
  });

  it('numera todas las páginas', async () => {
    const r = await numerarPaginas(await crearPdf(3), { ...NUMEROS_POR_DEFECTO, formato: 'Página n de N' });
    const t = await textosPorPagina(r);
    expect(t[0]).toContain('Página 1 de 3');
    expect(t[2]).toContain('Página 3 de 3');
  });

  it('respeta el rango y el número inicial', async () => {
    const r = await numerarPaginas(await crearPdf(5), { ...NUMEROS_POR_DEFECTO, rango: '2-4', inicio: 10 });
    const t = await textosPorPagina(r);
    expect(t[0]).toBe('Página 1');
    expect(t[1]).toContain('10');
    expect(t[2]).toContain('11');
    expect(t[3]).toContain('12');
    expect(t[4]).toBe('Página 5');
  });

  it('coloca el número en la esquina elegida', async () => {
    const r = await numerarPaginas(await crearPdf(1), { ...NUMEROS_POR_DEFECTO, posicion: 'sup-der', margen: 20 });
    const els = await elementosDePagina(r, 1);
    const n = els.find((e) => e.texto === '1')!;
    expect(n.x).toBeGreaterThan(200); // derecha de 300
    expect(n.y).toBeGreaterThan(300); // arriba de 400
  });

  it('en páginas giradas el número queda en la esquina visual', () => {
    // Página 300x400 girada 90°: visualmente es 400x300; "inf-der" visual = (400-m-ancho, m)
    const p = ubicarTexto(300, 400, 90, 'inf-der', 10, 10, 20);
    // x = w - vy = 300 - 20; y = vx = 400-20-10 = 370
    expect(p).toEqual({ x: 280, y: 370, angulo: 90 });
    const q = ubicarTexto(300, 400, 180, 'inf-izq', 10, 10, 20);
    expect(q).toEqual({ x: 280, y: 380, angulo: 180 });
    const s = ubicarTexto(300, 400, 270, 'sup-izq', 10, 10, 20);
    expect(s.angulo).toBe(270);
  });
});
