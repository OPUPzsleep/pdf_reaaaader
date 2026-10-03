import { describe, expect, it } from 'vitest';
import { analizarDocumento, detectarCanal, esNumeroDePagina, seleccionarImagenes } from '../src/lib/epub/layout';
import { detectarIdioma, marcadorDeLista, limpiarTexto } from '../src/lib/epub/texto';
import type { Bloque, Fragmento, PaginaExtraida, RecuadroImagen } from '../src/lib/epub/tipos';

const frag = (texto: string, y: number, x = 50, tam = 11, extra: Partial<Fragmento> = {}): Fragmento => ({
  texto, x, y, ancho: texto.length * tam * 0.47, tam, negrita: false, cursiva: false, mono: false, ...extra,
});
const pagina = (indice: number, fragmentos: Fragmento[], imagenes: RecuadroImagen[] = []): PaginaExtraida => ({
  indice, ancho: 400, alto: 600, giro: 0, origenY: 0, fragmentos, imagenes,
});
const OPC = { quitarCabeceras: true, incluirImagenes: true };
const textoDe = (b: Bloque) => (b.tipo === 'h' ? b.texto : b.tipo === 'p' || b.tipo === 'li' ? b.spans.map((s) => s.texto).join('') : '[img]');

/** Texto de relleno que ocupa líneas de ancho completo (50 → 350). */
const lineaLlena = (texto: string, y: number, x = 50) => frag(texto, y, x, 11, { ancho: x === 50 ? 300 : 300 - (x - 50) });

