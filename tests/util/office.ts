import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NS = `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" office:version="1.3"`;

const FODT = `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.text"><office:body><office:text>
<text:p>Informe trimestral de ventas</text:p>
<text:p>Este documento resume los resultados del trimestre y las previsiones para el siguiente periodo.</text:p>
</office:text></office:body></office:document>`;

const FODS = `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.spreadsheet"><office:body><office:spreadsheet>
<table:table table:name="Ventas">
<table:table-row><table:table-cell office:value-type="string"><text:p>Producto</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Unidades</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>Precio</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>Manzanas</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="120"><text:p>120</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="1.5"><text:p>1,5</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>Peras</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="80"><text:p>80</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="2.25"><text:p>2,25</text:p></table:table-cell></table:table-row>
<table:table-row><table:table-cell office:value-type="string"><text:p>Uvas</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="45"><text:p>45</text:p></table:table-cell><table:table-cell office:value-type="float" office:value="3.1"><text:p>3,1</text:p></table:table-cell></table:table-row>
</table:table>
</office:spreadsheet></office:body></office:document>`;

const FODP = `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${NS} office:mimetype="application/vnd.oasis.opendocument.presentation">
<office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles>
<office:body><office:presentation>
<draw:page draw:name="p1" draw:master-page-name="Default"><draw:frame svg:width="24cm" svg:height="3cm" svg:x="2cm" svg:y="2cm"><draw:text-box><text:p>Plan de lanzamiento</text:p></draw:text-box></draw:frame><draw:frame svg:width="24cm" svg:height="6cm" svg:x="2cm" svg:y="6cm"><draw:text-box><text:p>Primera fase: investigación de mercado</text:p></draw:text-box></draw:frame></draw:page>
<draw:page draw:name="p2" draw:master-page-name="Default"><draw:frame svg:width="24cm" svg:height="3cm" svg:x="2cm" svg:y="2cm"><draw:text-box><text:p>Resultados esperados</text:p></draw:text-box></draw:frame></draw:page>
</office:presentation></office:body></office:document>`;

export type TipoOffice = 'docx' | 'xlsx' | 'pptx';

const ORIGEN: Record<TipoOffice, { nombre: string; contenido: string; filtro: string }> = {
  docx: { nombre: 'informe.fodt', contenido: FODT, filtro: 'docx:MS Word 2007 XML' },
  xlsx: { nombre: 'ventas.fods', contenido: FODS, filtro: 'xlsx:Calc MS Excel 2007 XML' },
  pptx: { nombre: 'plan.fodp', contenido: FODP, filtro: 'pptx:Impress MS PowerPoint 2007 XML' },
};

const cache = new Map<TipoOffice, Uint8Array>();

/** Crea un .docx/.xlsx/.pptx de ejemplo usando LibreOffice a partir de un ODF plano. */
export function crearOffice(tipo: TipoOffice): Uint8Array {
  const guardado = cache.get(tipo);
  if (guardado) return guardado;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-'));
  const o = ORIGEN[tipo];
  fs.writeFileSync(path.join(dir, o.nombre), o.contenido);
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', o.filtro, '--outdir', dir, path.join(dir, o.nombre)], { stdio: 'ignore', timeout: 180_000 });
  const salida = new Uint8Array(fs.readFileSync(path.join(dir, o.nombre.replace(/\.[^.]+$/, `.${tipo}`))));
  cache.set(tipo, salida);
  return salida;
}

export const hayGhostscript = (() => {
  try {
    execFileSync('gs', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Convierte un ODF plano (fodt/fods/fodp) a PDF con LibreOffice. */
export function crearPdfDesdeOdf(nombre: string, contenido: string): Uint8Array {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odf-pdf-'));
  fs.writeFileSync(path.join(dir, nombre), contenido);
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', 'pdf', '--outdir', dir, path.join(dir, nombre)], { stdio: 'ignore', timeout: 180_000 });
  return new Uint8Array(fs.readFileSync(path.join(dir, nombre.replace(/\.[^.]+$/, '.pdf'))));
}

/** Abre un .xlsx con LibreOffice y devuelve la primera hoja como CSV (comprueba que el libro es válido). */
export function xlsxACsv(xlsx: Uint8Array, hoja = 1): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-csv-'));
  fs.writeFileSync(path.join(dir, 'libro.xlsx'), xlsx);
  const filtro = `csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,${hoja}`;
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', filtro, '--outdir', dir, path.join(dir, 'libro.xlsx')], { stdio: 'ignore', timeout: 180_000 });
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.csv'));
  return fs.readFileSync(path.join(dir, archivos[0]), 'utf8');
}

export const NS_ODF = NS;
