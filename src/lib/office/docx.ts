// Word (.docx) → HTML autocontenido con las reglas de página en CSS (@page). El HTML se imprime a PDF con Chromium.
import { graficoASvg } from './grafico';
import {
  Paquete, escaparHtml, familiaCss, imagenComoDatos, leerTema, limpiarControl, r2, resolverFuente, type Relacion, type Tema,
} from './comun';
import {
  colorWord, leerBordes, leerEstilos, leerMargenTabla, leerNumeracion, leerPPr, leerRPr, mezclarPPr, mezclarRPr, nivelDe, formatearNumero,
  resolverEstilo, simboloViñeta, type Borde, type Estilos, type Numeracion, type PPr, type RPr, type Tabulador,
} from './docxProps';
import { descendiente, descendientes, hijo, hijos, num, ruta, type Nodo } from './xml';

export interface ResultadoOffice {
  html: string;
  avisos: string[];
  /** Cantidad de páginas/diapositivas/hojas, si se conoce */
  unidades?: number;
}

interface Ctx {
  tema: Tema;
  estilos: Estilos;
  num: Numeracion;
  rels: Map<string, Relacion>;
  imagenes: Map<string, string>;
  graficos: Map<string, Nodo>;
  contadores: Map<number, number[]>;
  avisos: Set<string>;
  notasPie: Map<string, Nodo>;
  notasUsadas: string[];
  campos: { instr: string; separado: boolean; enlace: boolean }[];
  anchoTexto: number;
  izquierdaPagina: number;
  superiorPagina: number;
}

interface Estado {
  despues: number;
  estilo: string | null;
  contextual: boolean;
}

/** Propiedades que el estilo de tabla (y su formato condicional) da a los párrafos de una celda */
interface ContextoTabla {
  pPr: PPr;
  rPr: RPr;
  pCond: PPr;
  rCond: RPr;
}

const nuevoEstado = (): Estado => ({ despues: 0, estilo: null, contextual: false });

const css = (...d: (string | false | null | undefined)[]) => d.filter(Boolean).join(';');

/* ───────── Texto con formato ───────── */

type Pieza =
  | { t: 'txt'; css: string; html: string }
  | { t: 'tab' }
  | { t: 'br' }
  | { t: 'pb' }
  | { t: 'html'; html: string };

function cssDeRPr(r: RPr, base: RPr, c: Ctx): string {
  const d: string[] = [];
  const fuente = resolverFuente(r.fuente, c.tema);
  const fuenteBase = resolverFuente(base.fuente, c.tema);
  if (fuente && fuente !== fuenteBase) {
    const f = familiaCss(fuente);
    if (f) d.push(`font-family:${f}`);
  }
  const subindice = r.sup || r.sub;
  if (r.sz !== undefined && (r.sz !== base.sz || subindice)) d.push(`font-size:${r2(subindice ? r.sz * 0.65 : r.sz)}pt`);
  else if (subindice) d.push(`font-size:${r2((base.sz ?? 11) * 0.65)}pt`);
  if (!!r.b !== !!base.b) d.push(`font-weight:${r.b ? 700 : 400}`);
  if (!!r.i !== !!base.i) d.push(`font-style:${r.i ? 'italic' : 'normal'}`);
  const subrayado = !!r.u;
  const tachado = !!r.strike;
  if (subrayado !== !!base.u || tachado !== !!base.strike) {
    const dec = [subrayado && 'underline', tachado && 'line-through'].filter(Boolean).join(' ');
    d.push(`text-decoration:${dec || 'none'}`);
    if (subrayado && r.u && r.u !== 'single' && r.u !== 'words') {
      const est = r.u.includes('double') ? 'double' : r.u.includes('dotted') || r.u.includes('dot') ? 'dotted' : r.u.includes('dash') ? 'dashed' : r.u.includes('wave') ? 'wavy' : 'solid';
      d.push(`text-decoration-style:${est}`);
    }
  }
  if (r.color && r.color !== 'auto' && r.color !== base.color) d.push(`color:${r.color}`);
  const fondo = r.highlight || r.fondo;
  if (fondo) d.push(`background-color:${fondo}`);
  if (r.sup) d.push('vertical-align:super');
  else if (r.sub) d.push('vertical-align:sub');
  if (r.caps) d.push('text-transform:uppercase');
  if (r.versalitas) d.push('font-variant:small-caps');
  if (r.spc) d.push(`letter-spacing:${r2(r.spc)}pt`);
  return d.join(';');
}

/** Convierte las propiedades de texto base de un párrafo en CSS completo para el elemento <p> */
function cssBaseTexto(r: RPr, c: Ctx): string {
  const d: string[] = [];
  const f = familiaCss(resolverFuente(r.fuente, c.tema) ?? c.tema.fuenteTexto);
  if (f) d.push(`font-family:${f}`);
  d.push(`font-size:${r2(r.sz ?? 10)}pt`);
  if (r.b) d.push('font-weight:700');
  if (r.i) d.push('font-style:italic');
  if (r.u || r.strike) d.push(`text-decoration:${[r.u && 'underline', r.strike && 'line-through'].filter(Boolean).join(' ')}`);
  if (r.color && r.color !== 'auto') d.push(`color:${r.color}`);
  if (r.caps) d.push('text-transform:uppercase');
  if (r.versalitas) d.push('font-variant:small-caps');
  return d.join(';');
}

/* ───────── Imágenes y dibujos ───────── */

const EMU_PT = 12700;

function imagenHtml(c: Ctx, embed: string | undefined, anchoPt: number, altoPt: number, recorte: { l: number; t: number; r: number; b: number } | null, extra = ''): string {
  const rel = embed ? c.rels.get(embed) : undefined;
  const uri = rel ? c.imagenes.get(rel.destino) : undefined;
  if (!uri) {
    c.avisos.add('Alguna imagen (por ejemplo EMF/WMF o vinculada) no se pudo incluir.');
    return '';
  }
  const w = Math.max(1, anchoPt);
  const h = Math.max(1, altoPt);
  if (recorte && (recorte.l || recorte.t || recorte.r || recorte.b)) {
    const ax = Math.max(0.01, 1 - recorte.l - recorte.r);
    const ay = Math.max(0.01, 1 - recorte.t - recorte.b);
    return `<span style="display:inline-block;position:relative;overflow:hidden;width:${r2(w)}pt;max-width:100%;aspect-ratio:${r2(w)}/${r2(h)};vertical-align:bottom;${extra}"><img src="${uri}" alt="" style="position:absolute;max-width:none;width:${r2(100 / ax)}%;height:${r2(100 / ay)}%;left:${r2((-recorte.l / ax) * 100)}%;top:${r2((-recorte.t / ay) * 100)}%"></span>`;
  }
  return `<img src="${uri}" alt="" style="width:${r2(w)}pt;max-width:100%;height:auto;aspect-ratio:${r2(w)}/${r2(h)};vertical-align:bottom;${extra}">`;
}

function leerRecorte(srcRect: Nodo | undefined) {
  if (!srcRect) return null;
  const v = (k: string) => Math.max(0, Math.min(0.95, num(srcRect, k) / 100000));
  return { l: v('l'), t: v('t'), r: v('r'), b: v('b') };
}

