import JSZip from 'jszip';
import { escaparXml } from './texto';
import { CSS_LIBRO, type ImagenEmpaquetada } from './xhtml';

export interface EntradaNav {
  titulo: string;
  href: string;
  hijos?: EntradaNav[];
}

export interface DocumentoSpine {
  id: string;
  /** Nombre de archivo dentro de OEBPS, p. ej. «cap001.xhtml» */
  archivo: string;
  xhtml: string;
}

export interface EspecEpub {
  id: string;
  titulo: string;
  autor: string;
  idioma: string;
  /** ISO 8601 UTC sin milisegundos */
  modificado: string;
  documentos: DocumentoSpine[];
  imagenes: ImagenEmpaquetada[];
  /** Ruta de la imagen que hace de portada (debe estar en `imagenes`) */
  portada?: string;
  indice: EntradaNav[];
  /** Primer documento que se abre al empezar a leer */
  inicioLectura: string;
  fijo?: { ancho: number; alto: number };
  css?: string;
  estilosExtra?: Record<string, string>;
}

const TIPO_IMAGEN = { jpeg: 'image/jpeg', png: 'image/png' } as const;

function navXhtml(spec: EspecEpub): string {
  const lista = (es: EntradaNav[]): string =>
    `<ol>\n${es
      .map((e) => `<li><a href="${escaparXml(e.href)}">${escaparXml(e.titulo)}</a>${e.hijos?.length ? '\n' + lista(e.hijos) : ''}</li>`)
      .join('\n')}\n</ol>`;
  const etiquetaIndice = spec.idioma.startsWith('es') ? 'Índice' : spec.idioma.startsWith('en') ? 'Contents' : 'Índice';
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escaparXml(spec.idioma)}" xml:lang="${escaparXml(spec.idioma)}">
<head>
<meta charset="utf-8"/>
<title>${etiquetaIndice}</title>
<link rel="stylesheet" type="text/css" href="estilo.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>${etiquetaIndice}</h1>
${lista(spec.indice)}
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
<li><a epub:type="bodymatter" href="${escaparXml(spec.inicioLectura)}">${spec.idioma.startsWith('en') ? 'Start reading' : 'Comenzar a leer'}</a></li>
</ol>
</nav>
</body>
</html>
`;
}

function ncx(spec: EspecEpub): string {
  let orden = 0;
  let id = 0;
  let profundidad = 1;
  // Los puntos que apuntan al mismo destino deben compartir playOrder
  const ordenPorDestino = new Map<string, number>();
  const puntos = (es: EntradaNav[], nivel: number): string => {
    profundidad = Math.max(profundidad, nivel);
    return es
      .map((e) => {
        const n = ++id;
        let po = ordenPorDestino.get(e.href);
        if (po === undefined) {
          po = ++orden;
          ordenPorDestino.set(e.href, po);
        }
        return `<navPoint id="np${n}" playOrder="${po}"><navLabel><text>${escaparXml(e.titulo)}</text></navLabel><content src="${escaparXml(e.href)}"/>${e.hijos?.length ? '\n' + puntos(e.hijos, nivel + 1) : ''}</navPoint>`;
      })
      .join('\n');
  };
  const cuerpo = puntos(spec.indice, 1);
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="${escaparXml(spec.idioma)}">
<head>
<meta name="dtb:uid" content="${escaparXml(spec.id)}"/>
<meta name="dtb:depth" content="${profundidad}"/>
<meta name="dtb:totalPageCount" content="0"/>
<meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escaparXml(spec.titulo)}</text></docTitle>
<navMap>
${cuerpo}
</navMap>
</ncx>
`;
}

function opf(spec: EspecEpub): string {
  const items: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="estilo.css" media-type="text/css"/>',
  ];
  for (const [archivo] of Object.entries(spec.estilosExtra ?? {})) items.push(`<item id="css-${archivo.replace(/\W/g, '')}" href="${archivo}" media-type="text/css"/>`);
  let portadaId: string | null = null;
  spec.imagenes.forEach((im, i) => {
    const id = `img${i + 1}`;
    const esPortada = spec.portada === im.ruta;
    if (esPortada) portadaId = id;
    items.push(`<item id="${id}" href="${escaparXml(im.ruta)}" media-type="${TIPO_IMAGEN[im.tipo]}"${esPortada ? ' properties="cover-image"' : ''}/>`);
  });
  for (const d of spec.documentos) items.push(`<item id="${d.id}" href="${d.archivo}" media-type="application/xhtml+xml"/>`);
  const fijo = spec.fijo
    ? `\n<meta property="rendition:layout">pre-paginated</meta>\n<meta property="rendition:orientation">auto</meta>\n<meta property="rendition:spread">none</meta>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escaparXml(spec.idioma)}" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escaparXml(spec.id)}</dc:identifier>
<dc:title>${escaparXml(spec.titulo)}</dc:title>
<dc:language>${escaparXml(spec.idioma)}</dc:language>${spec.autor ? `\n<dc:creator>${escaparXml(spec.autor)}</dc:creator>` : ''}
<meta property="dcterms:modified">${spec.modificado}</meta>${portadaId ? `\n<meta name="cover" content="${portadaId}"/>` : ''}${fijo}
</metadata>
<manifest>
${items.join('\n')}
</manifest>
<spine toc="ncx">
${spec.documentos.map((d) => `<itemref idref="${d.id}"/>`).join('\n')}
</spine>
</package>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles>
<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
</rootfiles>
</container>
`;

/** Empaqueta el EPUB: `mimetype` primero y sin comprimir, el resto con DEFLATE. */
export async function ensamblarEpub(spec: EspecEpub): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', CONTAINER);
  zip.file('OEBPS/content.opf', opf(spec));
  zip.file('OEBPS/nav.xhtml', navXhtml(spec));
  zip.file('OEBPS/toc.ncx', ncx(spec));
  zip.file('OEBPS/estilo.css', spec.css ?? CSS_LIBRO);
  for (const [archivo, contenido] of Object.entries(spec.estilosExtra ?? {})) zip.file(`OEBPS/${archivo}`, contenido);
  for (const d of spec.documentos) zip.file(`OEBPS/${d.archivo}`, d.xhtml);
  for (const im of spec.imagenes) zip.file(`OEBPS/${im.ruta}`, im.datos, { binary: true, compression: 'STORE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/epub+zip' });
}

/** Convierte una lista plana con niveles en un árbol anidado de entradas del índice. */
export function arbolDeIndice<T extends { nivel: number }>(entradas: T[], aEntrada: (e: T) => Omit<EntradaNav, 'hijos'>): EntradaNav[] {
  const raiz: EntradaNav[] = [];
  const pila: { nivel: number; lista: EntradaNav[] }[] = [{ nivel: -1, lista: raiz }];
  for (const e of entradas) {
    while (pila.length > 1 && pila[pila.length - 1].nivel >= e.nivel) pila.pop();
    const nodo: EntradaNav = { ...aEntrada(e), hijos: [] };
    pila[pila.length - 1].lista.push(nodo);
    pila.push({ nivel: e.nivel, lista: nodo.hijos! });
  }
  const limpiar = (es: EntradaNav[]) => es.forEach((n) => { if (n.hijos && n.hijos.length === 0) delete n.hijos; else if (n.hijos) limpiar(n.hijos); });
  limpiar(raiz);
  return raiz;
}
