import type { PDFDocumentProxy } from 'pdfjs-dist';
import { dividirCapitulos } from './capitulos';
import { arbolDeIndice, ensamblarEpub, type DocumentoSpine, type EntradaNav, type EspecEpub } from './ensamblar';
import { leerMarcadores, type OperadoresPdf } from './extraer';
import { leerDocumentoPdf } from './lectura';
import { detectarIdioma, escaparXmlSeguro, limpiarTexto, normalizarClave, normalizarIdioma } from './texto';
import type { Bloque, EntradaIndice, OpcionesEpub, Progreso, ProveedorRender } from './tipos';
import { bloquesAHtml, documentoXhtml, type ImagenEmpaquetada } from './xhtml';

export * from './tipos';
export { ensamblarEpub } from './ensamblar';

export interface EntradaConversion {
  doc: PDFDocumentProxy;
  ops: OperadoresPdf;
  render: ProveedorRender;
  opciones: OpcionesEpub;
  nombreArchivo: string;
  progreso?: Progreso;
  cancelado?: () => boolean;
}

export interface ResumenConversion {
  paginas: number;
  capitulos: number;
  imagenes: number;
  idioma: string;
  estrategia: string;
  escaneado: boolean;
  advertencias: string[];
}

export interface ResultadoConversion {
  datos: Uint8Array;
  resumen: ResumenConversion;
}

const rellenar = (n: number, ancho: number) => String(n).padStart(ancho, '0');

function comprobar(c?: () => boolean) {
  if (c?.()) throw new Error('Conversión cancelada.');
}

export async function metadatosDelPdf(doc: PDFDocumentProxy): Promise<{ titulo: string; autor: string; idioma: string | null }> {
  try {
    const m = await doc.getMetadata();
    const info = (m.info ?? {}) as Record<string, unknown>;
    return {
      titulo: typeof info.Title === 'string' ? info.Title.trim() : '',
      autor: typeof info.Author === 'string' ? info.Author.trim() : '',
      idioma: typeof info.Language === 'string' ? normalizarIdioma(info.Language) : null,
    };
  } catch {
    return { titulo: '', autor: '', idioma: null };
  }
}

/** Convierte un PDF abierto con pdf.js en un EPUB 3. */
export async function convertirPdfAEpub(e: EntradaConversion): Promise<ResultadoConversion> {
  try {
    return await convertir(e);
  } finally {
    await e.render.liberar?.();
  }
}

