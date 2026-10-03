import JSZip from 'jszip';

export interface CeldaXlsx {
  v: string | number;
  estilo?: 'negrita' | 'porcentaje';
}

export interface HojaXlsx {
  nombre: string;
  filas: (CeldaXlsx | null)[][];
  /** Celdas combinadas en notación A1:B1 */
  fusiones?: string[];
}

const ESTILO = { negrita: 1, porcentaje: 2 } as const;

// Caracteres no válidos en XML 1.0
// eslint-disable-next-line no-control-regex
const INVALIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const esc = (s: string) => s.replace(INVALIDOS, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function letraDeColumna(n: number): string {
  let s = '';
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

/** Nombre de hoja válido en Excel: ≤ 31 caracteres, sin []:*?/\ y sin repetirse. */
export function nombresDeHoja(nombres: string[]): string[] {
  const usados = new Set<string>();
  return nombres.map((n) => {
    let base = n.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Hoja';
    base = base.slice(0, 31);
    let nombre = base;
    for (let k = 2; usados.has(nombre.toLowerCase()); k++) {
      const suf = ` (${k})`;
      nombre = base.slice(0, 31 - suf.length) + suf;
    }
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

function xmlHoja(h: HojaXlsx): string {
  const columnas = Math.max(1, ...h.filas.map((f) => f.length));
  const anchos: number[] = Array.from({ length: columnas }, () => 8);
  for (const f of h.filas) f.forEach((c, i) => {
    if (c !== null) anchos[i] = Math.max(anchos[i], Math.min(60, String(c.v).length * 1.15 + 2));
  });
  const filas = h.filas
    .map((fila, r) => {
      const celdas = fila
        .map((c, i) => {
          if (c === null || c.v === '') return '';
          const ref = `${letraDeColumna(i)}${r + 1}`;
          const s = c.estilo ? ` s="${ESTILO[c.estilo]}"` : '';
          if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
        })
        .join('');
      return celdas ? `<row r="${r + 1}">${celdas}</row>` : '';
    })
    .join('\n');
  const fusiones = h.fusiones?.length ? `<mergeCells count="${h.fusiones.length}">${h.fusiones.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a.toFixed(1)}" customWidth="1"/>`).join('')}</cols>
<sheetData>
${filas}
</sheetData>
${fusiones}
</worksheet>`;
}

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Genera un libro .xlsx (Office Open XML) mínimo y compatible con Excel y LibreOffice. */
export async function crearXlsx(hojas: HojaXlsx[]): Promise<Uint8Array> {
  if (hojas.length === 0) throw new Error('No hay datos que guardar.');
  const nombres = nombresDeHoja(hojas.map((h) => h.nombre));
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('xl/styles.xml', ESTILOS);
  hojas.forEach((h, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xmlHoja(h)));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