function renderDibujo(d: Nodo, c: Ctx, st: Estado): string {
  const marco = hijo(d, 'inline') ?? hijo(d, 'anchor');
  if (!marco) return '';
  const ext = hijo(marco, 'extent');
  const w = num(ext, 'cx') / EMU_PT;
  const h = num(ext, 'cy') / EMU_PT;
  const ancla = marco.n === 'anchor';

  let extra = '';
  if (ancla) {
    const ajuste = marco.h.find((x) => /^wrap(Square|Tight|Through)$/.test(x.n));
    const sinAjuste = marco.h.find((x) => x.n === 'wrapNone');
    const ph = hijo(marco, 'positionH');
    const pv = hijo(marco, 'positionV');
    const alineH = hijo(ph, 'align')?.t;
    if (ajuste && (alineH === 'left' || alineH === 'right')) {
      extra = `float:${alineH};margin:0 ${r2(num(marco, 'distR') / EMU_PT + 4)}pt ${r2(num(marco, 'distB') / EMU_PT + 2)}pt ${r2(num(marco, 'distL') / EMU_PT + 4)}pt`;
    } else if (sinAjuste) {
      const dh = Number(hijo(ph, 'posOffset')?.t ?? NaN);
      const dv = Number(hijo(pv, 'posOffset')?.t ?? NaN);
      if (Number.isFinite(dh) && Number.isFinite(dv)) {
        const relH = ph?.a.relativeFrom;
        const relV = pv?.a.relativeFrom;
        const izq = dh / EMU_PT - (relH === 'page' ? c.izquierdaPagina : 0);
        const arr = dv / EMU_PT - (relV === 'page' ? c.superiorPagina : 0);
        extra = `position:absolute;left:${r2(izq)}pt;top:${r2(arr)}pt;z-index:${marco.a.behindDoc === '1' ? -1 : 1}`;
      }
    }
  }

  const imagenes = descendientes(marco, 'pic');
  if (imagenes.length) {
    return imagenes
      .map((pic) => {
        const blip = descendiente(pic, 'blip');
        const embed = blip?.a.embed ?? blip?.a.link;
        const e = descendiente(pic, 'ext');
        const ancho = e && num(e, 'cx') ? num(e, 'cx') / EMU_PT : w;
        const alto = e && num(e, 'cy') ? num(e, 'cy') / EMU_PT : h;
        return imagenHtml(c, embed, imagenes.length === 1 ? w || ancho : ancho, imagenes.length === 1 ? h || alto : alto, leerRecorte(descendiente(pic, 'srcRect')), extra);
      })
      .join('');
  }
  const cajas = descendientes(marco, 'txbxContent');
  if (cajas.length) {
    const fondo = colorDeRelleno(descendiente(marco, 'spPr'), c);
    const linea = descendiente(descendiente(marco, 'spPr'), 'ln');
    const contorno = linea && !hijo(linea, 'noFill') ? `border:${r2(num(linea, 'w', 9525) / EMU_PT)}pt solid ${colorDeRelleno(linea, c) ?? '#444'}` : '';
    return cajas
      .map((caja) => `<div style="display:inline-block;vertical-align:top;box-sizing:border-box;width:${r2(w)}pt;max-width:100%;padding:3pt;${fondo ? `background:${fondo};` : ''}${contorno};${extra}">${renderBloques(caja.h, c, nuevoEstado())}</div>`)
      .join('');
  }
  if (descendiente(marco, 'chart')) {
    const idGrafico = descendiente(marco, 'chart')?.a.id;
    const raiz = idGrafico ? c.graficos.get(c.rels.get(idGrafico)?.destino ?? '') : undefined;
    if (raiz) {
      const g = graficoASvg(raiz, w, h, c.tema);
      if (g.aviso) c.avisos.add(`Gráficos de Word: ${g.aviso}.`);
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" style="display:inline-block;width:${r2(w)}pt;max-width:100%;height:auto;aspect-ratio:${r2(w)}/${r2(h)};vertical-align:bottom;${extra}">${g.svg}</svg>`;
    }
    c.avisos.add('No se pudo leer un gráfico de Word y se sustituye por un recuadro.');
    return `<div style="display:inline-block;box-sizing:border-box;width:${r2(w)}pt;max-width:100%;height:${r2(h)}pt;border:1px solid #bbb;background:#f6f6f6;color:#777;font:10pt sans-serif;text-align:center;line-height:${r2(h)}pt;vertical-align:bottom">[Gráfico]</div>`;
  }
  if (descendiente(marco, 'wsp') || descendiente(marco, 'sp')) {
    // Forma sin texto (líneas, rectángulos decorativos)
    const sp = descendiente(marco, 'spPr');
    const fondo = colorDeRelleno(sp, c);
    const linea = descendiente(sp, 'ln');
    const borde = linea && !hijo(linea, 'noFill') ? `border:${r2(Math.max(0.5, num(linea, 'w', 9525) / EMU_PT))}pt solid ${colorDeRelleno(linea, c) ?? '#000'}` : '';
    if (!fondo && !borde) return '';
    return `<span style="display:inline-block;box-sizing:border-box;width:${r2(w)}pt;max-width:100%;height:${r2(h)}pt;${fondo ? `background:${fondo};` : ''}${borde};vertical-align:bottom;${extra}"></span>`;
  }
  c.avisos.add('Algún elemento gráfico (SmartArt u otro objeto) no se pudo dibujar.');
  void st;
  return '';
}

/** Color de un relleno DrawingML: solidFill/srgbClr o schemeClr */
function colorDeRelleno(n: Nodo | undefined, c: Ctx): string | null {
  const solido = n ? (n.n === 'solidFill' ? n : hijo(n, 'solidFill')) : undefined;
  const col = solido?.h[0];
  if (!col) return null;
  if (col.n === 'srgbClr') return '#' + (col.a.val ?? '000000').toLowerCase();
  if (col.n === 'schemeClr') return c.tema.colores[col.a.val === 'bg1' ? 'lt1' : col.a.val === 'tx1' ? 'dk1' : (col.a.val ?? 'dk1')] ?? null;
  return null;
}

function renderPict(p: Nodo, c: Ctx): string {
  const im = descendiente(p, 'imagedata');
  if (!im) return '';
  const forma = descendiente(p, 'shape') ?? descendiente(p, 'rect');
  const estilo = forma?.a.style ?? '';
  const medida = (clave: string) => {
    const m = new RegExp(`${clave}:\\s*([\\d.]+)(pt|in|cm|mm|px)?`).exec(estilo);
    if (!m) return 0;
    const v = Number(m[1]);
    const u = m[2] ?? 'pt';
    return u === 'in' ? v * 72 : u === 'cm' ? (v * 72) / 2.54 : u === 'mm' ? (v * 72) / 25.4 : u === 'px' ? v * 0.75 : v;
  };
  return imagenHtml(c, im.a.id, medida('width') || 100, medida('height') || 100, null);
}

/* ───────── Párrafos ───────── */

interface Fragmento {
  piezas: Pieza[];
}

function esBlanco(s: string) {
  return !s.replace(/[\s ]/g, '');
}