describe('análisis de maquetación', () => {
  it('une líneas en párrafos y separa por espacio vertical', () => {
    const f = [
      lineaLlena('Primera línea del primer párrafo que continúa', 500),
      lineaLlena('segunda línea del mismo párrafo que sigue', 486),
      frag('fin del primero.', 472, 50, 11, { ancho: 120 }),
      lineaLlena('Otro párrafo distinto con su propio texto largo', 444),
      lineaLlena('y su segunda línea de texto en el mismo párrafo', 430),
      frag('y termina aquí.', 416, 50, 11, { ancho: 90 }),
    ];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    expect(bloques.map(textoDe)).toEqual([
      'Primera línea del primer párrafo que continúa segunda línea del mismo párrafo que sigue fin del primero.',
      'Otro párrafo distinto con su propio texto largo y su segunda línea de texto en el mismo párrafo y termina aquí.',
    ]);
  });

  it('resuelve los guiones de fin de línea', () => {
    const f = [
      lineaLlena('Esto es un ejem-', 500),
      lineaLlena('plo de texto con guion al final de la línea', 486),
      lineaLlena('y una tercera línea para fijar el interlineado.', 472),
    ];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    expect(textoDe(bloques[0])).toBe('Esto es un ejemplo de texto con guion al final de la línea y una tercera línea para fijar el interlineado.');
  });

  it('detecta párrafos por sangría de primera línea (sin espacio entre ellos)', () => {
    const f = [
      lineaLlena('Texto del primer párrafo que ocupa varias líneas.', 500),
      lineaLlena('Segunda línea del primer párrafo con más texto.', 486),
      lineaLlena('Tercera línea del primer párrafo y se acaba.', 472),
      lineaLlena('Empieza otro párrafo con sangría visible.', 458, 62),
      lineaLlena('Segunda línea del segundo párrafo que sigue.', 444),
      lineaLlena('Tercera línea del segundo párrafo hasta el final.', 430),
    ];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    expect(bloques).toHaveLength(2);
    expect(bloques[1].tipo === 'p' && bloques[1].sangria).toBe(true);
  });

  it('asigna niveles de título por tamaño', () => {
    const cuerpo = (y0: number) => [0, 1, 2].map((i) => lineaLlena('Texto normal del cuerpo del libro de ejemplo.', y0 - i * 14));
    const f = [
      frag('Gran título', 560, 50, 24, { ancho: 120 }),
      ...cuerpo(520),
      frag('Subtítulo', 440, 50, 16, { ancho: 80 }),
      ...cuerpo(410),
      frag('Otro subtítulo', 330, 50, 16, { ancho: 90 }),
      ...cuerpo(300),
    ];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    const titulos = bloques.filter((b): b is Extract<Bloque, { tipo: 'h' }> => b.tipo === 'h');
    expect(titulos.map((t) => [t.texto, t.nivel])).toEqual([['Gran título', 1], ['Subtítulo', 2], ['Otro subtítulo', 2]]);
  });

  it('un renglón en negrita y corto es un título menor', () => {
    const cuerpo = (y0: number) => [0, 1, 2].map((i) => lineaLlena('Texto normal del cuerpo del libro de ejemplo.', y0 - i * 14));
    const f = [...cuerpo(520), frag('Nota importante', 440, 50, 11, { negrita: true, ancho: 80 }), ...cuerpo(420)];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    expect(bloques.some((b) => b.tipo === 'h' && b.texto === 'Nota importante')).toBe(true);
  });

  it('quita cabeceras, pies y números de página repetidos', () => {
    const paginas = [0, 1, 2, 3].map((i) =>
      pagina(i, [
        frag('Mi libro — Autor', 580, 140, 9),
        ...[0, 1, 2].map((k) => lineaLlena(`Contenido de la página ${i + 1}, línea ${k + 1}, con bastante texto aquí`, 500 - k * 14)),
        frag(`${i + 1}`, 20, 195, 9, { ancho: 8 }),
      ]),
    );
    const { bloques, cabecerasQuitadas } = analizarDocumento(paginas, OPC);
    const todo = bloques.map(textoDe).join('\n');
    expect(cabecerasQuitadas).toBe(8);
    expect(todo).not.toContain('Mi libro');
    expect(todo).toContain('Contenido de la página 3');
  });

  it('conserva las cabeceras si se pide', () => {
    const paginas = [0, 1, 2].map((i) => pagina(i, [frag('Mi libro', 580, 140, 9), lineaLlena('Contenido de la página con texto suficiente.', 500)]));
    const { bloques } = analizarDocumento(paginas, { ...OPC, quitarCabeceras: false });
    expect(bloques.map(textoDe).join('|')).toContain('Mi libro');
  });

  it('reconoce números de página en distintos formatos', () => {
    for (const t of ['12', 'Página 12', 'Page 3 of 10', '- 7 -', 'iv', '3 / 20', 'pág. 5']) expect(esNumeroDePagina(t), t).toBe(true);
    for (const t of ['2020 fue un año', 'Capítulo 1', 'civil', 'hola']) expect(esNumeroDePagina(t), t).toBe(false);
  });

  it('une el párrafo que continúa en la página siguiente', () => {
    const p1 = pagina(0, [
      lineaLlena('Primera línea de la página uno con bastante texto.', 300),
      lineaLlena('Segunda línea de la página uno con bastante texto.', 286),
      lineaLlena('Esta frase se corta justo al final de la página y', 272),
    ]);
    const p2 = pagina(1, [
      lineaLlena('continúa en la página siguiente sin sangría ni nada.', 540),
      lineaLlena('Y más texto para completar el segundo párrafo aquí.', 526),
      lineaLlena('Última línea del párrafo que cruza las dos páginas.', 512),
    ]);
    const { bloques } = analizarDocumento([p1, p2], { ...OPC, quitarCabeceras: false });
    expect(bloques).toHaveLength(1);
    expect(textoDe(bloques[0])).toContain('al final de la página y continúa en la página siguiente');
  });

  it('detecta listas con viñetas y numeradas', () => {
    const f = [
      lineaLlena('Texto de introducción de la lista con suficiente longitud.', 500),
      lineaLlena('Más texto de introducción para fijar el cuerpo del texto.', 486),
      frag('• Primer elemento', 460, 70, 11, { ancho: 90 }),
      frag('• Segundo elemento', 446, 70, 11, { ancho: 95 }),
      frag('1. Paso uno', 420, 70, 11, { ancho: 60 }),
      frag('2. Paso dos', 406, 70, 11, { ancho: 60 }),
    ];
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    const items = bloques.filter((b): b is Extract<Bloque, { tipo: 'li' }> => b.tipo === 'li');
    expect(items.map((i) => [textoDe(i), i.ordenado])).toEqual([
      ['Primer elemento', false], ['Segundo elemento', false], ['Paso uno', true], ['Paso dos', true],
    ]);
  });

  it('lee dos columnas de arriba abajo, primero la izquierda', () => {
    const f: Fragmento[] = [];
    // Título a ancho completo y dos columnas de 8 líneas (cada columna es un párrafo)
    f.push(frag('Título a ancho completo de la página', 560, 50, 11, { ancho: 280 }));
    for (let i = 0; i < 8; i++) {
      f.push(frag(`izquierda ${i + 1} texto de la columna${i === 7 ? '.' : ''}`, 520 - i * 14, 40, 11, { ancho: 150 }));
      f.push(frag(`derecha ${i + 1} texto de la columna`, 520 - i * 14, 215, 11, { ancho: 150 }));
    }
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    const textos = bloques.map(textoDe);
    expect(textos).toHaveLength(3);
    expect(textos[1]).toMatch(/^izquierda 1 .* izquierda 8 texto de la columna\.$/);
    expect(textos[2]).toMatch(/^derecha 1 .* derecha 8 texto de la columna$/);
    expect(textos[1]).not.toContain('derecha');
  });

  it('une la frase que pasa de la columna izquierda a la derecha', () => {
    const f: Fragmento[] = [];
    for (let i = 0; i < 8; i++) {
      f.push(frag(`izquierda ${i + 1} texto de la columna`, 520 - i * 14, 40, 11, { ancho: 150 }));
      f.push(frag(`derecha ${i + 1} texto de la columna${i === 7 ? '.' : ''}`, 520 - i * 14, 215, 11, { ancho: 150 }));
    }
    const { bloques } = analizarDocumento([pagina(0, f)], OPC);
    expect(bloques).toHaveLength(1);
  });

  it('no inventa columnas en texto de una sola columna', () => {
    const f = Array.from({ length: 12 }, (_, i) => lineaLlena(`Línea ${i} de un texto normal que ocupa todo el ancho`, 500 - i * 14));
    expect(detectarCanal(f.map((fr) => ({ y: fr.y, tam: fr.tam, frags: [fr] })), 400)).toBeNull();
  });

  it('descarta imágenes repetidas, diminutas o de fondo', () => {
    const logo: RecuadroImagen = { clave: 'logo', x: 10, y: 560, ancho: 60, alto: 30 };
    const figura = (k: string): RecuadroImagen => ({ clave: k, x: 50, y: 200, ancho: 200, alto: 150 });
    const icono: RecuadroImagen = { clave: 'ico', x: 50, y: 100, ancho: 10, alto: 10 };
    const fondo: RecuadroImagen = { clave: 'bg', x: 0, y: 0, ancho: 400, alto: 600 };
    const paginas = [0, 1, 2, 3].map((i) => pagina(i, [lineaLlena('texto', 400)], i === 1 ? [logo, figura('fig1'), icono, fondo] : [logo]));
    const r = seleccionarImagenes(paginas);
    expect(r[1].map((x) => x.clave)).toEqual(['fig1']);
    expect(r[0]).toEqual([]);
  });

  it('una página escaneada (solo imagen) conserva su imagen', () => {
    const escaneo: RecuadroImagen = { clave: 'scan', x: 0, y: 0, ancho: 400, alto: 600 };
    const r = seleccionarImagenes([pagina(0, [], [escaneo])]);
    expect(r[0]).toHaveLength(1);
  });
});

describe('utilidades de texto', () => {
  it('limpia ligaduras, guiones blandos y caracteres inválidos', () => {
    expect(limpiarTexto('oﬃcina e­jemplo \u0001x\u0000')).toBe('officina ejemplo x');
  });
  it('detecta marcadores de lista', () => {
    expect(marcadorDeLista('• uno')).toEqual({ ordenado: false, longitud: 2 });
    expect(marcadorDeLista('1. uno')?.ordenado).toBe(true);
    expect(marcadorDeLista('a) uno')?.ordenado).toBe(true);
    expect(marcadorDeLista('2020 fue un año')).toBeNull();
    expect(marcadorDeLista('Hola mundo')).toBeNull();
  });
  it('detecta el idioma', () => {
    const es = 'El perro de la casa que está en el jardín y la gata de los vecinos se fueron por la calle con un amigo para ver a su madre en el pueblo ' .repeat(4);
    const en = 'The dog of the house that is in the garden and the cat of the neighbours went to the street with a friend for it was the one that he had ' .repeat(4);
    expect(detectarIdioma(es)).toBe('es');
    expect(detectarIdioma(en)).toBe('en');
    expect(detectarIdioma('poco texto')).toBeNull();
  });
});
