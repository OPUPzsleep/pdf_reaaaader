// Gráficos de Office (DrawingML Chart) → SVG. Se dibujan los tipos habituales (columnas, barras, líneas, áreas, sectores, anillos y dispersión)
// a partir de los datos en caché que guarda el propio archivo.
import { colorDrawingMl, escaparHtml, r2, type Tema } from './comun';
import { formatearValor, type OpcionesFormato } from './xlsxFormato';
import { descendiente, descendientes, hijo, hijos, num, ruta, type Nodo } from './xml';

export interface ResultadoGrafico {
  /** Fragmento SVG (sin etiqueta <svg> exterior): coordenadas en pt dentro de ancho × alto */
  svg: string;
  /** Mensaje si hubo que simplificar o no se pudo dibujar */
  aviso?: string;
}

interface Serie {
  nombre: string;
  categorias: string[];
  valores: (number | null)[];
  x?: (number | null)[];
  color: string | null;
  puntos: Map<number, string>;
  formato: string;
  etiquetas: Etiquetas | null;
  suave: boolean;
  marcador: boolean;
}

interface Etiquetas {
  valor: boolean;
  porcentaje: boolean;
  categoria: boolean;
  serie: boolean;
  posicion: string;
  formato: string;
}

type TipoGrafico = 'barra' | 'linea' | 'area' | 'sector' | 'anillo' | 'dispersion';

interface Grupo {
  tipo: TipoGrafico;
  horizontal: boolean;
  agrupacion: 'estandar' | 'apilada' | 'porcentaje';
  series: Serie[];
  separacion: number;
  solape: number;
  anguloInicial: number;
  agujero: number;
  conMarcadores: boolean;
}

const TIPOS: Record<string, TipoGrafico> = {
  barChart: 'barra', bar3DChart: 'barra', lineChart: 'linea', line3DChart: 'linea', areaChart: 'area', area3DChart: 'area',
  pieChart: 'sector', pie3DChart: 'sector', ofPieChart: 'sector', doughnutChart: 'anillo', scatterChart: 'dispersion',
};

const FUENTE = "Calibri, Carlito, 'Segoe UI', 'Liberation Sans', Arial, sans-serif";

/* ───────── Lectura de datos ───────── */

function puntosDe(cache: Nodo | undefined): { n: number; valores: Map<number, string>; formato: string } {
  const valores = new Map<number, string>();
  for (const p of hijos(cache, 'pt')) valores.set(num(p, 'idx'), hijo(p, 'v')?.t ?? '');
  return { n: num(hijo(cache, 'ptCount'), 'val', valores.size ? Math.max(...valores.keys()) + 1 : 0), valores, formato: hijo(cache, 'formatCode')?.t ?? 'General' };
}

function referencia(n: Nodo | undefined): Nodo | undefined {
  return hijo(n, 'numRef') ?? hijo(n, 'strRef') ?? hijo(n, 'multiLvlStrRef') ?? hijo(n, 'numLit') ?? hijo(n, 'strLit');
}

function cadenas(n: Nodo | undefined): string[] {
  const ref = referencia(n);
  const cache = hijo(ref, 'strCache') ?? hijo(ref, 'numCache') ?? hijo(ref, 'multiLvlStrCache') ?? (ref && ref.n.endsWith('Lit') ? ref : undefined);
  if (!cache) return [];
  // multiLvlStrCache: los niveles más internos van primero; se usa el primero
  const base = cache.n === 'multiLvlStrCache' ? hijo(cache, 'lvl') : cache;
  const { n: cuantos, valores } = puntosDe(base);
  return Array.from({ length: cuantos }, (_, i) => valores.get(i) ?? '');
}

function numeros(n: Nodo | undefined): { valores: (number | null)[]; formato: string } {
  const ref = referencia(n);
  const cache = hijo(ref, 'numCache') ?? (ref?.n === 'numLit' ? ref : undefined);
  if (!cache) return { valores: [], formato: 'General' };
  const { n: cuantos, valores, formato } = puntosDe(cache);
  return { valores: Array.from({ length: cuantos }, (_, i) => (valores.has(i) && valores.get(i) !== '' && Number.isFinite(Number(valores.get(i))) ? Number(valores.get(i)) : null)), formato };
}

function textoRico(n: Nodo | undefined): string {
  return descendientes(n, 't').map((x) => x.t).join('');
}

function leerEtiquetas(d: Nodo | undefined): Etiquetas | null {
  if (!d || hijo(d, 'delete')?.a.val === '1') return null;
  const si = (k: string) => hijo(d, k)?.a.val === '1' || hijo(d, k)?.a.val === 'true';
  const e: Etiquetas = { valor: si('showVal'), porcentaje: si('showPercent'), categoria: si('showCatName'), serie: si('showSerName'), posicion: hijo(d, 'dLblPos')?.a.val ?? '', formato: hijo(d, 'numFmt')?.a.formatCode ?? '' };
  return e.valor || e.porcentaje || e.categoria || e.serie ? e : null;
}