function procesarRuns(nodos: Nodo[], c: Ctx, base: RPr, st: Estado, f: Fragmento, enlace: string | null): void {
  for (const n of nodos) {
    switch (n.n) {
      case 'r':
        run(n, c, base, st, f, enlace);
        break;
      case 'hyperlink': {
        const rel = n.a.id ? c.rels.get(n.a.id) : undefined;
        let href: string | null = null;
        if (rel?.externo && /^(https?:|mailto:|tel:)/i.test(rel.destino)) href = rel.destino;
        else if (n.a.anchor) href = `#bm_${n.a.anchor}`;
        procesarRuns(n.h, c, base, st, f, href);
        break;
      }
      case 'ins':
      case 'smartTag':
      case 'customXml':
      case 'dir':
      case 'bdo':
      case 'fldSimple':
        procesarRuns(n.h, c, base, st, f, enlace);
        break;
      case 'sdt':
        procesarRuns(hijo(n, 'sdtContent')?.h ?? [], c, base, st, f, enlace);
        break;
      case 'bookmarkStart':
        if (n.a.name && !n.a.name.startsWith('_GoBack')) f.piezas.push({ t: 'html', html: `<a id="bm_${escaparHtml(n.a.name)}"></a>` });
        break;
      case 'AlternateContent':
        procesarRuns((hijo(n, 'Choice') ?? hijo(n, 'Fallback'))?.h ?? [], c, base, st, f, enlace);
        break;
      case 'oMath':
      case 'oMathPara': {
        // Ecuaciones: no se maquetan, pero su texto no se pierde (variables en cursiva, como en Word)
        const t = descendientes(n, 't').map((x) => x.t).join('');
        if (t.trim()) f.piezas.push({ t: 'txt', css: cssDeRPr({ ...base, i: true }, base, c), html: escaparHtml(limpiarControl(t)) });
        c.avisos.add('Las ecuaciones de Word se muestran como texto plano.');
        break;
      }
      default:
        break;
    }
  }
}

function run(r: Nodo, c: Ctx, baseParrafo: RPr, st: Estado, f: Fragmento, enlace: string | null): void {
  const rPrNodo = hijo(r, 'rPr');
  const directo = leerRPr(rPrNodo, c.tema);
  let ef = baseParrafo;
  if (directo.estiloCar) ef = mezclarRPr(ef, resolverEstilo(c.estilos, directo.estiloCar).rPr);
  ef = mezclarRPr(ef, directo);
  if (enlace && !directo.estiloCar && directo.color === undefined) ef = { ...ef, color: c.tema.colores.hlink, u: ef.u || 'single' };
  if (ef.oculto) return;
  const estilo = cssDeRPr(ef, baseParrafo, c);
  const campo = c.campos[c.campos.length - 1];
  const dentroDeInstruccion = !!campo && !campo.separado;

  const añadirTexto = (t: string) => {
    if (!t) return;
    let html = escaparHtml(limpiarControl(t));
    if (enlace) html = `<a href="${escaparHtml(enlace)}" style="color:inherit;text-decoration:inherit">${html}</a>`;
    f.piezas.push({ t: 'txt', css: estilo, html });
  };

  for (const x of r.h) {
    switch (x.n) {
      case 'instrText':
        if (campo) campo.instr += x.t;
        break;
      case 'fldChar': {
        const tipo = x.a.fldCharType;
        if (tipo === 'begin') c.campos.push({ instr: '', separado: false, enlace: false });
        else if (tipo === 'separate' && campo) {
          campo.separado = true;
          const m = /HYPERLINK\s+"([^"]+)"/i.exec(campo.instr);
          if (m && /^(https?:|mailto:)/i.test(m[1])) {
            campo.enlace = true;
            f.piezas.push({ t: 'html', html: `<a href="${escaparHtml(m[1])}" style="color:inherit;text-decoration:inherit">` });
          }
        } else if (tipo === 'end') {
          const cerrado = c.campos.pop();
          if (cerrado?.enlace) f.piezas.push({ t: 'html', html: '</a>' });
        }
        break;
      }
      case 't':
        if (!dentroDeInstruccion) añadirTexto(x.t);
        break;
      case 'delText':
        break;
      case 'tab':
      case 'ptab':
        if (!dentroDeInstruccion) f.piezas.push({ t: 'tab' });
        break;
      case 'br':
        if (x.a.type === 'page') f.piezas.push({ t: 'pb' });
        else if (x.a.type === 'column') f.piezas.push({ t: 'html', html: '<div style="break-after:column"></div>' });
        else f.piezas.push({ t: 'br' });
        break;
      case 'cr':
        f.piezas.push({ t: 'br' });
        break;
      case 'noBreakHyphen':
        añadirTexto('‑');
        break;
      case 'softHyphen':
        añadirTexto('­');
        break;
      case 'sym': {
        const code = parseInt(x.a.char ?? '', 16);
        if (Number.isFinite(code)) añadirTexto(String.fromCodePoint(code >= 0xf000 ? code : code));
        break;
      }
      case 'drawing':
        f.piezas.push({ t: 'html', html: renderDibujo(x, c, st) });
        break;
      case 'pict':
      case 'object':
        f.piezas.push({ t: 'html', html: renderPict(x, c) });
        break;
      case 'AlternateContent': {
        const sub = hijo(x, 'Choice') ?? hijo(x, 'Fallback');
        for (const y of sub?.h ?? []) {
          if (y.n === 'drawing') f.piezas.push({ t: 'html', html: renderDibujo(y, c, st) });
        }
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference': {
        const nota = c.notasPie.get(`${x.n === 'footnoteReference' ? 'f' : 'e'}:${x.a.id}`);
        if (nota) {
          const numero = c.notasUsadas.length + 1;
          c.notasUsadas.push(`<p class="nota"><sup>${numero}</sup> ${renderBloques(nota.h, c, nuevoEstado(), true)}</p>`);
          f.piezas.push({ t: 'txt', css: `${estilo};vertical-align:super;font-size:${r2((ef.sz ?? 10) * 0.65)}pt`, html: String(numero) });
        }
        break;
      }
      case 'footnoteRef':
      case 'endnoteRef':
        break;
      default:
        break;
    }
  }
}

/** Texto y fórmulas de tabulación → HTML del contenido del párrafo */
function montarPiezas(piezas: Pieza[], tabs: Tabulador[], izq: number): string[] {
  // Se parte por saltos de página; cada trozo se monta por separado
  const trozos: Pieza[][] = [[]];
  for (const p of piezas) {
    if (p.t === 'pb') trozos.push([]);
    else trozos[trozos.length - 1].push(p);
  }
  return trozos.map((t) => montarTrozo(t, tabs, izq));
}

