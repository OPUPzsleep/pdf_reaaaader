// Escritor de .docx (Word) a partir de bloques de texto: títulos, párrafos con formato, listas, tablas e imágenes.
// Los elementos siguen el orden que exige el esquema de WordprocessingML (Word es estricto con él).
import JSZip from 'jszip';
import { escaparXmlSeguro } from '../epub/texto';
import type { Span } from '../epub/tipos';

export interface ImagenDocx {
  datos: Uint8Array;
  tipo: 'jpeg' | 'png';
  /** Tamaño en pt */
  ancho: number;
  alto: number;
}

export interface TablaDocx {
  filas: string[][];
  /** La primera fila es una cabecera (negrita y relleno, se repite en cada página) */
  cabecera: boolean;
  /** [fila, columnaInicial, columnaFinal] */
  fusiones: [number, number, number][];
  /** Anchos relativos de las columnas */
  anchos: number[];
}

export type BloqueDocx =
  | { tipo: 'p'; spans: Span[]; sangria?: boolean }
  | { tipo: 'h'; nivel: 1 | 2 | 3; texto: string }
  | { tipo: 'li'; ordenado: boolean; spans: Span[] }
  | { tipo: 'img'; imagen: ImagenDocx; descripcion?: string }
  | { tipo: 'tabla'; tabla: TablaDocx }
  | { tipo: 'salto' };