function colorDeSpPr(spPr: Nodo | undefined, tema: Tema, linea = false): string | null {
  const n = linea ? hijo(spPr, 'ln') : spPr;
  const solido = hijo(n, 'solidFill');
  if (solido) return colorDrawingMl(solido.h[0], tema);
  const grad = hijo(n, 'gradFill');
  if (grad) return colorDrawingMl(hijo(hijo(grad, 'gsLst'), 'gs')?.h[0], tema);
  return null;
}

const ACENTOS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

function colorPorDefecto(i: number, tema: Tema): string {
  const base = tema.colores[ACENTOS[i % 6]] ?? '#4472c4';
  const vuelta = Math.floor(i / 6);
  if (!vuelta) return base;
  const h = base.replace('#', '');
  const k = vuelta === 1 ? 0.65 : 1.45;
  return '#' + [0, 2, 4].map((p) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(p, p + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
}

function leerGrupos(area: Nodo, tema: Tema): { grupos: Grupo[]; noAdmitido: string | null } {
  const grupos: Grupo[] = [];
  let noAdmitido: string | null = null;
  let indiceSerie = 0;
  for (const g of area.h) {
    const tipo = TIPOS[g.n];
    if (!tipo) {
      if (/Chart$/.test(g.n)) noAdmitido = g.n.replace(/Chart$/, '').replace(/3D$/, '');
      continue;
    }
    const agr = hijo(g, 'grouping')?.a.val;
    const grupo: Grupo = {
      tipo,
      horizontal: hijo(g, 'barDir')?.a.val === 'bar',
      agrupacion: agr === 'stacked' ? 'apilada' : agr === 'percentStacked' ? 'porcentaje' : 'estandar',
      series: [],
      separacion: num(hijo(g, 'gapWidth'), 'val', 150) / 100,
      solape: num(hijo(g, 'overlap'), 'val', 0) / 100,
      anguloInicial: num(hijo(g, 'firstSliceAng'), 'val', 0),
      agujero: num(hijo(g, 'holeSize'), 'val', 50) / 100,
      conMarcadores: hijo(g, 'scatterStyle')?.a.val !== 'lineMarker' ? true : true,
    };
    const etiquetasGrupo = leerEtiquetas(hijo(g, 'dLbls'));
    const varia = hijo(g, 'varyColors')?.a.val !== '0';
    for (const s of hijos(g, 'ser')) {
      const nombre = textoRico(hijo(s, 'tx')) || cadenas(hijo(s, 'tx'))[0] || `Serie ${indiceSerie + 1}`;
      const val = numeros(hijo(s, 'val') ?? hijo(s, 'yVal'));
      const x = tipo === 'dispersion' ? numeros(hijo(s, 'xVal')).valores : undefined;
      let categorias = cadenas(hijo(s, 'cat'));
      if (!categorias.length && x) categorias = x.map((v) => (v === null ? '' : String(v)));
      const colorPropio = colorDeSpPr(hijo(s, 'spPr'), tema, tipo === 'linea' || tipo === 'dispersion');
      const puntos = new Map<number, string>();
      for (const p of hijos(s, 'dPt')) {
        const c = colorDeSpPr(hijo(p, 'spPr'), tema);
        if (c) puntos.set(num(hijo(p, 'idx'), 'val'), c);
      }
      const marcadorOculto = hijo(hijo(s, 'marker'), 'symbol')?.a.val === 'none';
      grupo.series.push({
        nombre, categorias, valores: val.valores, x, color: colorPropio ?? (varia && (tipo === 'sector' || tipo === 'anillo') ? null : colorPorDefecto(indiceSerie, tema)), puntos,
        formato: val.formato, etiquetas: leerEtiquetas(hijo(s, 'dLbls')) ?? etiquetasGrupo, suave: hijo(s, 'smooth')?.a.val === '1', marcador: !marcadorOculto && (tipo === 'dispersion' || hijo(g, 'marker')?.a.val === '1' || !!hijo(s, 'marker')),
      });
      indiceSerie++;
    }
    if (grupo.series.length) grupos.push(grupo);
  }
  return { grupos, noAdmitido };
}

/* ───────── Escalas ───────── */

function pasoBonito(rango: number, objetivo: number): number {
  const crudo = rango / Math.max(1, objetivo);
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const f = crudo / pot;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pot;
}

function escalaBonita(min: number, max: number, fijoMin?: number, fijoMax?: number, objetivo = 6): { min: number; max: number; paso: number } {
  if (min === max) {
    max = min + (min === 0 ? 1 : Math.abs(min) * 0.5);
  }
  const paso = pasoBonito((fijoMax ?? max) - (fijoMin ?? min), objetivo);
  return {
    min: fijoMin ?? Math.floor(min / paso + 1e-9) * paso,
    max: fijoMax ?? Math.ceil(max / paso - 1e-9) * paso,
    paso,
  };
}

const ancho = (t: string, tam: number) => t.length * tam * 0.55;

/* ───────── Dibujo ───────── */

export interface OpcionesGrafico {
  /** Tamaño del texto cuando el gráfico no lo indica: 10 pt en Word y Excel, 18 pt en PowerPoint */
  tamBase?: number;
}

/** Tamaño de texto (pt) que declara un elemento en su <c:txPr> o en el texto enriquecido (<a:defRPr sz="1200">) */
function tamDeclarado(n: Nodo | undefined): number | null {
  const d = descendiente(n, 'defRPr') ?? descendiente(n, 'rPr');
  const sz = Number(d?.a.sz);
  return Number.isFinite(sz) && sz > 0 ? sz / 100 : null;
}

export function graficoASvg(raiz: Nodo, w: number, h: number, tema: Tema, formato: OpcionesFormato = { fechas1904: false, idioma: 'es' }, opciones: OpcionesGrafico = {}): ResultadoGrafico {
  const grafico = hijo(raiz, 'chart');
  const area = hijo(grafico, 'plotArea');
  if (!grafico || !area) return { svg: '', aviso: 'Gráfico sin datos' };
  const { grupos, noAdmitido } = leerGrupos(area, tema);
  const fondo = colorDeSpPr(hijo(raiz, 'spPr'), tema);
  const marco = `<rect x="0" y="0" width="${r2(w)}" height="${r2(h)}" fill="${fondo ?? '#ffffff'}"${hijo(hijo(raiz, 'spPr'), 'ln') && !hijo(hijo(hijo(raiz, 'spPr'), 'ln'), 'noFill') ? ' stroke="#d9d9d9" stroke-width="0.75"' : ''}/>`;
  if (!grupos.length) {
    const t = noAdmitido ? `[Gráfico de tipo «${noAdmitido}» no admitido]` : '[Gráfico sin datos]';
    return { svg: `${marco}<text x="${r2(w / 2)}" y="${r2(h / 2)}" text-anchor="middle" font-family="${FUENTE}" font-size="11" fill="#777">${escaparHtml(t)}</text>`, aviso: t };
  }

  const partes: string[] = [marco];
  // Tamaño del texto: el del gráfico si lo declara; si no, el habitual de cada programa. Si el gráfico es pequeño se reduce para que quepa.
  let tam = tamDeclarado(hijo(raiz, 'txPr')) ?? opciones.tamBase ?? 10;
  tam = Math.max(6, Math.min(tam, Math.max(7, Math.min(w / 28, h / 14))));
  const tamTitulo = Math.max(tam * 1.25, 9);
  const fmt = (v: number, codigo: string) => formatearValor(v, codigo && codigo !== 'General' ? codigo : 'General', formato);
  const T = (x: number, y: number, t: string, o: { tam?: number; ancla?: string; color?: string; peso?: string; giro?: number } = {}) =>
    `<text x="${r2(x)}" y="${r2(y)}" font-family="${FUENTE}" font-size="${r2(o.tam ?? tam)}" fill="${o.color ?? '#595959'}" text-anchor="${o.ancla ?? 'middle'}"${o.peso ? ` font-weight="${o.peso}"` : ''}${o.giro ? ` transform="rotate(${o.giro} ${r2(x)} ${r2(y)})"` : ''}>${escaparHtml(t)}</text>`;

  // Título
  const eliminarTitulo = hijo(grafico, 'autoTitleDeleted')?.a.val === '1';
  let titulo = hijo(grafico, 'title') ? textoRico(hijo(hijo(grafico, 'title'), 'tx')) : '';
  const principal = grupos[0];
  if (!titulo && !eliminarTitulo && !hijo(grafico, 'title') && grupos.length === 1 && principal.series.length === 1 && (principal.tipo === 'sector' || principal.tipo === 'anillo')) titulo = principal.series[0].nombre;
  const alturaTitulo = titulo ? tamTitulo + 16 : 8;
  if (titulo) partes.push(T(w / 2, tamTitulo + 6, titulo, { tam: tamDeclarado(hijo(hijo(grafico, 'title'), 'tx')) ?? tamTitulo, color: '#404040' }));

  // Leyenda
  const leyenda = hijo(grafico, 'legend');
  const posLeyenda = hijo(leyenda, 'legendPos')?.a.val ?? 'r';
  const circular = principal.tipo === 'sector' || principal.tipo === 'anillo';
  const entradas: { texto: string; color: string }[] = circular
    ? (principal.series[0]?.categorias ?? []).map((c, i) => ({ texto: c, color: principal.series[0].puntos.get(i) ?? colorPorDefecto(i, tema) }))
    : grupos.flatMap((g) => g.series).map((s) => ({ texto: s.nombre, color: s.color ?? '#999' }));
  let margenIzq = 8;
  let margenDer = 10;
  let margenSup = alturaTitulo;
  let margenInf = 8;
  if (leyenda && hijo(leyenda, 'delete')?.a.val !== '1' && entradas.length) {
    const anchoMax = Math.max(...entradas.map((e) => ancho(e.texto, tam))) + tam * 2.2;
    if (posLeyenda === 'r' || posLeyenda === 'l') {
      const x0 = posLeyenda === 'r' ? w - anchoMax - 6 : 6;
      const paso = tam * 1.7;
      const y0 = Math.max(margenSup + 8, h / 2 - (entradas.length * paso) / 2);
      entradas.forEach((e, i) => partes.push(`<rect x="${r2(x0)}" y="${r2(y0 + i * paso + 1)}" width="${r2(tam)}" height="${r2(tam)}" fill="${e.color}"/>${T(x0 + tam * 1.5, y0 + i * paso + tam, e.texto, { ancla: 'start' })}`));
      if (posLeyenda === 'r') margenDer += anchoMax + 6;
      else margenIzq += anchoMax + 6;
    } else {
      const total = entradas.reduce((a, e) => a + ancho(e.texto, tam) + tam * 2.8, 0);
      let x0 = Math.max(6, (w - total) / 2);
      const y0 = posLeyenda === 't' ? margenSup : h - tam * 1.8;
      entradas.forEach((e) => {
        partes.push(`<rect x="${r2(x0)}" y="${r2(y0 + 1)}" width="${r2(tam)}" height="${r2(tam)}" fill="${e.color}"/>${T(x0 + tam * 1.4, y0 + tam, e.texto, { ancla: 'start' })}`);
        x0 += ancho(e.texto, tam) + tam * 2.8;
      });
      if (posLeyenda === 't') margenSup += tam * 2;
      else margenInf += tam * 2.2;
    }
  }

  /* ───── Sectores y anillos ───── */
  if (circular) {
    const s = principal.series[0];
    const valores = s.valores.map((v) => Math.max(0, v ?? 0));
    const suma = valores.reduce((a, b) => a + b, 0) || 1;
    const e = s.etiquetas;
    const dentro = !!e && (e.posicion === 'ctr' || e.posicion === 'inEnd' || principal.tipo === 'anillo');
    const textoEtiqueta = (v: number, i: number) => {
      if (!e) return '';
      const formatoPorcentaje = e.formato.includes('%') ? e.formato : '0%';
      return [e.serie ? s.nombre : '', e.categoria ? s.categorias[i] : '', e.valor ? fmt(v, e.porcentaje && e.formato.includes('%') ? s.formato : e.formato || s.formato) : '', e.porcentaje ? fmt(v / suma, formatoPorcentaje) : ''].filter(Boolean).join('; ');
    };
    const anchoEtiquetas = e && !dentro ? Math.max(...valores.map((v, i) => (v > 0 ? ancho(textoEtiqueta(v, i), tam) : 0))) + 4 : 0;
    const disponibleW = w - margenIzq - margenDer;
    const disponibleH = h - margenSup - margenInf;
    const cx = margenIzq + disponibleW / 2;
    const cy = margenSup + disponibleH / 2;
    const r = Math.max(10, Math.min(disponibleW / 2 - anchoEtiquetas - tam * 0.5, disponibleH / 2 - (e && !dentro ? tam * 1.6 : tam * 0.6)));
    let ang = -Math.PI / 2 + (principal.anguloInicial * Math.PI) / 180;
    valores.forEach((v, i) => {
      const barrido = (v / suma) * Math.PI * 2;
      const color = s.puntos.get(i) ?? colorPorDefecto(i, tema);
      const a1 = ang;
      const a2 = ang + barrido;
      const P = (rr: number, a: number) => `${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}`;
      const rin = principal.tipo === 'anillo' ? r * principal.agujero : 0;
      if (barrido >= Math.PI * 2 - 1e-6) {
        partes.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${color}" stroke="#fff" stroke-width="1"/>${rin ? `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rin)}" fill="#fff"/>` : ''}`);
      } else if (v > 0) {
        const grande = barrido > Math.PI ? 1 : 0;
        const d = rin
          ? `M${P(r, a1)}A${r2(r)} ${r2(r)} 0 ${grande} 1 ${P(r, a2)}L${P(rin, a2)}A${r2(rin)} ${r2(rin)} 0 ${grande} 0 ${P(rin, a1)}Z`
          : `M${r2(cx)} ${r2(cy)}L${P(r, a1)}A${r2(r)} ${r2(r)} 0 ${grande} 1 ${P(r, a2)}Z`;
        partes.push(`<path d="${d}" fill="${color}" stroke="#fff" stroke-width="1"/>`);
      }
      if (e && v > 0) {
        const medio = (a1 + a2) / 2;
        const rr = dentro ? (rin ? (r + rin) / 2 : r * 0.62) : r + tam * 0.6;
        const derecha = Math.cos(medio) >= 0;
        partes.push(T(cx + rr * Math.cos(medio) + (dentro ? 0 : derecha ? 2 : -2), cy + rr * Math.sin(medio) + (dentro ? tam * 0.35 : Math.sin(medio) > 0.3 ? tam * 0.9 : tam * 0.2), textoEtiqueta(v, i), { color: dentro ? '#fff' : '#404040', ancla: dentro ? 'middle' : derecha ? 'start' : 'end' }));
      }
      ang = a2;
    });
    return { svg: partes.join(''), aviso: grupos.length > 1 ? 'Gráfico combinado simplificado' : undefined };
  }

  /* ───── Ejes: barras, líneas, áreas y dispersión ───── */
  const esDispersion = principal.tipo === 'dispersion';
  const horizontal = principal.tipo === 'barra' && principal.horizontal;
  const categorias = esDispersion ? [] : (grupos.flatMap((g) => g.series).find((s) => s.categorias.length)?.categorias ?? []);
  const nCat = esDispersion ? 0 : Math.max(categorias.length, ...grupos.flatMap((g) => g.series.map((s) => s.valores.length)));

  // Rango de valores (con apilado)
  let minV = 0;
  let maxV = 0;
  let hayNegativos = false;
  const conPorcentaje = grupos.some((g) => g.agrupacion === 'porcentaje');
  const todosValores: number[] = [];
  for (const g of grupos) {
    if (g.agrupacion === 'estandar') {
      for (const s of g.series) for (const v of s.valores) if (v !== null) todosValores.push(v);
    } else {
      for (let i = 0; i < nCat; i++) {
        let pos = 0;
        let neg = 0;
        for (const s of g.series) {
          const v = s.valores[i] ?? 0;
          if (v >= 0) pos += v;
          else neg += v;
        }
        todosValores.push(g.agrupacion === 'porcentaje' ? 100 : pos, g.agrupacion === 'porcentaje' ? 0 : neg);
      }
    }
  }
  if (todosValores.length) {
    minV = Math.min(...todosValores);
    maxV = Math.max(...todosValores);
    hayNegativos = minV < 0;
  }
  const ejeVal = descendientes(area, 'valAx')[esDispersion ? 1 : 0] ?? hijo(area, 'valAx');
  const escalaFijaMin = ejeVal && hijo(hijo(ejeVal, 'scaling'), 'min') ? num(hijo(hijo(ejeVal, 'scaling'), 'min'), 'val') : undefined;
  const escalaFijaMax = ejeVal && hijo(hijo(ejeVal, 'scaling'), 'max') ? num(hijo(hijo(ejeVal, 'scaling'), 'max'), 'val') : undefined;
  const incluyeCero = principal.tipo === 'barra' || principal.tipo === 'area' || (maxV > 0 && minV > 0 && (maxV - minV) / maxV > 1 / 6);
  const baseMin = incluyeCero ? Math.min(0, minV) : minV;
  const baseMax = maxV < 0 && incluyeCero ? 0 : maxV;
  const escalaV = escalaBonita(baseMin, baseMax, escalaFijaMin, escalaFijaMax, horizontal ? 5 : 6);
  const codigoEje = hijo(ejeVal, 'numFmt')?.a.formatCode && hijo(ejeVal, 'numFmt')?.a.sourceLinked !== '1' ? hijo(ejeVal, 'numFmt')!.a.formatCode! : (conPorcentaje ? '0"%"' : principal.series[0]?.formato ?? 'General');
  const etiquetasEje = Array.from({ length: Math.round((escalaV.max - escalaV.min) / escalaV.paso) + 1 }, (_, i) => escalaV.min + i * escalaV.paso);
  const textosEje = etiquetasEje.map((v) => fmt(Math.abs(v) < 1e-9 ? 0 : v, codigoEje));

  // Escala X para dispersión
  let escalaX = { min: 0, max: 1, paso: 0.2 };
  if (esDispersion) {
    const xs = principal.series.flatMap((s) => (s.x ?? []).filter((v): v is number => v !== null));
    escalaX = xs.length ? escalaBonita(Math.min(...xs), Math.max(...xs), undefined, undefined, 6) : escalaX;
  }

  const tituloEjeV = hijo(ejeVal, 'title') ? textoRico(hijo(ejeVal, 'title')) : '';
  const ejeCat = hijo(area, 'catAx') ?? hijo(area, 'dateAx') ?? descendientes(area, 'valAx')[0];
  const tituloEjeC = hijo(ejeCat, 'title') ? textoRico(hijo(ejeCat, 'title')) : '';
  const anchoEtiquetasV = Math.max(...textosEje.map((t) => ancho(t, tam)), 10) + tam * 0.9;
  const etiquetasCat = categorias.map((c) => c ?? '');
  const anchoMaxCat = Math.max(0, ...etiquetasCat.map((t) => ancho(t, tam)));

  const x0 = margenIzq + (horizontal ? Math.min(anchoMaxCat, w * 0.3) + 6 : anchoEtiquetasV) + (tituloEjeV && !horizontal ? tam * 1.6 : 0);
  const x1 = w - margenDer;
  const y0 = margenSup + 6;
  let y1 = h - margenInf - tam * 2 - (tituloEjeC && !horizontal ? tam * 1.5 : 0);
  // Etiquetas de categoría largas: se giran
  const hueco = nCat ? (x1 - x0) / nCat : 1;
  const girar = !horizontal && !esDispersion && anchoMaxCat > hueco * 0.92;
  if (girar) y1 -= Math.min(h * 0.3, anchoMaxCat * 0.7) - 6;
  if (x1 <= x0 + 20 || y1 <= y0 + 20) return { svg: marco, aviso: 'El gráfico es demasiado pequeño para dibujarlo' };

  const valorAY = (v: number) => y1 - ((v - escalaV.min) / (escalaV.max - escalaV.min)) * (y1 - y0);
  const valorAX = (v: number) => x0 + ((v - escalaV.min) / (escalaV.max - escalaV.min)) * (x1 - x0);
  const xDisp = (v: number) => x0 + ((v - escalaX.min) / (escalaX.max - escalaX.min)) * (x1 - x0);
  const lineasRejilla = hijo(ejeVal, 'majorGridlines') !== undefined;

  // Rejilla y etiquetas del eje de valores
  etiquetasEje.forEach((v, i) => {
    if (horizontal) {
      const x = valorAX(v);
      if (lineasRejilla) partes.push(`<line x1="${r2(x)}" y1="${r2(y0)}" x2="${r2(x)}" y2="${r2(y1)}" stroke="#d9d9d9" stroke-width="0.75"/>`);
      partes.push(T(x, y1 + tam * 1.45, textosEje[i]));
    } else {
      const y = valorAY(v);
      if (lineasRejilla) partes.push(`<line x1="${r2(x0)}" y1="${r2(y)}" x2="${r2(x1)}" y2="${r2(y)}" stroke="#d9d9d9" stroke-width="0.75"/>`);
      partes.push(T(x0 - 6, y + 3, textosEje[i], { ancla: 'end' }));
    }
  });
  if (esDispersion) {
    for (let v = escalaX.min; v <= escalaX.max + 1e-9; v += escalaX.paso) partes.push(T(xDisp(v), y1 + tam * 1.45, fmt(Math.abs(v) < 1e-9 ? 0 : v, 'General')));
  }
  if (tituloEjeV) partes.push(T(margenIzq + 6, (y0 + y1) / 2, tituloEjeV, { giro: -90, tam: tam * 1.05 }));
  if (tituloEjeC) partes.push(T((x0 + x1) / 2, h - margenInf + 2, tituloEjeC, { tam: tam * 1.05 }));

  // Eje de categorías
  const base0 = horizontal ? valorAX(Math.max(escalaV.min, Math.min(0, escalaV.max))) : valorAY(Math.max(escalaV.min, Math.min(0, escalaV.max)));
  if (horizontal) partes.push(`<line x1="${r2(base0)}" y1="${r2(y0)}" x2="${r2(base0)}" y2="${r2(y1)}" stroke="#8c8c8c" stroke-width="0.75"/>`);
  else partes.push(`<line x1="${r2(x0)}" y1="${r2(base0)}" x2="${r2(x1)}" y2="${r2(base0)}" stroke="#8c8c8c" stroke-width="0.75"/>`);
  if (esDispersion) partes.push(`<line x1="${r2(x0)}" y1="${r2(y1)}" x2="${r2(x1)}" y2="${r2(y1)}" stroke="#8c8c8c" stroke-width="0.75"/><line x1="${r2(x0)}" y1="${r2(y0)}" x2="${r2(x0)}" y2="${r2(y1)}" stroke="#8c8c8c" stroke-width="0.75"/>`);

  const cuantasSeriesBarra = grupos.filter((g) => g.tipo === 'barra').reduce((a, g) => a + (g.agrupacion === 'estandar' ? g.series.length : 1), 0);
  const ranura = horizontal ? (y1 - y0) / Math.max(1, nCat) : hueco;
  const saltoEtiqueta = Math.max(1, Math.ceil((girar ? 12 : anchoMaxCat + 6) / Math.max(1, girar ? ranura : ranura)));
  for (let i = 0; i < nCat; i++) {
    if (i % saltoEtiqueta) continue;
    const t = etiquetasCat[i] ?? '';
    if (horizontal) partes.push(T(x0 - 6 + 0, y0 + (nCat - 1 - i + 0.5) * ranura + 3, t, { ancla: 'end' }));
    else if (girar) partes.push(T(x0 + (i + 0.5) * hueco + 3, y1 + tam * 1.3, t, { ancla: 'end', giro: -45 }));
    else partes.push(T(x0 + (i + 0.5) * hueco, y1 + tam * 1.45, t));
  }

  const etiquetaDe = (e: Etiquetas, s: Serie, i: number, v: number): string =>
    [e.serie ? s.nombre : '', e.categoria ? s.categorias[i] : '', e.valor ? fmt(v, e.formato || s.formato) : ''].filter(Boolean).join('; ');

  // Series
  let indiceBarra = 0;
  const acumPos = new Array<number>(nCat).fill(0);
  const acumNeg = new Array<number>(nCat).fill(0);
  for (const g of grupos) {
    if (g.tipo === 'barra') {
      const nB = g.agrupacion === 'estandar' ? g.series.length : 1;
      const ancho1 = ranura / (nB - (nB - 1) * g.solape + g.separacion);
      const total = ancho1 * (nB - (nB - 1) * g.solape);
      const offset0 = (ranura - total) / 2;
      g.series.forEach((s, k) => {
        const indice = g.agrupacion === 'estandar' ? k : 0;
        for (let i = 0; i < nCat; i++) {
          const v = s.valores[i];
          if (v === null || v === undefined) continue;
          let desde = 0;
          let hasta = v;
          if (g.agrupacion !== 'estandar') {
            const suma = g.series.reduce((a, q) => a + Math.abs(q.valores[i] ?? 0), 0) || 1;
            const vv = g.agrupacion === 'porcentaje' ? (v / suma) * 100 : v;
            if (vv >= 0) {
              desde = acumPos[i];
              hasta = desde + vv;
              acumPos[i] = hasta;
            } else {
              desde = acumNeg[i];
              hasta = desde + vv;
              acumNeg[i] = hasta;
            }
          }
          const color = s.puntos.get(i) ?? s.color ?? colorPorDefecto(k, tema);
          const pos = offset0 + (indice - 0) * ancho1 * (1 - g.solape);
          if (horizontal) {
            const ya = y0 + (nCat - 1 - i) * ranura + pos;
            const xa = valorAX(Math.min(desde, hasta));
            const xb = valorAX(Math.max(desde, hasta));
            partes.push(`<rect x="${r2(xa)}" y="${r2(ya)}" width="${r2(Math.max(0.5, xb - xa))}" height="${r2(ancho1)}" fill="${color}"/>`);
            if (s.etiquetas) partes.push(T(xb + 3, ya + ancho1 / 2 + 3, etiquetaDe(s.etiquetas, s, i, v), { ancla: 'start' }));
          } else {
            const xa = x0 + i * ranura + pos;
            const ya = valorAY(Math.max(desde, hasta));
            const yb = valorAY(Math.min(desde, hasta));
            partes.push(`<rect x="${r2(xa)}" y="${r2(ya)}" width="${r2(ancho1)}" height="${r2(Math.max(0.5, yb - ya))}" fill="${color}"/>`);
            if (s.etiquetas) {
              const dentro = s.etiquetas.posicion === 'ctr' || s.etiquetas.posicion === 'inEnd' || g.agrupacion !== 'estandar';
              partes.push(T(xa + ancho1 / 2, dentro ? (ya + yb) / 2 + 3 : ya - 3, etiquetaDe(s.etiquetas, s, i, v), { color: dentro ? '#fff' : '#404040' }));
            }
          }
        }
        indiceBarra++;
      });
      void cuantasSeriesBarra;
      void hayNegativos;
    } else if (g.tipo === 'linea' || g.tipo === 'area' || g.tipo === 'dispersion') {
      g.series.forEach((s, k) => {
        const color = s.color ?? colorPorDefecto(k, tema);
        const pts: [number, number, number][] = [];
        s.valores.forEach((v, i) => {
          if (v === null) return;
          const px = g.tipo === 'dispersion' ? ((s.x?.[i] ?? null) === null ? null : xDisp(s.x![i]!)) : x0 + (i + 0.5) * hueco;
          if (px === null) return;
          pts.push([px, valorAY(v), v]);
        });
        if (!pts.length) return;
        let trazo = pts.map(([px, py], j) => `${j ? 'L' : 'M'}${r2(px)} ${r2(py)}`).join('');
        if (s.suave && pts.length > 2) {
          trazo = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
          for (let j = 0; j < pts.length - 1; j++) {
            const [ax, ay] = pts[Math.max(0, j - 1)];
            const [bx, by] = pts[j];
            const [cx2, cy2] = pts[j + 1];
            const [dx, dy] = pts[Math.min(pts.length - 1, j + 2)];
            trazo += `C${r2(bx + (cx2 - ax) / 6)} ${r2(by + (cy2 - ay) / 6)} ${r2(cx2 - (dx - bx) / 6)} ${r2(cy2 - (dy - by) / 6)} ${r2(cx2)} ${r2(cy2)}`;
          }
        }
        if (g.tipo === 'area') {
          const base = valorAY(Math.max(escalaV.min, Math.min(0, escalaV.max)));
          partes.push(`<path d="${trazo}L${r2(pts[pts.length - 1][0])} ${r2(base)}L${r2(pts[0][0])} ${r2(base)}Z" fill="${color}" fill-opacity="0.75"/>`);
        } else {
          const sinLinea = g.tipo === 'dispersion' && hijo(hijo(hijo(hijo(area, 'scatterChart'), 'ser'), 'spPr'), 'ln') && hijo(hijo(hijo(hijo(hijo(area, 'scatterChart'), 'ser'), 'spPr'), 'ln'), 'noFill');
          if (!sinLinea && pts.length > 1) partes.push(`<path d="${trazo}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`);
          if (s.marcador || pts.length < 40) {
            if (g.tipo === 'dispersion' || s.marcador) for (const [px, py] of pts) partes.push(`<circle cx="${r2(px)}" cy="${r2(py)}" r="3.2" fill="${color}"/>`);
          }
        }
        if (s.etiquetas) pts.forEach(([px, py, v], j) => partes.push(T(px, py - 6, etiquetaDe(s.etiquetas!, s, j, v), { color: '#404040' })));
      });
    }
  }
  void indiceBarra;
  return { svg: partes.join(''), aviso: grupos.some((g) => g.tipo !== principal.tipo && (g.tipo === 'sector' || g.tipo === 'anillo')) ? 'Gráfico combinado simplificado' : undefined };
}

/** Busca el elemento raíz del gráfico (c:chartSpace) y comprueba que haya al menos una serie con datos */
export function tieneDatosDeGrafico(raiz: Nodo | null | undefined): boolean {
  return !!raiz && !!descendiente(ruta(raiz, 'chart', 'plotArea'), 'ser');
}

/**
 * Los gráficos que crean algunas librerías (openpyxl, XlsxWriter…) no guardan los datos en caché, solo la referencia a las celdas
 * («Hoja1!$B$2:$B$6»). Con un `resolver` que devuelve los valores de esas celdas se completa la caché como la escribiría Excel.
 */
export function completarCaches(raiz: Nodo, resolver: (formula: string) => string[] | null): void {
  const nodo = (n: string, a: Record<string, string> = {}, h: Nodo[] = [], t = ''): Nodo => ({ n, a, h, t });
  const recorrer = (n: Nodo) => {
    for (const hijoNodo of n.h) {
      if ((hijoNodo.n === 'numRef' && !hijo(hijoNodo, 'numCache')) || (hijoNodo.n === 'strRef' && !hijo(hijoNodo, 'strCache'))) {
        const f = hijo(hijoNodo, 'f')?.t;
        const valores = f ? resolver(f) : null;
        if (valores) {
          const puntos = valores.map((v, i) => nodo('pt', { idx: String(i) }, [nodo('v', {}, [], v)]));
          const esNum = hijoNodo.n === 'numRef';
          hijoNodo.h.push(nodo(esNum ? 'numCache' : 'strCache', {}, [...(esNum ? [nodo('formatCode', {}, [], 'General')] : []), nodo('ptCount', { val: String(valores.length) }), ...puntos]));
        }
      } else recorrer(hijoNodo);
    }
  };
  recorrer(raiz);
}