function montarTrozo(piezas: Pieza[], tabs: Tabulador[], izq: number): string {
  const hayTab = piezas.some((p) => p.t === 'tab');
  const unir = (lista: Pieza[]) => {
    const salida: string[] = [];
    let cssActual: string | null = null;
    let acumulado = '';
    const cerrar = () => {
      if (cssActual !== null) salida.push(cssActual ? `<span style="${cssActual}">${acumulado}</span>` : acumulado);
      cssActual = null;
      acumulado = '';
    };
    for (const p of lista) {
      if (p.t === 'txt') {
        if (cssActual !== null && cssActual !== p.css) cerrar();
        cssActual = p.css;
        acumulado += p.html;
      } else {
        cerrar();
        if (p.t === 'br') salida.push('<br>');
        else if (p.t === 'html') salida.push(p.html);
      }
    }
    cerrar();
    return salida.join('');
  };
  if (!hayTab) return unir(piezas);

  // Segmentos separados por tabuladores
  const segmentos: Pieza[][] = [[]];
  for (const p of piezas) {
    if (p.t === 'tab') segmentos.push([]);
    else segmentos[segmentos.length - 1].push(p);
  }
  const paradas = tabs.filter((t) => t.tipo !== 'bar');
  const usaFlex = segmentos.slice(1).some((_, i) => {
    const t = paradas[i];
    return t && (t.tipo === 'right' || t.tipo === 'center');
  });
  if (!usaFlex) {
    // Tabuladores a la izquierda: espacios de ancho fijo hasta la siguiente parada o 36 pt
    const partes: string[] = [unir(segmentos[0])];
    let pos = izq;
    for (let i = 1; i < segmentos.length; i++) {
      const parada = paradas[i - 1];
      const ancho = parada ? Math.max(6, parada.pos - pos) : 36;
      partes.push(`<span style="display:inline-block;width:${r2(ancho)}pt"></span>`, unir(segmentos[i]));
      pos = parada ? parada.pos : pos + 36;
    }
    return partes.join('');
  }
  const partes: string[] = [`<span style="flex:0 1 auto">${unir(segmentos[0])}</span>`];
  let pos = izq;
  for (let i = 1; i < segmentos.length; i++) {
    const parada = paradas[i - 1];
    const contenido = unir(segmentos[i]);
    const relleno = parada?.relleno === 'dot' ? 'dotted' : parada?.relleno === 'hyphen' ? 'dashed' : parada?.relleno === 'underscore' || parada?.relleno === 'heavy' ? 'solid' : '';
    const linea = relleno ? `border-bottom:1px ${relleno} currentColor;margin:0 3pt 0.25em` : '';
    if (parada?.tipo === 'right') {
      partes.push(`<span style="flex:1 1 0;min-width:6pt;${linea}"></span><span style="flex:0 0 auto">${contenido}</span>`);
    } else if (parada?.tipo === 'center') {
      partes.push(`<span style="flex:1 1 0;min-width:6pt;${linea}"></span><span style="flex:0 0 auto">${contenido}</span><span style="flex:1 1 0;min-width:6pt"></span>`);
    } else {
      const ancho = parada ? Math.max(6, parada.pos - pos) : 36;
      partes.push(`<span style="flex:0 0 ${r2(ancho)}pt"></span><span style="flex:0 1 auto">${contenido}</span>`);
    }
    pos = parada ? parada.pos : pos + 36;
  }
  return `<span style="display:flex;align-items:baseline;white-space:pre-wrap">${partes.join('')}</span>`;
}

const BORDE_CSS: Record<string, string> = {
  single: 'solid', thick: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed', dashSmallGap: 'dashed', dotDash: 'dashed', dotDotDash: 'dashed', wave: 'solid', triple: 'double', thinThickSmallGap: 'double', thickThinSmallGap: 'double',
};

function cssBorde(b: Borde | undefined, def = '#000'): string | null {
  if (!b) return null;
  if (b.estilo === 'none') return 'none';
  const estilo = BORDE_CSS[b.estilo] ?? 'solid';
  const ancho = estilo === 'double' ? Math.max(b.ancho, 2.25) : b.ancho;
  return `${r2(ancho)}pt ${estilo} ${b.color ?? def}`;
}

function etiquetaNumeracion(c: Ctx, numId: number, nivel: number): { texto: string; rPr: RPr; hanging: number; sufijo: string; esViñeta: boolean } | null {
  const lvl = nivelDe(c.num, numId, nivel);
  if (!lvl) return null;
  const x = c.num.numeros.get(numId);
  const clave = x && x.reinicios.size === 0 ? 100000 + x.abstracta : numId;
  const cont = c.contadores.get(clave) ?? [];
  const reinicio = x?.reinicios.get(nivel);
  if (cont[nivel] === undefined) cont[nivel] = reinicio ?? lvl.inicio;
  else cont[nivel]++;
  cont.length = nivel + 1;
  c.contadores.set(clave, cont);
  const hanging = Math.max(0, -(lvl.pPr.primera ?? 0));
  if (lvl.formato === 'bullet') return { texto: simboloViñeta(lvl.texto), rPr: lvl.rPr, hanging, sufijo: lvl.sufijo, esViñeta: true };
  const texto = lvl.texto.replace(/%(\d)/g, (_m, d: string) => {
    const k = Number(d) - 1;
    const nivelK = nivelDe(c.num, numId, k);
    const valor = cont[k] ?? nivelK?.inicio ?? 1;
    return formatearNumero(valor, nivelK?.formato ?? 'decimal');
  });
  return { texto, rPr: lvl.rPr, hanging, sufijo: lvl.sufijo, esViñeta: false };
}

function renderParrafo(p: Nodo, c: Ctx, st: Estado, enNota = false, tabla: ContextoTabla | null = null): string {
  const pPrNodo = hijo(p, 'pPr');
  const directo = leerPPr(pPrNodo, c.tema);
  const estiloId = directo.estiloP ?? c.estilos.parrafoDefecto;
  const delEstilo = resolverEstilo(c.estilos, estiloId);
  // Orden de Word: valores por defecto < estilo de tabla < estilo de párrafo < formato condicional de la tabla < formato directo
  let pEf = mezclarPPr(mezclarPPr(c.estilos.pPrDefecto, tabla?.pPr ?? {}), delEstilo.pPr);
  let rBase = mezclarRPr(mezclarRPr(c.estilos.rPrDefecto, tabla?.rPr ?? {}), delEstilo.rPr);
  if (tabla) {
    pEf = mezclarPPr(pEf, tabla.pCond);
    rBase = mezclarRPr(rBase, tabla.rCond);
  }

  // Numeración (estilo o directa)
  const numId = directo.numId ?? pEf.numId;
  const nivel = directo.nivel ?? pEf.nivel ?? 0;
  let etiqueta: ReturnType<typeof etiquetaNumeracion> = null;
  if (numId && numId > 0) {
    etiqueta = etiquetaNumeracion(c, numId, nivel);
    const lvl = nivelDe(c.num, numId, nivel);
    if (lvl) pEf = mezclarPPr(pEf, { ...lvl.pPr, numId: undefined });
  }
  pEf = mezclarPPr(pEf, directo);
  const rMarca = leerRPr(hijo(pPrNodo, 'rPr'), c.tema);

  const f: Fragmento = { piezas: [] };
  procesarRuns(p.h, c, rBase, st, f, null);

  // Contenido y saltos de página
  const trozos = montarPiezas(f.piezas, pEf.tabs ?? [], pEf.izq ?? 0);
  const hayTab = f.piezas.some((x) => x.t === 'tab');

  const sinContenido = f.piezas.every((x) => (x.t === 'txt' ? esBlanco(x.html) : x.t === 'pb' || x.t === 'tab'));
  const soloSalto = f.piezas.some((x) => x.t === 'pb') && sinContenido;

  // Espaciado: el de Word se suma (en CSS los márgenes se solapan), así que todo va en margin-top
  let antes = pEf.antes ?? 0;
  let despuesPrev = st.despues;
  if (estiloId && st.estilo === estiloId && (pEf.contextual || st.contextual)) {
    antes = 0;
    despuesPrev = 0;
  }
  const margenSuperior = antes + despuesPrev;
  st.despues = pEf.despues ?? 0;
  st.estilo = estiloId ?? null;
  st.contextual = !!pEf.contextual;

  const lh = pEf.interlineado;
  let altura: string | null = null;
  if (lh) {
    if (lh.regla === 'auto') altura = Math.abs(lh.valor - 240) < 4 ? null : r2((lh.valor / 240) * 1.15);
    else altura = `${r2(lh.valor / 20)}pt`;
  }
  const izq = pEf.izq ?? 0;
  const primera = pEf.primera ?? 0;
  const bordes = pEf.bordes;
  const textoAlinea = pEf.jc === 'center' ? 'center' : pEf.jc === 'right' ? 'right' : pEf.jc === 'both' || pEf.jc === 'distribute' || pEf.jc === 'thaiDistribute' ? 'justify' : pEf.bidi ? 'right' : 'left';

  const estiloP = css(
    cssBaseTexto(rMarca.sz !== undefined && !f.piezas.length ? mezclarRPr(rBase, rMarca) : rBase, c),
    `text-align:${textoAlinea}`,
    margenSuperior ? `margin-top:${r2(margenSuperior)}pt` : false,
    izq ? `margin-left:${r2(izq)}pt` : false,
    pEf.der ? `margin-right:${r2(pEf.der)}pt` : false,
    primera ? `text-indent:${r2(primera)}pt` : false,
    altura ? `line-height:${altura}` : false,
    pEf.fondo ? `background:${pEf.fondo}` : false,
    bordes?.top ? `border-top:${cssBorde(bordes.top)};padding-top:2pt` : false,
    bordes?.bottom ? `border-bottom:${cssBorde(bordes.bottom)};padding-bottom:2pt` : false,
    bordes?.left ? `border-left:${cssBorde(bordes.left)};padding-left:4pt` : false,
    bordes?.right ? `border-right:${cssBorde(bordes.right)};padding-right:4pt` : false,
    pEf.saltoAntes ? 'break-before:page' : false,
    pEf.mantener ? 'break-after:avoid' : false,
    pEf.bidi ? 'direction:rtl' : false,
    hayTab ? 'white-space:pre-wrap' : false,
  );

  // Etiqueta de numeración
  let prefijo = '';
  if (etiqueta && etiqueta.sufijo !== 'nothing' && (etiqueta.texto || etiqueta.esViñeta)) {
    const rEtiqueta = mezclarRPr(mezclarRPr(rBase, etiqueta.rPr), { fuente: etiqueta.esViñeta ? 'Arial' : etiqueta.rPr.fuente });
    const estiloEtiqueta = css(
      cssDeRPr(rEtiqueta, rBase, c),
      'display:inline-block',
      'text-indent:0',
      etiqueta.sufijo === 'tab' ? `min-width:${r2(Math.max(etiqueta.hanging, 12))}pt` : 'padding-right:0.3em',
    );
    prefijo = `<span style="${estiloEtiqueta}">${escaparHtml(etiqueta.texto)}</span>`;
  }

  if (soloSalto) return trozos.slice(0, -1).map(() => '<div class="pb"></div>').join('');

  const piezasHtml: string[] = [];
  trozos.forEach((t, i) => {
    const ultimo = i === trozos.length - 1;
    const vacio = !t || esBlanco(t.replace(/<[^>]*>/g, ''));
    if (vacio && !(i === 0 && ultimo) && !t.includes('<img')) {
      if (!ultimo || trozos.length > 1) {
        // trozo vacío junto a un salto de página: no se emite
      }
    } else {
      const contenido = (i === 0 ? prefijo : '') + (t || '<br>');
      const estiloTrozo = i === 0 ? estiloP : estiloP.replace(/margin-top:[^;]+;?/, '').replace(/break-before:page;?/, '');
      piezasHtml.push(`<p style="${estiloTrozo}">${contenido}</p>`);
    }
    if (!ultimo) piezasHtml.push('<div class="pb"></div>');
  });
  void enNota;
  return piezasHtml.join('');
}