export interface EntradaDocx {
  bloques: BloqueDocx[];
  titulo: string;
  autor: string;
  idioma: string;
  /** Tamaño de la página en pt */
  pagina: { ancho: number; alto: number };
  /** Margen en pt */
  margen: number;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const IDIOMAS_WORD: Record<string, string> = { es: 'es-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT', it: 'it-IT', ca: 'ca-ES' };

const twips = (pt: number) => Math.round(pt * 20);
const emu = (pt: number) => Math.round(pt * 12700);

function runaTexto(texto: string, props: string): string {
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escaparXmlSeguro(texto)}</w:t></w:r>`;
}

function runas(spans: Span[]): string {
  return spans
    .filter((s) => s.texto.length > 0)
    .map((s) => {
      const props = [s.mono ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : '', s.negrita ? '<w:b/><w:bCs/>' : '', s.cursiva ? '<w:i/><w:iCs/>' : ''].join('');
      if (!props) return runaTexto(s.texto, '');
      // Los espacios de los extremos quedan fuera del formato: «<b>muy importante</b> y»
      const [, ini, nucleo, fin] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.texto)!;
      if (!nucleo) return runaTexto(s.texto, '');
      return (ini ? runaTexto(ini, '') : '') + runaTexto(nucleo, props) + (fin ? runaTexto(fin, '') : '');
    })
    .join('');
}

const esNumero = (t: string) => /^[-+(]?\s*[\d.,]+\s*[%€$)]?$/.test(t.trim()) && /\d/.test(t);

function tablaXml(t: TablaDocx, anchoUtil: number): string {
  const nCols = Math.max(...t.filas.map((f) => f.length), 1);
  const rel = Array.from({ length: nCols }, (_, j) => Math.max(1, t.anchos[j] ?? 1));
  const sumaRel = rel.reduce((a, b) => a + b, 0);
  const anchos = rel.map((r) => Math.max(400, Math.round((r / sumaRel) * twips(anchoUtil))));
  const borde = (n: string) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="808080"/>`;
  const filas = t.filas.map((fila, fi) => {
    const fusion = new Map<number, number>();
    const ocultas = new Set<number>();
    for (const [f, a, b] of t.fusiones) {
      if (f !== fi) continue;
      fusion.set(a, b - a + 1);
      for (let j = a + 1; j <= b; j++) ocultas.add(j);
    }
    const celdas: string[] = [];
    for (let j = 0; j < nCols; j++) {
      if (ocultas.has(j)) continue;
      const span = fusion.get(j) ?? 1;
      const ancho = anchos.slice(j, j + span).reduce((a, b) => a + b, 0);
      const texto = fila[j] ?? '';
      const cab = t.cabecera && fi === 0;
      const sombra = cab ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : '';
      const alinea = !cab && esNumero(texto) ? '<w:pPr><w:spacing w:after="0"/><w:jc w:val="right"/></w:pPr>' : '<w:pPr><w:spacing w:after="0"/></w:pPr>';
      const contenido = texto ? `<w:p>${alinea}${runas([{ texto, negrita: cab, cursiva: false, mono: false }])}</w:p>` : `<w:p>${alinea}</w:p>`;
      celdas.push(`<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${sombra}</w:tcPr>${contenido}</w:tc>`);
    }
    return `<w:tr>${t.cabecera && fi === 0 ? '<w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${celdas.join('')}</w:tr>`;
  });
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${anchos.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borde).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${anchos.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${filas.join('')}</w:tbl><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`
  );
}

export async function escribirDocx(e: EntradaDocx): Promise<Uint8Array> {
  const anchoUtil = Math.max(100, e.pagina.ancho - 2 * e.margen);
  const medios: { ruta: string; tipo: string; datos: Uint8Array }[] = [];
  const nums: number[] = [];
  let siguienteNum = 3;
  let listaActual: boolean | null = null;
  let idDibujo = 0;

  const cuerpo: string[] = [];
  for (const b of e.bloques) {
    if (b.tipo !== 'li') listaActual = null;
    if (b.tipo === 'h') {
      cuerpo.push(`<w:p><w:pPr><w:pStyle w:val="Heading${b.nivel}"/></w:pPr><w:r><w:t xml:space="preserve">${escaparXmlSeguro(b.texto)}</w:t></w:r></w:p>`);
    } else if (b.tipo === 'p') {
      const r = runas(b.spans);
      if (!r) continue;
      cuerpo.push(`<w:p>${b.sangria ? '<w:pPr><w:ind w:firstLine="454"/></w:pPr>' : ''}${r}</w:p>`);
    } else if (b.tipo === 'li') {
      const r = runas(b.spans);
      if (!r) continue;
      let numId = 1;
      if (b.ordenado) {
        // Cada lista numerada reinicia en 1
        if (listaActual !== true) {
          nums.push(siguienteNum);
          siguienteNum++;
        }
        numId = nums[nums.length - 1];
      }
      listaActual = b.ordenado;
      cuerpo.push(`<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${r}</w:p>`);
    } else if (b.tipo === 'img') {
      const im = b.imagen;
      let w = im.ancho;
      let h = im.alto;
      if (w > anchoUtil) {
        h = (h * anchoUtil) / w;
        w = anchoUtil;
      }
      const n = medios.length + 1;
      const ext = im.tipo === 'png' ? 'png' : 'jpg';
      medios.push({ ruta: `media/image${n}.${ext}`, tipo: im.tipo, datos: im.datos });
      idDibujo++;
      cuerpo.push(
        `<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(w)}" cy="${emu(h)}"/><wp:docPr id="${idDibujo}" name="Imagen ${idDibujo}" descr="${escaparXmlSeguro(b.descripcion ?? `Ilustración ${idDibujo}`)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${idDibujo}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
      );
    } else if (b.tipo === 'tabla') {
      if (b.tabla.filas.length) cuerpo.push(tablaXml(b.tabla, anchoUtil));
    } else if (b.tipo === 'salto') {
      cuerpo.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
  }
  if (!cuerpo.length) cuerpo.push('<w:p/>');

  const m = twips(e.margen);
  const sect = `<w:sectPr><w:pgSz w:w="${twips(e.pagina.ancho)}" w:h="${twips(e.pagina.alto)}"/><w:pgMar w:top="${m}" w:right="${m}" w:bottom="${m}" w:left="${m}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${cuerpo.join('')}${sect}</w:body></w:document>`;

  const lang = IDIOMAS_WORD[e.idioma] ?? e.idioma;
  const fuente = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>';
  const estiloTitulo = (id: string, nombre: string, sz: number, antes: number, nivel: number) =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nombre}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${antes}" w:after="120"/><w:outlineLvl w:val="${nivel}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="2F5496"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>${fuente}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${lang}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    estiloTitulo('Heading1', 'heading 1', 32, 360, 0) + estiloTitulo('Heading2', 'heading 2', 26, 240, 1) + estiloTitulo('Heading3', 'heading 3', 24, 200, 2) +
    `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style></w:styles>`;

  const nivel = (i: number, fmt: string, texto: string, izq: number) =>
    `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${texto}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${izq}" w:hanging="360"/></w:pPr></w:lvl>`;
  const numeracion = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering ${NS}>` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${nivel(0, 'bullet', '•', 720)}${nivel(1, 'bullet', '–', 1440)}${nivel(2, 'bullet', '•', 2160)}</w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${nivel(0, 'decimal', '%1.', 720)}${nivel(1, 'lowerLetter', '%2)', 1440)}${nivel(2, 'lowerRoman', '%3.', 2160)}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>` +
    nums.map((n) => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('') +
    `</w:numbering>`;

  const rel = (id: string, tipo: string, destino: string) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${destino}"/>`;
  const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rIdS', 'styles', 'styles.xml')}${rel('rIdN', 'numbering', 'numbering.xml')}${rel('rIdT', 'settings', 'settings.xml')}${medios.map((x, i) => rel(`rIdImg${i + 1}`, 'image', x.ruta)).join('')}</Relationships>`;

  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escaparXmlSeguro(e.titulo)}</dc:title><dc:creator>${escaparXmlSeguro(e.autor || 'pdfreaaaader')}</dc:creator><dc:language>${escaparXmlSeguro(lang)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>pdfreaaaader</Application></Properties>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${NS}><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const relsRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument', 'word/document.xml')}<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>${rel('rId3', 'extended-properties', 'docProps/app.xml')}</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', tipos);
  zip.file('_rels/.rels', relsRaiz);
  zip.file('word/document.xml', documento);
  zip.file('word/_rels/document.xml.rels', relsDoc);
  zip.file('word/styles.xml', estilos);
  zip.file('word/numbering.xml', numeracion);
  zip.file('word/settings.xml', settings);
  zip.file('docProps/core.xml', core);
  zip.file('docProps/app.xml', app);
  for (const x of medios) zip.file(`word/${x.ruta}`, x.datos);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
