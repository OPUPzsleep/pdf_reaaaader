import { describe, expect, it } from 'vitest';
import { descendiente, descendientes, hijo, hijos, parsearXml, ruta, textoDe } from '../src/lib/office/xml';

describe('lector XML de Office', () => {
  it('quita los prefijos de espacio de nombres y guarda atributos y texto', () => {
    const x = parsearXml('<?xml version="1.0"?><w:doc xmlns:w="urn:w"><w:p w:val="a" r:id=\'b\'><w:t xml:space="preserve"> hola </w:t></w:p></w:doc>');
    expect(x.n).toBe('doc');
    const p = hijo(x, 'p')!;
    expect(p.a).toEqual({ val: 'a', id: 'b' });
    expect(hijo(p, 't')!.t).toBe(' hola ');
    expect(hijo(p, 't')!.a.space).toBe('preserve');
  });

  it('entidades, CDATA, comentarios y referencias numéricas', () => {
    const x = parsearXml('<a><!-- nota --><t>x &amp; y &lt; z &#233;&#x1F600;</t><c><![CDATA[<raw> & ]]></c></a>');
    expect(hijo(x, 't')!.t).toBe('x & y < z é😀');
    expect(hijo(x, 'c')!.t).toBe('<raw> & ');
  });

  it('elementos autocerrados, anidación y recorridos', () => {
    const x = parsearXml('<r><a><b/><b k="1"/></a><a><c><b k="2"/></c></a></r>');
    expect(hijos(x, 'a')).toHaveLength(2);
    expect(descendientes(x, 'b')).toHaveLength(3);
    expect(descendiente(x, 'b')!.a).toEqual({});
    expect(ruta(x, 'a', 'b')!.n).toBe('b');
    expect(ruta(x, 'a', 'zzz')).toBeUndefined();
    expect(textoDe(parsearXml('<r><t>a</t><x><t>b</t></x></r>'), 't')).toBe('ab');
  });

  it('acepta DOCTYPE, BOM y atributos sin comillas anidadas', () => {
    const x = parsearXml('﻿<!DOCTYPE x [<!ENTITY e "v">]><x a="it\'s"/>');
    expect(x.a.a).toBe("it's");
  });

  it('un documento vacío da error', () => {
    expect(() => parsearXml('   ')).toThrow(/vacío/);
  });

  it('es rápido con documentos grandes', () => {
    const filas = Array.from({ length: 20000 }, (_, i) => `<row r="${i}"><c r="A${i}" t="s"><v>${i}</v></c></row>`).join('');
    const t0 = performance.now();
    const x = parsearXml(`<sheetData>${filas}</sheetData>`);
    expect(x.h).toHaveLength(20000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
