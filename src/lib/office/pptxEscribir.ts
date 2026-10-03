// Escritor de .pptx (PowerPoint): diapositivas con imagen de fondo, imágenes y cuadros de texto editables.
import JSZip from 'jszip';
import { escaparXmlSeguro } from '../epub/texto';

export interface RunPptx {
  texto: string;
  /** pt */
  tam: number;
  negrita: boolean;
  cursiva: boolean;
  /** Familia de la fuente (se sustituye por una parecida si el equipo no la tiene) */
  fuente: string;
  /** RRGGBB */
  color: string;
  /** Sin relleno visible (texto reconocido por OCR sobre la imagen original) */
  invisible?: boolean;
}

export interface LineaPptx {
  runs: RunPptx[];
  /** Distancia entre líneas base, en pt */
  paso: number;
  /** Desplazamiento a la derecha respecto al borde del cuadro, en pt */
  sangria?: number;
}

export interface CajaTextoPptx {
  /** pt, origen arriba a la izquierda */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  lineas: LineaPptx[];
  alinear: 'l' | 'ctr' | 'r';
}

export interface ImagenPptx {
  datos: Uint8Array;
  tipo: 'jpeg' | 'png';
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface DiapositivaPptx {
  fondo?: { datos: Uint8Array; tipo: 'jpeg' | 'png' };
  imagenes: ImagenPptx[];
  textos: CajaTextoPptx[];
}

export interface EntradaPptx {
  diapositivas: DiapositivaPptx[];
  /** Tamaño de las diapositivas en pt */
  ancho: number;
  alto: number;
  titulo: string;
  autor: string;
  idioma: string;
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;
const CAB = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const IDIOMAS: Record<string, string> = { es: 'es-ES', en: 'en-US', fr: 'fr-FR', de: 'de-DE', pt: 'pt-PT', it: 'it-IT', ca: 'ca-ES' };

const emu = (pt: number) => Math.max(0, Math.round(pt * 12700));
const rel = (id: string, tipo: string, destino: string) => `<Relationship Id="${id}" Type="${NS_R}/${tipo}" Target="${destino}"/>`;
const RELS = (cuerpo: string) => `${CAB}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${cuerpo}</Relationships>`;
const GRUPO_VACIO = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const FUENTES_COMUNES = new Set([
  'Arial', 'Calibri', 'Cambria', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma', 'Georgia', 'Consolas', 'Segoe UI', 'Trebuchet MS', 'Comic Sans MS',
  'Century Gothic', 'Garamond', 'Palatino Linotype', 'Book Antiqua', 'Candara', 'Corbel', 'Constantia', 'Impact', 'Lucida Console', 'Arial Narrow',
]);

/** Fuente de PowerPoint parecida a la del PDF */
export function fuentePptx(familia: string | undefined, mono: boolean): string {
  const f = (familia ?? '').trim();
  if (FUENTES_COMUNES.has(f)) return f;
  if (/^helvetica|^arimo|^liberation sans|^nimbus sans/i.test(f)) return 'Arial';
  if (/^times|^liberation serif|^nimbus roman|^tinos/i.test(f)) return 'Times New Roman';
  if (/^courier|^liberation mono|^nimbus mono|^cousine/i.test(f)) return 'Courier New';
  if (mono || /mono|courier|consol|typewriter/i.test(f)) return 'Courier New';
  if (/serif|georgia|garamond|palatino|minion|baskerville|bookman|century|didot|bodoni|caslon|cambria|roman/i.test(f) && !/sans/i.test(f)) return 'Times New Roman';
  return f && /^[\w ]{2,30}$/.test(f) ? f : 'Arial';
}

function runXml(r: RunPptx, lang: string): string {
  const relleno = r.invisible ? `<a:solidFill><a:srgbClr val="000000"><a:alpha val="0"/></a:srgbClr></a:solidFill>` : `<a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill>`;
  const fuente = escaparXmlSeguro(r.fuente);
  return `<a:r><a:rPr lang="${lang}" sz="${Math.max(100, Math.round(r.tam * 100))}"${r.negrita ? ' b="1"' : ''}${r.cursiva ? ' i="1"' : ''} dirty="0">${relleno}<a:latin typeface="${fuente}"/><a:cs typeface="${fuente}"/></a:rPr><a:t>${escaparXmlSeguro(r.texto)}</a:t></a:r>`;
}

function cajaXml(c: CajaTextoPptx, id: number, lang: string): string {
  const parrafos = c.lineas
    .map((l) => {
      const mayor = Math.max(...l.runs.map((r) => r.tam), 8);
      const fin = `<a:endParaRPr lang="${lang}" sz="${Math.round(mayor * 100)}" dirty="0"/>`;
      return `<a:p><a:pPr${l.sangria && l.sangria > 0.5 ? ` marL="${emu(l.sangria)}"` : ''} algn="${c.alinear}"><a:lnSpc><a:spcPts val="${Math.max(100, Math.round(l.paso * 100))}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>${l.runs.map((r) => runXml(r, lang)).join('')}${fin}</a:p>`;
    })
    .join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Texto ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(c.x)}" y="${emu(c.y)}"/><a:ext cx="${emu(c.ancho)}" cy="${emu(c.alto)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${parrafos}</p:txBody></p:sp>`;
}

function imagenXml(i: ImagenPptx, id: number, rid: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Imagen ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(i.x)}" y="${emu(i.y)}"/><a:ext cx="${emu(i.ancho)}" cy="${emu(i.alto)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

const TEMA = `${CAB}<a:theme xmlns:a="${NS_A}" name="Tema de Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const nivelTexto = (n: number, tam: number) =>
  `<a:lvl${n}pPr marL="${(n - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${tam}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`;

const MAESTRO = `${CAB}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRUPO_VACIO}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${nivelTexto(1, 4400)}</p:titleStyle><p:bodyStyle>${nivelTexto(1, 2800)}${nivelTexto(2, 2400)}</p:bodyStyle><p:otherStyle>${nivelTexto(1, 1800)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const DISENO = `${CAB}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="En blanco"><p:spTree>${GRUPO_VACIO}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

export async function escribirPptx(e: EntradaPptx): Promise<Uint8Array> {
  const lang = IDIOMAS[e.idioma] ?? e.idioma;
  const medios: { ruta: string; datos: Uint8Array }[] = [];
  const nuevoMedio = (datos: Uint8Array, tipo: 'jpeg' | 'png') => {
    const ruta = `media/image${medios.length + 1}.${tipo === 'png' ? 'png' : 'jpg'}`;
    medios.push({ ruta, datos });
    return ruta;
  };

  const zip = new JSZip();
  const n = e.diapositivas.length;
  const tipos = `${CAB}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`;
  zip.file('[Content_Types].xml', tipos);
  e.diapositivas.forEach((d, i) => {
    const rels: string[] = [rel('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')];
    let siguiente = 2;
    let bg = '';
    if (d.fondo) {
      const ruta = nuevoMedio(d.fondo.datos, d.fondo.tipo);
      rels.push(rel(`rId${siguiente}`, 'image', `../${ruta}`));
      bg = `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId${siguiente}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`;
      siguiente++;
    }
    let id = 2;
    const formas: string[] = [];
    for (const im of d.imagenes) {
      const ruta = nuevoMedio(im.datos, im.tipo);
      rels.push(rel(`rId${siguiente}`, 'image', `../${ruta}`));
      formas.push(imagenXml(im, id++, `rId${siguiente}`));
      siguiente++;
    }
    for (const t of d.textos) if (t.lineas.length) formas.push(cajaXml(t, id++, lang));
    zip.file(`ppt/slides/slide${i + 1}.xml`, `${CAB}<p:sld ${NS}><p:cSld>${bg}<p:spTree>${GRUPO_VACIO}${formas.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, RELS(rels.join('')));
  });

  zip.file('_rels/.rels', RELS(`${rel('rId1', 'officeDocument', 'ppt/presentation.xml')}<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>${rel('rId3', 'extended-properties', 'docProps/app.xml')}`));
  const ahora = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  zip.file('docProps/core.xml', `${CAB}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escaparXmlSeguro(e.titulo)}</dc:title><dc:creator>${escaparXmlSeguro(e.autor || 'pdfreaaaader')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${ahora}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${ahora}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', `${CAB}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>pdfreaaaader</Application><Slides>${n}</Slides></Properties>`);
  zip.file(
    'ppt/presentation.xml',
    `${CAB}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(e.ancho)}" cy="${emu(e.alto)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  zip.file('ppt/_rels/presentation.xml.rels', RELS(`${rel('rId1', 'slideMaster', 'slideMasters/slideMaster1.xml')}${rel('rId2', 'presProps', 'presProps.xml')}${rel('rId3', 'viewProps', 'viewProps.xml')}${rel('rId4', 'theme', 'theme/theme1.xml')}${rel('rId5', 'tableStyles', 'tableStyles.xml')}${Array.from({ length: n }, (_, i) => rel(`rId${10 + i}`, 'slide', `slides/slide${i + 1}.xml`)).join('')}`));
  zip.file('ppt/presProps.xml', `${CAB}<p:presentationPr ${NS}/>`);
  zip.file('ppt/viewProps.xml', `${CAB}<p:viewPr ${NS}/>`);
  zip.file('ppt/tableStyles.xml', `${CAB}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  zip.file('ppt/theme/theme1.xml', TEMA);
  zip.file('ppt/slideMasters/slideMaster1.xml', MAESTRO);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', RELS(`${rel('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')}${rel('rId2', 'theme', '../theme/theme1.xml')}`));
  zip.file('ppt/slideLayouts/slideLayout1.xml', DISENO);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', RELS(rel('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')));
  for (const m of medios) zip.file(`ppt/${m.ruta}`, m.datos);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