/* ───────── Tablas ───────── */

interface CeldaInfo {
  nodo: Nodo;
  col: number;
  span: number;
  vm: 'restart' | 'cont' | null;
  fila: number;
  alto: number;
}

function renderTabla(t: Nodo, c: Ctx): string {
  const tblPr = hijo(t, 'tblPr');
  const estiloId = hijo(tblPr, 'tblStyle')?.a.val ?? c.estilos.tablaDefecto;
  const est = estiloId ? c.estilos.mapa.get(estiloId) : undefined;
  const cadena: typeof est[] = [];
  {
    const vistos = new Set<string>();
    let a = est;
    while (a && !vistos.has(a.id)) {
      vistos.add(a.id);
      cadena.unshift(a);
      a = a.basadoEn ? c.estilos.mapa.get(a.basadoEn) : undefined;
    }
  }
  let bordesTabla: Record<string, Borde | undefined> = {};
  let fondoTabla: string | undefined;
  let margenTabla: { top?: number; bottom?: number; left?: number; right?: number } = { left: 5.4, right: 5.4, top: 0, bottom: 0 };
  let bandaFilas = 1;
  let pTabla: PPr = {};
  let rTabla: RPr = {};
  for (const e of cadena) {
    if (e) {
      pTabla = mezclarPPr(pTabla, e.pPr);
      rTabla = mezclarRPr(rTabla, e.rPr);
    }
    if (!e?.tabla) continue;
    bordesTabla = { ...bordesTabla, ...e.tabla.bordes };
    if (e.tabla.fondo) fondoTabla = e.tabla.fondo;
    margenTabla = { ...margenTabla, ...e.tabla.margen };
    bandaFilas = e.tabla.bandaFilas || 1;
  }
  bordesTabla = { ...bordesTabla, ...leerBordes(hijo(tblPr, 'tblBorders'), c.tema) };
  margenTabla = { ...margenTabla, ...leerMargenTabla(hijo(tblPr, 'tblCellMar')) };
  const shdTabla = hijo(tblPr, 'shd');
  if (shdTabla) fondoTabla = colorWord(shdTabla, c.tema, 'fill') ?? fondoTabla;
  const look = hijo(tblPr, 'tblLook');
  const val = look?.a.val ? parseInt(look.a.val, 16) : 0x04a0;
  const bandasFilas = look?.a.noHBand !== undefined ? look.a.noHBand === '0' : !(val & 0x0200);
  const lookFlags = {
    firstRow: look?.a.firstRow !== undefined ? look.a.firstRow === '1' : !!(val & 0x0020),
    lastRow: look?.a.lastRow !== undefined ? look.a.lastRow === '1' : !!(val & 0x0040),
    firstCol: look?.a.firstColumn !== undefined ? look.a.firstColumn === '1' : !!(val & 0x0080),
    lastCol: look?.a.lastColumn !== undefined ? look.a.lastColumn === '1' : !!(val & 0x0100),
  };

  // Rejilla
  const anchosGrid = hijos(hijo(t, 'tblGrid'), 'gridCol').map((g) => num(g, 'w') / 20);
  const filas = hijos(t, 'tr');
  const info: CeldaInfo[][] = filas.map((tr, fi) => {
    const trPr = hijo(tr, 'trPr');
    let col = num(hijo(trPr, 'gridBefore'), 'val', 0);
    const alto = num(hijo(trPr, 'trHeight'), 'val', 0) / 20;
    const celdas: CeldaInfo[] = [];
    for (const tc of tr.h.filter((x) => x.n === 'tc' || x.n === 'sdt')) {
      const nodos = tc.n === 'sdt' ? hijos(hijo(tc, 'sdtContent'), 'tc') : [tc];
      for (const nd of nodos) {
        const tcPr = hijo(nd, 'tcPr');
        const span = Math.max(1, num(hijo(tcPr, 'gridSpan'), 'val', 1));
        const vmNodo = hijo(tcPr, 'vMerge');
        const vm = vmNodo ? (vmNodo.a.val === 'restart' ? 'restart' : 'cont') : null;
        celdas.push({ nodo: nd, col, span, vm, fila: fi, alto });
        col += span;
      }
    }
    return celdas;
  });
  const totalCols = Math.max(anchosGrid.length, ...info.map((f) => (f.length ? f[f.length - 1].col + f[f.length - 1].span : 0)), 1);
  while (anchosGrid.length < totalCols) anchosGrid.push(anchosGrid.length ? anchosGrid[anchosGrid.length - 1] : 60);

  const anchoTotal = anchosGrid.reduce((a, b) => a + b, 0);
  const tblW = hijo(tblPr, 'tblW');
  let anchoCss = `${r2(anchoTotal)}pt`;
  if (tblW?.a.type === 'pct') anchoCss = `${r2(num(tblW, 'w') / 50)}%`;
  else if (tblW?.a.type === 'dxa' && num(tblW, 'w') > 0) anchoCss = `${r2(num(tblW, 'w') / 20)}pt`;
  const jc = hijo(tblPr, 'jc')?.a.val;
  const ind = num(hijo(tblPr, 'tblInd'), 'w') / 20;
  const margen = jc === 'center' ? 'margin-left:auto;margin-right:auto' : jc === 'right' || jc === 'end' ? 'margin-left:auto' : ind ? `margin-left:${r2(ind)}pt` : '';

  const colgroup = `<colgroup>${anchosGrid.map((w) => `<col style="width:${r2(w)}pt">`).join('')}</colgroup>`;
  const filasHtml: string[] = [];
  let encabezados = 0;
  const lastRow = filas.length - 1;

  filas.forEach((tr, fi) => {
    const trPr = hijo(tr, 'trPr');
    const esEncabezado = !!hijo(trPr, 'tblHeader');
    if (esEncabezado && encabezados === fi) encabezados++;
    const celdas = info[fi];
    const tds: string[] = [];
    for (const ce of celdas) {
      if (ce.vm === 'cont') continue;
      let rowspan = 1;
      if (ce.vm === 'restart') {
        for (let k = fi + 1; k < filas.length; k++) {
          const sig = info[k].find((x) => x.col === ce.col);
          if (sig && sig.vm === 'cont') rowspan++;
          else break;
        }
      }
      const tcPr = hijo(ce.nodo, 'tcPr');
      // Formato condicional del estilo de tabla
      const condiciones: string[] = [];
      if (lookFlags.firstRow && fi === 0) condiciones.push('firstRow');
      if (lookFlags.lastRow && fi === lastRow) condiciones.push('lastRow');
      if (lookFlags.firstCol && ce.col === 0) condiciones.push('firstCol');
      if (lookFlags.lastCol && ce.col + ce.span >= totalCols) condiciones.push('lastCol');
      if (bandasFilas) {
        const idx = fi - (lookFlags.firstRow ? 1 : 0);
        if (idx >= 0) condiciones.push(Math.floor(idx / bandaFilas) % 2 === 0 ? 'band1Horz' : 'band2Horz');
      }
      let fondo: string | undefined = fondoTabla;
      let rCondicion: RPr = {};
      let pCondicion: PPr = {};
      let bordesCond: Record<string, Borde | undefined> = {};
      for (const e of cadena) {
        for (const cond of e?.condiciones ?? []) {
          if (!condiciones.includes(cond.tipo)) continue;
          if (cond.fondo) fondo = cond.fondo;
          rCondicion = mezclarRPr(rCondicion, cond.rPr);
          pCondicion = mezclarPPr(pCondicion, cond.pPr);
          bordesCond = { ...bordesCond, ...cond.bordes };
        }
      }
      const shd = hijo(tcPr, 'shd');
      const fondoCelda = shd ? colorWord(shd, c.tema, 'fill') : undefined;
      if (fondoCelda && fondoCelda !== 'auto') fondo = fondoCelda;
      else if (shd && fondoCelda === 'auto') fondo = undefined;

      const bd = leerBordes(hijo(tcPr, 'tcBorders'), c.tema);
      const lado = (nombre: 'top' | 'bottom' | 'left' | 'right'): string | null => {
        if (bd[nombre]) return cssBorde(bd[nombre]);
        if (bordesCond[nombre]) return cssBorde(bordesCond[nombre]);
        const inicioFila = nombre === 'top' && fi === 0;
        const finFila = nombre === 'bottom' && fi + rowspan - 1 === lastRow;
        const inicioCol = nombre === 'left' && ce.col === 0;
        const finCol = nombre === 'right' && ce.col + ce.span >= totalCols;
        const ext = inicioFila || finFila || inicioCol || finCol;
        const b = ext ? bordesTabla[nombre] : bordesTabla[nombre === 'top' || nombre === 'bottom' ? 'insideH' : 'insideV'];
        return cssBorde(b);
      };
      const mt = margenTabla;
      const mc = leerMargenTabla(hijo(tcPr, 'tcMar'));
      const pad = { top: mc.top ?? mt.top ?? 0, bottom: mc.bottom ?? mt.bottom ?? 0, left: mc.left ?? mt.left ?? 5.4, right: mc.right ?? mt.right ?? 5.4 };
      const va = hijo(tcPr, 'vAlign')?.a.val;

      // Contenido de la celda
      const stCelda = nuevoEstado();
      const anteriorAncho = c.anchoTexto;
      c.anchoTexto = Math.max(20, anchosGrid.slice(ce.col, ce.col + ce.span).reduce((a, b) => a + b, 0) - pad.left - pad.right);
      let contenido = renderBloques(ce.nodo.h, c, stCelda, false, { pPr: pTabla, rPr: rTabla, pCond: pCondicion, rCond: rCondicion });
      c.anchoTexto = anteriorAncho;
      if (!contenido) contenido = '<p style="margin:0;font-size:10pt"><br></p>';
      const bt = lado('top');
      const bb = lado('bottom');
      const bl = lado('left');
      const br = lado('right');
      const estiloTd = css(
        `padding:${r2(pad.top)}pt ${r2(pad.right)}pt ${r2(pad.bottom + stCelda.despues)}pt ${r2(pad.left)}pt`,
        bt && `border-top:${bt}`, bb && `border-bottom:${bb}`, bl && `border-left:${bl}`, br && `border-right:${br}`,
        fondo && fondo !== 'auto' ? `background:${fondo}` : false,
        va === 'center' ? 'vertical-align:middle' : va === 'bottom' ? 'vertical-align:bottom' : 'vertical-align:top',
        hijo(tcPr, 'noWrap') ? 'white-space:nowrap' : false,
      );
      tds.push(`<td${ce.span > 1 ? ` colspan="${ce.span}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''} style="${estiloTd}">${contenido}</td>`);
    }
    const altoFila = celdas[0]?.alto ?? 0;
    const estiloTr = css(altoFila ? `height:${r2(altoFila)}pt` : false, hijo(trPr, 'cantSplit') ? 'break-inside:avoid' : false);
    filasHtml.push(`<tr${estiloTr ? ` style="${estiloTr}"` : ''}>${tds.join('')}</tr>`);
  });

  const cabecera = encabezados > 0 ? `<thead>${filasHtml.slice(0, encabezados).join('')}</thead><tbody>${filasHtml.slice(encabezados).join('')}</tbody>` : `<tbody>${filasHtml.join('')}</tbody>`;
  return `<table style="border-collapse:collapse;table-layout:fixed;width:${anchoCss};max-width:100%;${margen};${fondoTabla ? `background:${fondoTabla};` : ''}font-size:10pt">${colgroup}${cabecera}</table>`;
}

/* ───────── Flujo de bloques ───────── */

function renderBloques(nodos: Nodo[], c: Ctx, st: Estado, enNota = false, tabla: ContextoTabla | null = null): string {
  const salida: string[] = [];
  const recorrer = (lista: Nodo[]) => {
    for (const n of lista) {
      if (n.n === 'p') salida.push(renderParrafo(n, c, st, enNota, tabla));
      else if (n.n === 'tbl') {
        salida.push(renderTabla(n, c));
        st.despues = 0;
        st.estilo = null;
      } else if (n.n === 'sdt') recorrer(hijo(n, 'sdtContent')?.h ?? []);
      else if (n.n === 'AlternateContent') recorrer((hijo(n, 'Choice') ?? hijo(n, 'Fallback'))?.h ?? []);
    }
  };
  recorrer(nodos);
  return salida.join('');
}

/* ───────── Página, encabezados y pies ───────── */

interface Pagina {
  nombre: string;
  ancho: number;
  alto: number;
  arriba: number;
  derecha: number;
  abajo: number;
  izquierda: number;
  columnas: number;
  separacion: number;
  continua: boolean;
  tituloAparte: boolean;
  encabezado: Nodo | null;
  pie: Nodo | null;
  encabezadoPrimero: Nodo | null;
  pieprimero: Nodo | null;
}

async function leerPagina(sect: Nodo | undefined, rels: Map<string, Relacion>, paquete: Paquete, nombre: string, previa: Pagina | null): Promise<Pagina> {
  const pgSz = hijo(sect, 'pgSz');
  const pgMar = hijo(sect, 'pgMar');
  const cols = hijo(sect, 'cols');
  const cargarParte = async (tipo: string, rol: 'headerReference' | 'footerReference'): Promise<Nodo | null | undefined> => {
    const ref = hijos(sect, rol).find((x) => (x.a.type ?? 'default') === tipo);
    if (!ref) return undefined;
    const rel = rels.get(ref.a.id ?? '');
    return rel ? paquete.xml(rel.destino) : null;
  };
  const enc = await cargarParte('default', 'headerReference');
  const pie = await cargarParte('default', 'footerReference');
  const encP = await cargarParte('first', 'headerReference');
  const pieP = await cargarParte('first', 'footerReference');
  const ancho = num(pgSz, 'w', 11906) / 20;
  const alto = num(pgSz, 'h', 16838) / 20;
  return {
    nombre,
    ancho,
    alto,
    arriba: Math.abs(num(pgMar, 'top', 1417)) / 20,
    derecha: num(pgMar, 'right', 1417) / 20,
    abajo: Math.abs(num(pgMar, 'bottom', 1417)) / 20,
    izquierda: num(pgMar, 'left', 1417) / 20,
    columnas: Math.max(1, num(cols, 'num', 1)),
    separacion: num(cols, 'space', 708) / 20,
    continua: hijo(sect, 'type')?.a.val === 'continuous',
    tituloAparte: !!hijo(sect, 'titlePg'),
    encabezado: enc === undefined ? (previa?.encabezado ?? null) : enc,
    pie: pie === undefined ? (previa?.pie ?? null) : pie,
    encabezadoPrimero: encP === undefined ? (previa?.encabezadoPrimero ?? null) : encP,
    pieprimero: pieP === undefined ? (previa?.pieprimero ?? null) : pieP,
  };
}

type Posicion = 'left' | 'center' | 'right';

interface TextoMargen {
  posicion: Posicion;
  partes: string[];
  estilo: string;
}

const cadenaCss = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\A ')}"`;

function textosMargen(raiz: Nodo | null, c: Ctx): TextoMargen[] {
  if (!raiz) return [];
  const resultado: TextoMargen[] = [];
  for (const p of raiz.h.filter((x) => x.n === 'p')) {
    const directo = leerPPr(hijo(p, 'pPr'), c.tema);
    const delEstilo = resolverEstilo(c.estilos, directo.estiloP ?? c.estilos.parrafoDefecto);
    const pEf = mezclarPPr(c.estilos.pPrDefecto, mezclarPPr(delEstilo.pPr, directo));
    const rBase = mezclarRPr(c.estilos.rPrDefecto, delEstilo.rPr);
    const paradas = (pEf.tabs ?? []).filter((t) => t.tipo !== 'bar');
    let segmento = 0;
    const porSegmento: string[][] = [[]];
    let campo: { instr: string; separado: boolean } | null = null;
    let rUsado = rBase;
    const recorrerRuns = (lista: Nodo[]) => {
      for (const r of lista) {
        if (r.n === 'hyperlink' || r.n === 'ins' || r.n === 'smartTag' || r.n === 'fldSimple' || r.n === 'sdt') {
          if (r.n === 'fldSimple') {
            const instr = (r.a.instr ?? '').trim().toUpperCase();
            if (instr.startsWith('PAGE')) porSegmento[segmento].push('counter(page)');
            else if (instr.startsWith('NUMPAGES') || instr.startsWith('SECTIONPAGES')) porSegmento[segmento].push('counter(pages)');
            else recorrerRuns(r.h);
            continue;
          }
          recorrerRuns(r.n === 'sdt' ? (hijo(r, 'sdtContent')?.h ?? []) : r.h);
          continue;
        }
        if (r.n !== 'r') continue;
        const rp = leerRPr(hijo(r, 'rPr'), c.tema);
        rUsado = mezclarRPr(rUsado, rp);
        for (const x of r.h) {
          if (x.n === 'fldChar') {
            if (x.a.fldCharType === 'begin') campo = { instr: '', separado: false };
            else if (x.a.fldCharType === 'separate' && campo) campo.separado = true;
            else if (x.a.fldCharType === 'end' && campo) {
              const i = campo.instr.trim().toUpperCase();
              if (i.startsWith('PAGE')) porSegmento[segmento].push('counter(page)');
              else if (i.startsWith('NUMPAGES') || i.startsWith('SECTIONPAGES')) porSegmento[segmento].push('counter(pages)');
              campo = null;
            }
          } else if (x.n === 'instrText') {
            if (campo) campo.instr += x.t;
          } else if (x.n === 't') {
            if (!campo) porSegmento[segmento].push(cadenaCss(x.t));
            else if (campo.separado) {
              const i = campo.instr.trim().toUpperCase();
              if (!i.startsWith('PAGE') && !i.startsWith('NUMPAGES') && !i.startsWith('SECTIONPAGES')) porSegmento[segmento].push(cadenaCss(x.t));
            }
          } else if (x.n === 'tab') {
            segmento++;
            porSegmento[segmento] = [];
          } else if (x.n === 'drawing' || x.n === 'pict') {
            c.avisos.add('Los encabezados y pies de página se simplifican: solo se conserva su texto y la numeración.');
          }
        }
      }
    };
    recorrerRuns(p.h);
    const estilo = css(
      `font-size:${r2(rUsado.sz ?? 10)}pt`,
      rUsado.color && rUsado.color !== 'auto' ? `color:${rUsado.color}` : false,
      rUsado.b ? 'font-weight:700' : false,
      rUsado.i ? 'font-style:italic' : false,
      familiaCss(resolverFuente(rUsado.fuente, c.tema) ?? c.tema.fuenteTexto) ? `font-family:${familiaCss(resolverFuente(rUsado.fuente, c.tema) ?? c.tema.fuenteTexto)}` : false,
    );
    porSegmento.forEach((partes, i) => {
      if (!partes.length) return;
      let pos: Posicion;
      if (porSegmento.length === 1) pos = pEf.jc === 'center' ? 'center' : pEf.jc === 'right' ? 'right' : 'left';
      else if (i === 0) pos = 'left';
      else {
        const t = paradas[i - 1];
        pos = t?.tipo === 'center' ? 'center' : t?.tipo === 'right' || !t ? (t ? 'right' : i === 1 ? 'center' : 'right') : 'left';
      }
      resultado.push({ posicion: pos, partes, estilo });
    });
  }
  return resultado;
}

function reglasMargen(prefijo: 'top' | 'bottom', textos: TextoMargen[]): string {
  const posiciones: Posicion[] = ['left', 'center', 'right'];
  return posiciones
    .map((pos) => {
      const delPos = textos.filter((t) => t.posicion === pos);
      if (!delPos.length) return `@${prefijo}-${pos}{content:none}`;
      const contenido: string[] = [];
      delPos.forEach((t, i) => {
        if (i > 0) contenido.push(cadenaCss('\n'));
        contenido.push(...t.partes);
      });
      return `@${prefijo}-${pos}{content:${contenido.join(' ')};white-space:pre-wrap;${delPos[0].estilo};vertical-align:${prefijo === 'top' ? 'bottom' : 'top'};${prefijo === 'top' ? 'padding-bottom' : 'padding-top'}:6pt}`;
    })
    .join('');
}

function cssPagina(p: Pagina, c: Ctx): string {
  const base = `@page ${p.nombre}{size:${r2(p.ancho)}pt ${r2(p.alto)}pt;margin:${r2(p.arriba)}pt ${r2(p.derecha)}pt ${r2(p.abajo)}pt ${r2(p.izquierda)}pt;${reglasMargen('top', textosMargen(p.encabezado, c))}${reglasMargen('bottom', textosMargen(p.pie, c))}}`;
  if (!p.tituloAparte) return base;
  const primera = `@page ${p.nombre}:first{${reglasMargen('top', textosMargen(p.encabezadoPrimero, c))}${reglasMargen('bottom', textosMargen(p.pieprimero, c))}}`;
  return base + primera;
}

/* ───────── Punto de entrada ───────── */

export async function docxAHtml(datos: Uint8Array): Promise<ResultadoOffice> {
  const paquete = await Paquete.abrir(datos);
  const documento = await paquete.xml('word/document.xml');
  if (!documento) throw new Error('El archivo no contiene un documento de Word (falta word/document.xml). Si es un .doc antiguo, guárdalo como .docx.');
  const rels = await paquete.relaciones('word/document.xml');
  const tema = leerTema(await paquete.xml('word/theme/theme1.xml'));
  const estilos = leerEstilos(await paquete.xml('word/styles.xml'), tema);
  const numeracion = leerNumeracion(await paquete.xml('word/numbering.xml'), tema);

  const imagenes = new Map<string, string>();
  for (const rel of rels.values()) {
    if (rel.externo || !rel.tipo.endsWith('/image')) continue;
    const d = await imagenComoDatos(paquete, rel.destino);
    if (d) imagenes.set(rel.destino, d.uri);
  }
  const graficos = new Map<string, Nodo>();
  for (const rel of rels.values()) {
    if (rel.externo || !rel.tipo.endsWith('/chart')) continue;
    const raiz = await paquete.xml(rel.destino);
    if (raiz) graficos.set(rel.destino, raiz);
  }
  const notasPie = new Map<string, Nodo>();
  for (const [archivo, tipo, nombre] of [['word/footnotes.xml', 'f', 'footnote'], ['word/endnotes.xml', 'e', 'endnote']] as const) {
    const x = await paquete.xml(archivo);
    for (const n of hijos(x, nombre)) {
      if (n.a.type === 'separator' || n.a.type === 'continuationSeparator' || n.a.type === 'continuationNotice') continue;
      notasPie.set(`${tipo}:${n.a.id}`, n);
    }
  }

  const ctx: Ctx = {
    tema, estilos, num: numeracion, rels, imagenes, graficos, contadores: new Map(), avisos: new Set(), notasPie, notasUsadas: [], campos: [],
    anchoTexto: 450, izquierdaPagina: 72, superiorPagina: 72,
  };

  const cuerpo = hijo(documento, 'body');
  if (!cuerpo) throw new Error('El documento de Word está vacío.');

  // Secciones: cada párrafo con sectPr cierra una sección; la última está al final del cuerpo
  interface Seccion { sect: Nodo | undefined; nodos: Nodo[] }
  const secciones: Seccion[] = [];
  let actuales: Nodo[] = [];
  for (const n of cuerpo.h) {
    if (n.n === 'sectPr') continue;
    actuales.push(n);
    const sp = n.n === 'p' ? ruta(n, 'pPr', 'sectPr') : undefined;
    if (sp) {
      secciones.push({ sect: sp, nodos: actuales });
      actuales = [];
    }
  }
  secciones.push({ sect: hijo(cuerpo, 'sectPr'), nodos: actuales });

  const reglas: string[] = [];
  const bloques: string[] = [];
  const paginasPorClave = new Map<string, Pagina>();
  let previa: Pagina | null = null;
  let anterior: Pagina | null = null;
  for (let i = 0; i < secciones.length; i++) {
    const s = secciones[i];
    if (!s.nodos.length && i < secciones.length - 1 && secciones.length > 1) continue;
    const pagina = await leerPagina(s.sect, rels, paquete, `s${i + 1}`, previa);
    previa = pagina;
    const clave = [pagina.ancho, pagina.alto, pagina.arriba, pagina.derecha, pagina.abajo, pagina.izquierda, pagina.encabezado ? 1 : 0, pagina.pie ? 1 : 0].join('|') + (pagina.encabezado ? JSON.stringify(pagina.encabezado).length : '');
    const existente = paginasPorClave.get(clave);
    const usada = existente ?? pagina;
    if (!existente) {
      paginasPorClave.set(clave, pagina);
      ctx.izquierdaPagina = pagina.izquierda;
      ctx.superiorPagina = pagina.arriba;
      reglas.push(cssPagina(pagina, ctx));
    }
    ctx.anchoTexto = pagina.ancho - pagina.izquierda - pagina.derecha;
    ctx.izquierdaPagina = pagina.izquierda;
    ctx.superiorPagina = pagina.arriba;
    const html = renderBloques(s.nodos, ctx, nuevoEstado());
    const saltoPagina = anterior && !pagina.continua && existente === anterior;
    const columnas = pagina.columnas > 1 ? `column-count:${pagina.columnas};column-gap:${r2(pagina.separacion)}pt;` : '';
    bloques.push(`<section style="page:${usada.nombre};${saltoPagina ? 'break-before:page;' : ''}${columnas}">${html}</section>`);
    anterior = usada;
  }

  const notas = ctx.notasUsadas.length ? `<section class="notas"><hr style="width:30%;margin:12pt 0 6pt;border:0;border-top:0.5pt solid #000">${ctx.notasUsadas.join('')}</section>` : '';
  const hoja = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:${familiaCss(tema.fuenteTexto ?? 'Calibri')};-webkit-print-color-adjust:exact;print-color-adjust:exact}p{margin:0;overflow-wrap:break-word;widows:2;orphans:2}table{border-spacing:0}td{overflow-wrap:break-word}img{max-width:100%}.pb{break-after:page;height:0;margin:0}.nota{margin:0 0 3pt;font-size:8.5pt}.nota p{display:inline;margin:0}section{display:block}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Documento</title><style>${hoja}${reglas.join('')}</style></head><body>${bloques.join('')}${notas}</body></html>`;
  return { html, avisos: [...ctx.avisos] };
}
