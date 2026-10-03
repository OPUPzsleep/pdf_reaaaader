import { describe, expect, it } from 'vitest';
import { pptxAHtml } from '../src/lib/office/pptx';
import { crearPptxMinimo, fixture, PNG_1X1, REL_IMAGEN } from './util/ooxml';

const texto = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const forma = (id: number, x: number, y: number, w: number, h: number, extra: string, cuerpo = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="f${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>${extra}</p:spPr>${cuerpo}</p:sp>`;
const texto1 = (t: string, props = '') => `<p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="es-ES" ${props}/><a:t>${t}</a:t></a:r></a:p></p:txBody>`;

describe('PowerPoint → HTML: presentación real (python-pptx)', () => {
  it('diapositivas, tamaño de página, texto, listas, formas, imagen y tabla', async () => {
    const { html, unidades, avisos } = await pptxAHtml(fixture('presentacion.pptx'));
    const t = texto(html);
    expect(unidades).toBe(5);
    expect(avisos).toEqual([]);
    expect(html).toMatch(/@page\{size:959\.98pt 540pt;margin:0\}/); // 13,333 pulgadas
    expect((html.match(/<section class="d"/g) ?? []).length).toBe(5);
    for (const s of ['Plan de lanzamiento', 'Producto nuevo', 'Objetivos', 'Reforzar la marca', 'Campaña en redes sociales', '¡Gracias!']) expect(t).toContain(s);
    // viñetas
    expect(html).toContain('>•</span>');
    // formas con relleno de color y geometrías predefinidas
    expect(html).toMatch(/fill="#c00000"/);
    expect(html).toMatch(/fill="#2e75b6"/);
    expect(html).toMatch(/<path d="M[^"]*A[^"]*"/); // elipse y rectángulo redondeado
    // texto de las formas en blanco (fontRef del estilo de forma)
    expect(html).toMatch(/color:#ffffff">Forma 1</);
    // formato de ejecución: negrita y cursiva roja
    expect(html).toMatch(/font-weight:700[^"]*">Texto en negrita, </);
    expect(html).toMatch(/font-style:italic[^"]*color:#c00000[^"]*">cursiva roja</);
    // imagen y tabla con estilo integrado (cabecera en el color de énfasis y texto blanco)
    expect(html).toMatch(/<img src="data:image\/png;base64,/);
    expect(html).toContain('<table');
    expect(html).toMatch(/<td[^>]*background:#4f81bd[^>]*>.*?Región/);
  });

  it('el HTML es autocontenido', async () => {
    const { html } = await pptxAHtml(fixture('presentacion.pptx'));
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/<script/i);
  });
});

describe('PowerPoint → HTML: casos concretos', () => {
  it('posición y rotación de las formas, escala de las unidades (EMU → pt)', async () => {
    const p = await crearPptxMinimo([forma(2, 1270000, 635000, 2540000, 1270000, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>').replace('<a:xfrm>', '<a:xfrm rot="5400000">')]);
    const { html } = await pptxAHtml(p);
    expect(html).toContain('left:100pt;top:50pt;width:200pt;height:100pt;transform:rotate(90deg)');
    expect(html).toMatch(/@page\{size:720pt 540pt/);
  });

  it('grupos: las coordenadas de los hijos se transforman', async () => {
    const hijoForma = forma(3, 127000, 127000, 254000, 254000, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill>');
    const grupoCambiado = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1270000" y="1270000"/><a:ext cx="2540000" cy="2540000"/><a:chOff x="0" y="0"/><a:chExt cx="1270000" cy="1270000"/></a:xfrm></p:grpSpPr>${hijoForma}</p:grpSp>`;
    const { html } = await pptxAHtml(await crearPptxMinimo([grupoCambiado]));
    // hijo en (10 pt, 10 pt) de 20×20 pt dentro de un grupo que duplica la escala y está en (100, 100) → (120, 120) de 40×40
    expect(html).toContain('left:120pt;top:120pt;width:40pt;height:40pt');
  });

  it('el texto respeta tamaño, ajuste, anclaje, listas numeradas y saltos de línea', async () => {
    const cuerpo = `<p:txBody><a:bodyPr anchor="ctr" lIns="0" tIns="0" rIns="0" bIns="0"/><a:p><a:pPr marL="342900" indent="-342900"><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:rPr sz="2400" b="1"/><a:t>Uno</a:t></a:r></a:p><a:p><a:pPr marL="342900" indent="-342900"><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:rPr sz="2400"/><a:t>Dos</a:t></a:r><a:br/><a:r><a:rPr sz="1200"/><a:t>otra línea</a:t></a:r></a:p><a:p><a:pPr algn="r"><a:spcBef><a:spcPts val="1200"/></a:spcBef></a:pPr><a:r><a:rPr sz="1800" u="sng" strike="sngStrike"/><a:t>Derecha</a:t></a:r></a:p></p:txBody>`;
    const { html } = await pptxAHtml(await crearPptxMinimo([forma(2, 0, 0, 2540000, 1270000, '', cuerpo)]));
    expect(html).toMatch(/justify-content:center;padding:0pt 0pt 0pt 0pt/);
    expect(html).toContain('font-size:24pt');
    expect(html).toMatch(/>1\.<\/span>/);
    expect(html).toMatch(/>2\.<\/span>/);
    expect(html).toContain('<br>');
    expect(html).toMatch(/text-align:right;margin:0;margin-top:12pt/);
    expect(html).toMatch(/text-decoration:underline line-through[^"]*">Derecha</);
    expect(html).toContain('margin-left:27pt;text-indent:-27pt');
  });

  it('degradados, imágenes con recorte, líneas con flecha y formas personalizadas', async () => {
    const degradado = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>';
    const linea = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="3" name="l"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm flipV="1"><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="25400"><a:solidFill><a:srgbClr val="333333"/></a:solidFill><a:prstDash val="dash"/><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`;
    const personalizada = forma(4, 0, 0, 1270000, 1270000, '<a:custGeom><a:avLst/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:lnTo><a:pt x="50" y="100"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="123456"/></a:solidFill>');
    const imagen = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="i"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="50000"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="1270000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    const p = await crearPptxMinimo([forma(2, 0, 0, 1270000, 1270000, degradado) + linea + personalizada + imagen], { 'ppt/media/a.png': PNG_1X1 }, [REL_IMAGEN('rId2', '../media/a.png')]);
    const { html } = await pptxAHtml(p);
    expect(html).toMatch(/<linearGradient id="g\d+" x1="50%" y1="0%" x2="50%" y2="100%">/);
    expect(html).toMatch(/stroke-dasharray=/);
    expect(html).toMatch(/marker-end="url\(#a\d+\)"/);
    expect(html).toMatch(/transform="translate\(0 50\) scale\(1 -1\)"/);
    expect(html).toContain('fill="#123456"');
    expect(html).toMatch(/border-radius:50%/);
    expect(html).toMatch(/width:200%/); // recorte del 50 % izquierdo
  });

  it('los marcadores de posición vacíos y las diapositivas ocultas no se imprimen', async () => {
    const vacio = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100000" cy="100000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:endParaRPr lang="es"/></a:p></p:txBody></p:sp>';
    const p = await crearPptxMinimo([vacio + forma(3, 0, 0, 1270000, 635000, '', texto1('Visible')), forma(4, 0, 0, 100000, 100000, '', texto1('Oculta'))]);
    const JSZip = (await import('jszip')).default;
    const z = await JSZip.loadAsync(p);
    z.file('ppt/slides/slide2.xml', (await z.file('ppt/slides/slide2.xml')!.async('string')).replace('<p:sld ', '<p:sld show="0" '));
    const { html, unidades } = await pptxAHtml(await z.generateAsync({ type: 'uint8array' }));
    expect(unidades).toBe(1);
    expect(texto(html)).toContain('Visible');
    expect(html).not.toContain('Oculta');
  });

  it('gráficos y objetos que no se pueden dibujar se avisan', async () => {
    const grafico = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="g"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId9"/></a:graphicData></a:graphic></p:graphicFrame>';
    const { html, avisos } = await pptxAHtml(await crearPptxMinimo([grafico]));
    expect(html).toContain('[Gráfico]');
    expect(avisos.join(' ')).toMatch(/gráficos/);
  });

  it('un archivo que no es pptx da un error claro', async () => {
    await expect(pptxAHtml(new Uint8Array([1, 2, 3]))).rejects.toThrow(/no parece un documento de Office/);
  });
});
