import type { Bloque, Span } from './tipos';
import { escaparXml } from './texto';

export interface ImagenEmpaquetada {
  /** Ruta dentro del EPUB, relativa a la carpeta de los capítulos (p. ej. «img/img001.jpg») */
  ruta: string;
  tipo: 'jpeg' | 'png';
  datos: Uint8Array;
  ancho: number;
  alto: number;
}

export interface TituloEnCapitulo {
  id: string;
  texto: string;
  nivel: number;
}

function spansAHtml(spans: Span[]): string {
  return spans
    .map((s) => {
      // Los espacios de los extremos quedan fuera de las etiquetas: «<strong>muy importante</strong> y»
      const [, ini, nucleo, fin] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.texto)!;
      if (!nucleo) return escaparXml(s.texto);
      let h = escaparXml(nucleo);
      if (s.mono) h = `<code>${h}</code>`;
      if (s.cursiva) h = `<em>${h}</em>`;
      if (s.negrita) h = `<strong>${h}</strong>`;
      return ini + h + fin;
    })
    .join('');
}

export interface ResultadoXhtml {
  cuerpo: string;
  titulos: TituloEnCapitulo[];
}

/** Convierte los bloques de un capítulo en HTML de cuerpo (XHTML válido). */
export function bloquesAHtml(
  bloques: Bloque[],
  imagenes: Map<unknown, ImagenEmpaquetada>,
  prefijoId: string,
  rutaImagen: (ruta: string) => string,
): ResultadoXhtml {
  const partes: string[] = [];
  const titulos: TituloEnCapitulo[] = [];
  let lista: { ordenado: boolean; items: string[] } | null = null;
  let h = 0;
  let nImg = 0;

  const cerrarLista = () => {
    if (!lista) return;
    const etiqueta = lista.ordenado ? 'ol' : 'ul';
    partes.push(`<${etiqueta}>\n${lista.items.map((i) => `<li>${i}</li>`).join('\n')}\n</${etiqueta}>`);
    lista = null;
  };

  for (const b of bloques) {
    if (b.tipo === 'li') {
      if (lista && lista.ordenado !== b.ordenado) cerrarLista();
      lista ??= { ordenado: b.ordenado, items: [] };
      lista.items.push(spansAHtml(b.spans));
      continue;
    }
    cerrarLista();
    if (b.tipo === 'h') {
      const id = `${prefijoId}-t${++h}`;
      titulos.push({ id, texto: b.texto, nivel: b.nivel });
      partes.push(`<h${b.nivel} id="${id}">${escaparXml(b.texto)}</h${b.nivel}>`);
    } else if (b.tipo === 'p') {
      const html = spansAHtml(b.spans);
      if (html.trim()) partes.push(`<p>${html}</p>`);
    } else {
      const im = imagenes.get(b.imagen);
      if (!im) continue;
      nImg++;
      partes.push(
        `<figure class="imagen"><img src="${escaparXml(rutaImagen(im.ruta))}" alt="Ilustración ${nImg}" width="${im.ancho}" height="${im.alto}"/></figure>`,
      );
    }
  }
  cerrarLista();
  return { cuerpo: partes.join('\n'), titulos };
}

export function documentoXhtml(opciones: { idioma: string; titulo: string; cuerpo: string; css?: string; tipo?: string; extraHead?: string; bodyAttrs?: string }): string {
  const { idioma, titulo, cuerpo, css = 'estilo.css', tipo = 'bodymatter chapter', extraHead = '', bodyAttrs = '' } = opciones;
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escaparXml(idioma)}" xml:lang="${escaparXml(idioma)}">
<head>
<meta charset="utf-8"/>
<title>${escaparXml(titulo)}</title>
<link rel="stylesheet" type="text/css" href="${css}"/>
${extraHead}
</head>
<body${bodyAttrs}>
<section epub:type="${tipo}">
${cuerpo}
</section>
</body>
</html>
`;
}

export const CSS_LIBRO = `html { font-size: 100%; }
body { margin: 0 5%; line-height: 1.5; font-family: serif; text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.25; text-align: left; hyphens: none; -webkit-hyphens: none; page-break-after: avoid; break-after: avoid; }
h1 { font-size: 1.7em; margin: 2em 0 1em; page-break-before: always; break-before: page; }
h2 { font-size: 1.3em; margin: 1.6em 0 0.6em; }
h3 { font-size: 1.1em; margin: 1.2em 0 0.4em; }
p { margin: 0 0 0.7em; text-indent: 0; orphans: 2; widows: 2; }
ul, ol { margin: 0 0 0.9em 1.2em; padding: 0; text-align: left; }
li { margin: 0 0 0.3em; }
code { font-family: monospace; font-size: 0.9em; }
figure.imagen { margin: 1.2em 0; text-align: center; page-break-inside: avoid; break-inside: avoid; }
figure.imagen img { max-width: 100%; height: auto; }
nav ol { list-style: none; margin-left: 0; }
nav li { margin: 0.3em 0; }
section.portada { margin: 0; text-align: center; }
section.portada img { max-width: 100%; max-height: 98vh; }
`;
