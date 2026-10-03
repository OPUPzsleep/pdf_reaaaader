import { describe, expect, it } from 'vitest';
import { docxAHtml } from '../src/lib/office/docx';
import { crearDocx, fixture, PNG_1X1, REL_ENLACE_EXTERNO, REL_IMAGEN } from './util/ooxml';

const texto = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');

const P = (xml: string) => `<w:p>${xml}</w:p>`;
const R = (t: string, props = '') => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;

describe('Word → HTML: documento real (python-docx)', () => {
  it('conserva el texto, el formato, las listas, la tabla y la imagen', async () => {
    const { html, avisos } = await docxAHtml(fixture('informe.docx'));
    const t = texto(html);
    expect(t).toContain('Informe trimestral de ventas');
    expect(t).toContain('Resumen ejecutivo');
    expect(t).toContain('1. Introducción');
    expect(avisos).toEqual([]);
    // formato de las ejecuciones
    expect(html).toMatch(/font-weight:700[^"]*">resultados</);
    expect(html).toMatch(/font-style:italic[^"]*">previsiones</);
    expect(html).toMatch(/text-decoration:underline[^"]*">subrayado</);
    expect(html).toMatch(/color:#c00000[^"]*">color rojo</);
    expect(html).toMatch(/vertical-align:sub[^"]*">2</);
    expect(html).toMatch(/vertical-align:super[^"]*">2</);
    // enlace externo
    expect(html).toContain('href="https://example.com"');
    // listas: viñetas y numeración 1. 2. 3.
    expect(html).toContain('>•</span>');
    expect(t).toMatch(/1\. Preparar los datos/);
    expect(t).toMatch(/2\. Revisar las cifras/);
    expect(t).toMatch(/3\. Enviar el informe/);
    // tabla con encabezado sombreado y celda combinada
    expect(html).toContain('<table');
    expect(html).toMatch(/background:#1f3864/);
    expect(html).toMatch(/colspan="2"/);
    // imagen incrustada (sin referencias externas)
    expect(html).toMatch(/<img src="data:image\/png;base64,/);
    expect(html).not.toMatch(/src="(?!data:)/);
  });

  it('páginas: A4, sección apaisada, encabezado y pie con numeración', async () => {
    const { html } = await docxAHtml(fixture('informe.docx'));
    expect(html).toMatch(/@page s1\{size:595\.3pt 841\.9pt;margin:70\.85pt 70\.85pt 70\.85pt 70\.85pt/);
    expect(html).toMatch(/@page s\d\{size:841\.9pt 595\.3pt/);
    expect(html).toContain('counter(page)');
    expect(html).toContain('counter(pages)');
    expect(html).toContain('Informe confidencial');
    // salto de página explícito
    expect(html).toContain('class="pb"');
    // tabulador derecho con puntos de relleno (índice)
    expect(html).toMatch(/border-bottom:1px dotted currentColor/);
  });

  it('el HTML es autocontenido y no permite cargar nada externo', async () => {
    const { html } = await docxAHtml(fixture('informe.docx'));
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/(?!example\.com)[^"' ]+\.(png|jpg|css|js)/);
  });
});

describe('Word → HTML: casos concretos', () => {
  it('escapa el texto y no deja pasar etiquetas', async () => {
    const d = await crearDocx({ cuerpo: P(R('&lt;script&gt;alert(1)&lt;/script&gt; &amp; "comillas"')) });
    const { html } = await docxAHtml(d);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;comillas&quot;');
  });

  it('herencia de estilos: basedOn, tamaño y color del estilo de párrafo', async () => {
    const d = await crearDocx({
      estilos: `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titulo"><w:name w:val="Titulo"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="FF0000"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Sub"><w:name w:val="Sub"/><w:basedOn w:val="Titulo"/><w:rPr><w:i/><w:sz w:val="28"/></w:rPr></w:style>`,
      cuerpo: P('<w:pPr><w:pStyle w:val="Sub"/></w:pPr>' + R('Hola')),
    });
    const { html } = await docxAHtml(d);
    const p = /<p style="([^"]*)">/.exec(html)![1];
    expect(p).toContain('font-size:14pt');
    expect(p).toContain('font-weight:700');
    expect(p).toContain('font-style:italic');
    expect(p).toContain('color:#ff0000');
    expect(p).toContain('text-align:center');
    expect(p).toContain('margin-top:12pt');
    expect(p).toContain('font-family:Arial');
  });

  it('el espaciado de Word se suma (después + antes) y contextualSpacing lo anula', async () => {
    const d = await crearDocx({
      estilos: `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="Lista"/><w:pPr><w:contextualSpacing/><w:spacing w:before="100" w:after="100"/></w:pPr></w:style>`,
      cuerpo:
        P('<w:pPr><w:spacing w:before="200" w:after="400"/></w:pPr>' + R('A')) +
        P('<w:pPr><w:spacing w:before="200" w:after="0"/></w:pPr>' + R('B')) +
        P('<w:pPr><w:pStyle w:val="Lista"/></w:pPr>' + R('C')) +
        P('<w:pPr><w:pStyle w:val="Lista"/></w:pPr>' + R('D')),
    });
    const { html } = await docxAHtml(d);
    const ps = [...html.matchAll(/<p style="([^"]*)">/g)].map((m) => m[1]);
    expect(ps[0]).toContain('margin-top:10pt');
    expect(ps[1]).toContain('margin-top:30pt'); // 20 (después de A) + 10 (antes de B)
    expect(ps[2]).toContain('margin-top:5pt'); // antes de C = 5 (el «después» de B es 0)
    expect(ps[3]).not.toContain('margin-top'); // C y D comparten estilo con espaciado contextual
  });

  it('listas con niveles, formatos y reinicios', async () => {
    const d = await crearDocx({
      numeracion: `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="lowerLetter"/><w:lvlText w:val="%2)"/><w:pPr><w:ind w:left="1440" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="3"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>`,
      cuerpo:
        ['1:0', '1:0', '1:1', '1:1', '1:0', '2:0', '2:0', '3:0'].map((x) => { const [n, l] = x.split(':'); return P(`<w:pPr><w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="${n}"/></w:numPr></w:pPr>` + R('x')); }).join(''),
    });
    const { html } = await docxAHtml(d);
    const etiquetas = [...html.matchAll(/text-indent:0[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(etiquetas).toEqual(['1.', '2.', 'a)', 'b)', '3.', 'I)', 'II)', '5.']);
    expect(html).toContain('margin-left:72pt'); // sangría del nivel 0
    expect(html).toContain('text-indent:-18pt');
  });

  it('tablas: combinaciones horizontales y verticales, bordes y relleno', async () => {
    const celda = (t: string, props = '') => `<w:tc><w:tcPr>${props}</w:tcPr>${P(R(t))}</w:tc>`;
    const d = await crearDocx({
      cuerpo: `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="8" w:color="FF0000"/><w:left w:val="single" w:sz="8" w:color="FF0000"/><w:bottom w:val="single" w:sz="8" w:color="FF0000"/><w:right w:val="single" w:sz="8" w:color="FF0000"/><w:insideH w:val="single" w:sz="4" w:color="00FF00"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
<w:tr>${celda('A', '<w:gridSpan w:val="2"/><w:shd w:val="clear" w:fill="DDDDDD"/>')}${celda('C', '<w:vMerge w:val="restart"/>')}</w:tr>
<w:tr>${celda('D')}${celda('E')}${celda('', '<w:vMerge/>')}</w:tr></w:tbl>`,
    });
    const { html } = await docxAHtml(d);
    expect(html).toMatch(/<td colspan="2" style="[^"]*background:#dddddd/);
    expect(html).toMatch(/<td rowspan="2"[^>]*>/);
    expect((html.match(/<td/g) ?? []).length).toBe(4); // la celda continuada no se emite
    expect(html).toContain('border-top:1pt solid #ff0000');
    expect(html).toContain('border-bottom:0.5pt solid #00ff00'); // borde interior horizontal en la fila 1
    expect(html).toMatch(/<col style="width:100pt">/);
  });

  it('secciones: páginas distintas, columnas y salto de página', async () => {
    const sec = (w: number, h: number, extra = '') => `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/>${extra}</w:sectPr>`;
    const d = await crearDocx({
      cuerpo: P(R('Uno')) + `<w:p><w:pPr>${sec(12240, 15840)}</w:pPr></w:p>` + P(R('Dos')) + P('<w:r><w:br w:type="page"/></w:r>') + P(R('Tres')) + sec(15840, 12240, '<w:cols w:num="2" w:space="360"/>'),
    });
    const { html } = await docxAHtml(d);
    expect(html).toMatch(/@page s1\{size:612pt 792pt/);
    expect(html).toMatch(/@page s2\{size:792pt 612pt/);
    expect(html).toMatch(/<section style="page:s2;[^"]*column-count:2;column-gap:18pt/);
    expect(html).toMatch(/class="pb"/);
    expect(texto(html)).toContain('Uno');
    expect(texto(html)).toContain('Tres');
  });

  it('hipervínculos, campos y notas al pie', async () => {
    const d = await crearDocx({
      rels: [REL_ENLACE_EXTERNO('rIdH', 'https://ejemplo.org/a?b=1&c=2')],
      notas: `<w:footnote w:type="separator" w:id="0"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Texto de la nota</w:t></w:r></w:p></w:footnote>`,
      cuerpo: P('<w:hyperlink r:id="rIdH">' + R('enlace') + '</w:hyperlink>' + R(' y nota') + '<w:r><w:footnoteReference w:id="1"/></w:r>') +
        P('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> HYPERLINK "https://campo.example/" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' + R('campo') + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'),
    });
    const { html } = await docxAHtml(d);
    expect(html).toContain('href="https://ejemplo.org/a?b=1&amp;c=2"');
    expect(html).toContain('href="https://campo.example/"');
    expect(html).not.toContain('HYPERLINK');
    expect(html).toMatch(/<p class="nota"><sup>1<\/sup> .*Texto de la nota/);
  });

  it('enlaces peligrosos (javascript:) no se enlazan', async () => {
    const d = await crearDocx({ rels: [REL_ENLACE_EXTERNO('rIdH', 'javascript:alert(1)')], cuerpo: P('<w:hyperlink r:id="rIdH">' + R('malo') + '</w:hyperlink>') });
    const { html } = await docxAHtml(d);
    expect(html).not.toContain('javascript:');
  });

  it('imágenes con recorte y tamaño, y aviso si no se puede mostrar', async () => {
    const dibujo = (embed: string, extra = '') => `<w:r><w:drawing><wp:inline><wp:extent cx="1270000" cy="635000"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${embed}"/>${extra}</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const d = await crearDocx({
      rels: [REL_IMAGEN('rIdI', 'media/a.png'), REL_IMAGEN('rIdE', 'media/b.emf')],
      extras: { 'word/media/a.png': PNG_1X1, 'word/media/b.emf': new Uint8Array([1, 2, 3]) },
      cuerpo: P(dibujo('rIdI', '<a:srcRect l="25000" t="10000" r="25000" b="0"/>')) + P(dibujo('rIdE')),
    });
    const { html, avisos } = await docxAHtml(d);
    expect(html).toMatch(/width:100pt;max-width:100%;aspect-ratio:100\/50/);
    expect(html).toMatch(/width:200%;height:111\.11%;left:-50%;top:-11\.11%/); // recorte: 25 % por cada lado y 10 % arriba
    expect(avisos.join(' ')).toMatch(/EMF|imagen/i);
  });

  it('texto oculto, tabuladores simples y saltos de línea', async () => {
    const d = await crearDocx({ cuerpo: P(R('visible') + R('secreto', '<w:vanish/>') + '<w:r><w:tab/></w:r>' + R('fin') + '<w:r><w:br/></w:r>' + R('línea 2')) });
    const { html } = await docxAHtml(d);
    expect(html).not.toContain('secreto');
    expect(html).toMatch(/display:inline-block;width:\d+pt/);
    expect(html).toContain('<br>');
  });

  it('un archivo que no es docx da un error claro', async () => {
    await expect(docxAHtml(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/no parece un documento de Office/);
    const d = await crearDocx({ cuerpo: '' });
    // sin document.xml
    const JSZip = (await import('jszip')).default;
    const z = await JSZip.loadAsync(d);
    z.remove('word/document.xml');
    await expect(docxAHtml(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/falta word\/document\.xml/);
  });
});
