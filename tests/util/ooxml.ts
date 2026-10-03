// Constructores mínimos de paquetes OOXML (docx/xlsx/pptx) para pruebas con casos concretos.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

export const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/office');
export const fixture = (nombre: string) => new Uint8Array(fs.readFileSync(path.join(FIXTURES, nombre)));

const NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

async function empaquetar(partes: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [ruta, contenido] of Object.entries(partes)) zip.file(ruta, contenido);
  return zip.generateAsync({ type: 'uint8array' });
}

const REL = (id: string, tipo: string, destino: string, externo = false) =>
  `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${destino}"${externo ? ' TargetMode="External"' : ''}/>`;

export interface OpcionesDocx {
  cuerpo: string;
  estilos?: string;
  numeracion?: string;
  notas?: string;
  rels?: string[];
  extras?: Record<string, string | Uint8Array>;
}

export async function crearDocx(o: OpcionesDocx): Promise<Uint8Array> {
  const rels = [...(o.estilos ? [REL('rIdS', 'styles', 'styles.xml')] : []), ...(o.numeracion ? [REL('rIdN', 'numbering', 'numbering.xml')] : []), ...(o.notas ? [REL('rIdF', 'footnotes', 'footnotes.xml')] : []), ...(o.rels ?? [])];
  return empaquetar({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'officeDocument', 'word/document.xml')}</Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS_W}><w:body>${o.cuerpo}</w:body></w:document>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
    ...(o.estilos ? { 'word/styles.xml': `<?xml version="1.0" encoding="UTF-8"?><w:styles ${NS_W}>${o.estilos}</w:styles>` } : {}),
    ...(o.numeracion ? { 'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8"?><w:numbering ${NS_W}>${o.numeracion}</w:numbering>` } : {}),
    ...(o.notas ? { 'word/footnotes.xml': `<?xml version="1.0" encoding="UTF-8"?><w:footnotes ${NS_W}>${o.notas}</w:footnotes>` } : {}),
    ...o.extras,
  });
}

export const REL_ENLACE_EXTERNO = (id: string, url: string) => REL(id, 'hyperlink', url, true);
export const REL_IMAGEN = (id: string, destino: string) => REL(id, 'image', destino);

/** PNG de 1×1 píxeles rojo */
export const PNG_1X1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));

export interface OpcionesXlsx {
  hoja: string;
  estilos?: string;
  compartidas?: string[];
  libro?: string;
  hojasExtra?: string[];
}

export async function crearXlsx(o: OpcionesXlsx): Promise<Uint8Array> {
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const hojas = [o.hoja, ...(o.hojasExtra ?? [])];
  const partes: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'officeDocument', 'xl/workbook.xml')}</Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook ${NS}>${o.libro ?? ''}<sheets>${hojas.map((_, i) => `<sheet name="Hoja${i + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => REL(`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`)).join('')}</Relationships>`,
  };
  hojas.forEach((h, i) => (partes[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}>${h}</worksheet>`));
  if (o.estilos) partes['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8"?><styleSheet ${NS}>${o.estilos}</styleSheet>`;
  if (o.compartidas) partes['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst ${NS}>${o.compartidas.map((s) => `<si>${s.startsWith('<') ? s : `<t>${s}</t>`}</si>`).join('')}</sst>`;
  return empaquetar(partes);
}

/** Estilos mínimos de Excel: 0 = general, 1 = fecha, 2 = 0,00 en negrita con fondo, 3 = moneda */
export const ESTILOS_XLSX_BASICOS = `<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00&quot; €&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom></border></borders><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0"/><xf numFmtId="2" fontId="1" fillId="2" borderId="1"><alignment horizontal="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0"/></cellXfs>`;

export async function crearPptxMinimo(diapositivas: string[], extra: Record<string, string | Uint8Array> = {}, relsDiap: string[] = []): Promise<Uint8Array> {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const partes: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'officeDocument', 'ppt/presentation.xml')}</Relationships>`,
    'ppt/presentation.xml': `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdM"/></p:sldMasterIdLst><p:sldIdLst>${diapositivas.map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdS${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rIdM', 'slideMaster', 'slideMasters/slideMaster1.xml')}${diapositivas.map((_, i) => REL(`rIdS${i + 1}`, 'slide', `slides/slide${i + 1}.xml`)).join('')}</Relationships>`,
    'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')}${REL('rId2', 'theme', '../theme/theme1.xml')}</Relationships>`,
    'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')}</Relationships>`,
    'ppt/theme/theme1.xml': '<?xml version="1.0" encoding="UTF-8"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="t"><a:themeElements><a:clrScheme name="c"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>',
    ...extra,
  };
  diapositivas.forEach((arbol, i) => {
    partes[`ppt/slides/slide${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${arbol}</p:spTree></p:cSld></p:sld>`;
    partes[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${REL('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')}${relsDiap.join('')}</Relationships>`;
  });
  return empaquetar(partes);
}