async function convertir(e: EntradaConversion): Promise<ResultadoConversion> {
  const { doc, ops, render, opciones } = e;
  const progreso: Progreso = e.progreso ?? (() => undefined);
  const total = doc.numPages;
  const meta = await metadatosDelPdf(doc);
  const base = e.nombreArchivo.replace(/\.[^.]+$/, '');
  const titulo = limpiarTexto(opciones.titulo.trim() || meta.titulo || base || 'Documento');
  const autor = limpiarTexto(opciones.autor.trim() || meta.autor);
  const advertencias: string[] = [];
  const indiceMarcadores: EntradaIndice[] = await leerMarcadores(doc);

  const identificador = `urn:uuid:${crypto.randomUUID()}`;
  const modificado = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  /* ───────── Diseño fijo: cada página es una imagen ───────── */
  if (opciones.modo === 'fijo') {
    const imagenes: ImagenEmpaquetada[] = [];
    const documentos: DocumentoSpine[] = [];
    const ancho = String(total).length;
    let tamPagina = { ancho: 0, alto: 0 };
    for (let i = 0; i < total; i++) {
      comprobar(e.cancelado);
      progreso(i / total, `Página ${i + 1} de ${total}`);
      const r = await render.paginaAJpeg(i, 1200);
      if (i === 0) tamPagina = { ancho: r.ancho, alto: r.alto };
      const ruta = `img/p${rellenar(i + 1, Math.max(4, ancho))}.jpg`;
      imagenes.push({ ruta, tipo: 'jpeg', datos: r.datos, ancho: r.ancho, alto: r.alto });
      documentos.push({
        id: `p${i + 1}`,
        archivo: `p${rellenar(i + 1, Math.max(4, ancho))}.xhtml`,
        xhtml: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${meta.idioma ?? 'es'}" xml:lang="${meta.idioma ?? 'es'}">
<head>
<meta charset="utf-8"/>
<title>${escaparXmlSeguro(titulo)} — ${i + 1}</title>
<meta name="viewport" content="width=${r.ancho}, height=${r.alto}"/>
<style type="text/css">html, body { margin: 0; padding: 0; width: ${r.ancho}px; height: ${r.alto}px; } img { display: block; width: ${r.ancho}px; height: ${r.alto}px; }</style>
</head>
<body>
<img src="${imagenes[i].ruta}" alt="Página ${i + 1}" width="${r.ancho}" height="${r.alto}"/>
</body>
</html>
`,
      });
    }
    const idioma = opciones.idioma !== 'auto' ? opciones.idioma : (meta.idioma ?? 'es');
    let indice: EntradaNav[];
    const principales = indiceMarcadores.filter((m) => m.nivel <= 2 && m.pagina < total);
    if (principales.length >= 1) {
      indice = arbolDeIndice(principales, (m) => ({ titulo: m.titulo, href: documentos[m.pagina].archivo }));
    } else {
      indice = [];
      for (let d = 0; d < total; d += 10) indice.push({ titulo: `Páginas ${d + 1}–${Math.min(total, d + 10)}`, href: documentos[d].archivo });
    }
    progreso(0.95, 'Empaquetando…');
    const spec: EspecEpub = {
      id: identificador, titulo, autor, idioma, modificado, documentos, imagenes, portada: imagenes[0]?.ruta, indice,
      inicioLectura: documentos[0].archivo, fijo: tamPagina,
    };
    const datos = await ensamblarEpub(spec);
    progreso(1, 'Listo');
    return { datos, resumen: { paginas: total, capitulos: indice.length, imagenes: imagenes.length, idioma, estrategia: 'diseño fijo', escaneado: false, advertencias } };
  }

  /* ───────── Texto adaptable ───────── */
  const lectura = await leerDocumentoPdf({
    doc, ops, render, ocr: opciones.ocr, incluirImagenes: opciones.incluirImagenes, quitarCabeceras: opciones.quitarCabeceras, progreso, cancelado: e.cancelado,
    avisoEscaneado: (ocr) =>
      ocr
        ? 'Casi no se encontró texto. Si es un documento escaneado, prueba el modo «diseño fijo» o revisa el idioma del OCR.'
        : 'Este PDF parece escaneado (no contiene texto). Activa el OCR para obtener texto, o usa el modo «diseño fijo».',
  });
  const { paginas, analisis, escaneado } = lectura;
  advertencias.push(...lectura.advertencias);

  const textoMuestra = analisis.bloques.filter((b): b is Extract<Bloque, { tipo: 'p' }> => b.tipo === 'p').slice(0, 200).map((b) => b.spans.map((s) => s.texto).join('')).join(' ');
  const idioma = opciones.idioma !== 'auto' ? opciones.idioma : (meta.idioma ?? detectarIdioma(textoMuestra) ?? 'es');

  const { capitulos, usada, subentradas } = dividirCapitulos(analisis.bloques, paginas, indiceMarcadores, opciones.capitulos, opciones.paginasPorCapitulo, titulo);

  /* Imágenes: se recortan de la página renderizada */
  const imagenes = new Map<unknown, ImagenEmpaquetada>();
  const lista: ImagenEmpaquetada[] = [];
  const bloquesImagen = capitulos.flatMap((c) => c.bloques).filter((b): b is Extract<Bloque, { tipo: 'img' }> => b.tipo === 'img');
  for (let k = 0; k < bloquesImagen.length; k++) {
    comprobar(e.cancelado);
    progreso(0.55 + (k / Math.max(1, bloquesImagen.length)) * 0.3, `Imágenes ${k + 1} de ${bloquesImagen.length}`);
    const b = bloquesImagen[k];
    const r = b.imagen;
    try {
      const px = Math.max(200, Math.min(1400, Math.round(r.ancho * 2)));
      const out = await render.regionAImagen(b.pagina, { x: r.x, y: r.y, ancho: r.ancho, alto: r.alto }, px);
      const alto = Math.max(1, Math.round((px * r.alto) / r.ancho));
      const im: ImagenEmpaquetada = {
        ruta: `img/img${rellenar(lista.length + 1, 3)}.${out.tipo === 'png' ? 'png' : 'jpg'}`,
        tipo: out.tipo,
        datos: out.datos,
        ancho: px,
        alto,
      };
      imagenes.set(r, im);
      lista.push(im);
    } catch {
      advertencias.push(`No se pudo extraer una imagen de la página ${b.pagina + 1}.`);
    }
  }

  /* Portada: primera página */
  let portada: ImagenEmpaquetada | null = null;
  if (opciones.portada) {
    try {
      const r = await render.paginaAJpeg(0, 900);
      portada = { ruta: 'img/portada.jpg', tipo: 'jpeg', datos: r.datos, ancho: r.ancho, alto: r.alto };
      lista.unshift(portada);
    } catch {
      advertencias.push('No se pudo generar la portada.');
    }
  }

  /* Capítulos → XHTML */
  progreso(0.9, 'Creando capítulos…');
  const anchoNum = Math.max(3, String(capitulos.length).length);
  const documentos: DocumentoSpine[] = [];
  const indice: EntradaNav[] = [];
  if (portada) {
    documentos.push({
      id: 'portada',
      archivo: 'portada.xhtml',
      xhtml: documentoXhtml({
        idioma,
        titulo,
        tipo: 'cover',
        cuerpo: `<div class="portada"><img src="${portada.ruta}" alt="Portada" width="${portada.ancho}" height="${portada.alto}"/></div>`,
      }).replace('<section epub:type="cover">', '<section epub:type="cover" class="portada">'),
    });
  }
  const textoSubentradas = subentradas.map((s) => ({ ...s, clave: normalizarClave(s.titulo) }));
  capitulos.forEach((c, i) => {
    const archivo = `cap${rellenar(i + 1, anchoNum)}.xhtml`;
    const { cuerpo, titulos } = bloquesAHtml(c.bloques, imagenes, `c${i + 1}`, (r) => r);
    documentos.push({ id: `cap${i + 1}`, archivo, xhtml: documentoXhtml({ idioma, titulo: c.titulo, cuerpo }) });
    const hijos: EntradaNav[] = [];
    // Los marcadores de menor jerarquía y los subtítulos reales del capítulo forman el segundo nivel del índice
    const usados = new Set<string>();
    for (const t of titulos) {
      if (t.nivel === 1) continue;
      const clave = normalizarClave(t.texto);
      if (usados.has(clave)) continue;
      const deMarcador = textoSubentradas.find((s) => s.clave === clave);
      if (t.nivel === 2 || deMarcador) {
        usados.add(clave);
        hijos.push({ titulo: t.texto, href: `${archivo}#${t.id}` });
      }
    }
    indice.push({ titulo: c.titulo, href: archivo, hijos: hijos.length ? hijos : undefined });
  });

  progreso(0.95, 'Empaquetando…');
  const spec: EspecEpub = {
    id: identificador, titulo, autor, idioma, modificado, documentos, imagenes: lista,
    portada: portada?.ruta, indice, inicioLectura: documentos[portada ? 1 : 0]?.archivo ?? documentos[0].archivo,
  };
  const datos = await ensamblarEpub(spec);
  progreso(1, 'Listo');
  return {
    datos,
    resumen: { paginas: total, capitulos: capitulos.length, imagenes: bloquesImagen.length, idioma, estrategia: usada === 'marcadores' ? 'marcadores del PDF' : usada === 'titulos' ? 'títulos detectados' : 'cada ' + opciones.paginasPorCapitulo + ' páginas', escaneado, advertencias },
  };
}
