import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

export const hayLibreOffice = (() => {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

export const PARRAFOS = [
  'La lluvia caía sobre la ciudad desde hacía tres días, y nadie recordaba un otoño tan gris. Marta cruzó la plaza con el paraguas cerrado, como si desafiara al cielo, y entró en la librería sin mirar atrás.',
  'Dentro olía a papel viejo y a café recién hecho. El dueño levantó la vista de un libro enorme y le dedicó una sonrisa cansada. Hacía años que no entraba nadie con tanta prisa en un día tan tranquilo.',
  'Buscaba un volumen concreto, uno que su abuelo había mencionado en sus últimas cartas: un tratado sobre las estrellas escrito a mano, con anotaciones en los márgenes. Nadie sabía si de verdad existía.',
  'Recorrió los estantes con los dedos, leyendo los lomos en voz baja. Entre las novelas gastadas y los manuales de jardinería apareció, por fin, un cuaderno de tapas azules sin título ni autor.',
  'Al abrirlo encontró un mapa del cielo dibujado con tinta sepia y, debajo, una dedicatoria que le hizo contener la respiración. Era la letra de su abuelo, inconfundible, inclinada hacia la derecha.',
  'El libro no tenía precio. El librero se encogió de hombros y dijo que llevaba décadas en aquel estante, esperando a alguien que supiera leerlo. Marta pagó con las pocas monedas que le quedaban.',
];

const p = (texto: string, estilo = 'Standard') => {
  const nivel = /^Heading_20_(\d)$/.exec(estilo)?.[1];
  return nivel
    ? `<text:h text:style-name="${estilo}" text:outline-level="${nivel}">${texto}</text:h>`
    : `<text:p text:style-name="${estilo}">${texto}</text:p>`;
};
const parrafos = (n: number, desde = 0) => Array.from({ length: n }, (_, i) => p(PARRAFOS[(desde + i) % PARRAFOS.length])).join('\n');

/** Documento ODT plano: 3 capítulos, cabecera y pie con número de página, lista, 2 columnas y una imagen. */
export type VarianteLibro = 'normal' | 'simple';

async function fodt(variante: VarianteLibro): Promise<string> {
  const png = (await sharp({ create: { width: 320, height: 200, channels: 3, background: '#2a6fb0' } })
    .composite([{ input: Buffer.from('<svg width="320" height="200"><circle cx="160" cy="100" r="70" fill="#f5c542"/></svg>'), top: 0, left: 0 }])
    .png()
    .toBuffer()).toString('base64');
  const doc = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:meta><dc:title>El cuaderno azul</dc:title><meta:initial-creator>Ana Prueba</meta:initial-creator><dc:creator>Ana Prueba</dc:creator><dc:language>es-ES</dc:language></office:meta>
<office:font-face-decls><style:font-face style:name="Liberation Serif" svg:font-family="'Liberation Serif'" style:font-family-generic="roman"/><style:font-face style:name="Liberation Sans" svg:font-family="'Liberation Sans'" style:font-family-generic="swiss"/></office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:text-properties style:font-name="Liberation Serif" fo:font-size="11pt" fo:language="es" fo:country="ES"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm" fo:line-height="130%" fo:text-align="justify" fo:text-indent="0.6cm"/><style:text-properties fo:font-size="11pt"/></style:style>
<style:style style:name="Sin_20_sangria" style:display-name="Sin sangria" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-indent="0cm"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:next-style-name="Standard" style:default-outline-level="1"><style:paragraph-properties fo:margin-top="2cm" fo:margin-bottom="0.6cm" fo:break-before="page" fo:text-align="start"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="22pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:next-style-name="Standard" style:default-outline-level="2"><style:paragraph-properties fo:margin-top="0.6cm" fo:margin-bottom="0.3cm" fo:keep-with-next="always"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="15pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Header" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt" fo:font-style="italic"/></style:style>
<style:style style:name="Footer" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-size="9pt"/></style:style>
<style:style style:name="Vineta" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.9cm" fo:text-indent="-0.5cm" fo:margin-bottom="0.1cm" fo:text-align="start"/></style:style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="14.8cm" fo:page-height="21cm" fo:margin-top="1.2cm" fo:margin-bottom="1.2cm" fo:margin-left="1.8cm" fo:margin-right="1.8cm"/><style:header-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-bottom="0.4cm"/></style:header-style><style:footer-style><style:header-footer-properties fo:min-height="0.6cm" fo:margin-top="0.4cm"/></style:footer-style></style:page-layout>
<style:style style:name="Negrita" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Cursiva" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="DosCol" style:family="section"><style:section-properties><style:columns fo:column-count="2" fo:column-gap="0.7cm"/></style:section-properties></style:style>
<style:style style:name="Img" style:family="graphic"><style:graphic-properties style:wrap="none" text:anchor-type="as-char" style:vertical-pos="top" style:horizontal-pos="center"/></style:style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"><style:header>${p('El cuaderno azul — Ana Prueba', 'Header')}</style:header><style:footer><text:p text:style-name="Footer">Página <text:page-number text:select-page="current"/></text:p></style:footer></style:master-page></office:master-styles>
<office:body><office:text>
${p('Capítulo 1: La librería', 'Heading_20_1')}
${p('El comienzo', 'Heading_20_2')}
${parrafos(5, 0)}
<text:p text:style-name="Standard">Era un libro <text:span text:style-name="Negrita">muy importante</text:span> y, según decían, <text:span text:style-name="Cursiva">casi imposible de encontrar</text:span>. Marta lo sabía mejor que nadie, porque había pasado años buscándolo.</text:p>
${parrafos(6, 2)}
${p('Lo que encontró', 'Heading_20_2')}
${parrafos(6, 1)}
${p('Capítulo 2: El mapa', 'Heading_20_1')}
${parrafos(3, 3)}
<text:p text:style-name="Sin_20_sangria">En las primeras páginas había tres tipos de anotaciones:</text:p>
${p('• Fechas escritas con tinta negra en el margen izquierdo.', 'Vineta')}
${p('• Nombres de constelaciones, subrayados dos veces.', 'Vineta')}
${p('• Pequeños dibujos de barcos y de faros.', 'Vineta')}
<text:section text:style-name="DosCol" text:name="Columnas">
${parrafos(8, 0)}
</text:section>
${parrafos(2, 4)}
${p('Capítulo 3: El regreso', 'Heading_20_1')}
${parrafos(3, 0)}
<text:p text:style-name="Sin_20_sangria"><draw:frame draw:style-name="Img" draw:name="Figura" text:anchor-type="as-char" svg:width="6cm" svg:height="3.75cm"><draw:image><office:binary-data>${png}</office:binary-data></draw:image></draw:frame></text:p>
${parrafos(7, 2)}
${p('Epílogo', 'Heading_20_2')}
${parrafos(4, 5)}
</office:text></office:body>
</office:document>`;
  if (variante === 'normal') return doc;
  // «simple»: texto sin justificar, sin sangría, sin cabecera ni pie y con más aire entre párrafos
  return doc
    .replace('fo:margin-bottom="0.25cm" fo:line-height="130%" fo:text-align="justify" fo:text-indent="0.6cm"', 'fo:margin-bottom="0.45cm" fo:line-height="120%" fo:text-align="start" fo:text-indent="0cm"')
    .replace(/<style:header>.*?<\/style:header>/s, '')
    .replace(/<style:footer>.*?<\/style:footer>/s, '');
}

const cache = new Map<VarianteLibro, string>();

/** Convierte el documento de prueba a PDF con LibreOffice (marcadores, cabecera y pie incluidos). */
export async function crearLibroPdf(variante: VarianteLibro = 'normal'): Promise<Uint8Array> {
  const guardado = cache.get(variante);
  if (guardado) return new Uint8Array(fs.readFileSync(guardado));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libro-'));
  const origen = path.join(dir, 'cuaderno.fodt');
  fs.writeFileSync(origen, await fodt(variante));
  const filtro = variante === 'simple' ? 'pdf:writer_pdf_Export:{"ExportBookmarks":{"type":"boolean","value":"false"}}' : 'pdf';
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/perfil`, '--convert-to', filtro, '--outdir', dir, origen], { stdio: 'ignore', timeout: 120_000 });
  const salida = path.join(dir, 'cuaderno.pdf');
  cache.set(variante, salida);
  return new Uint8Array(fs.readFileSync(salida));
}
