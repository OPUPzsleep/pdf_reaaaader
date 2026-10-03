// Excel (.xlsx) → HTML autocontenido: cada hoja es una tabla con sus estilos, combinaciones, anchos y formatos de número.
import { Paquete, aplicarTint, escaparHtml, familiaCss, hexARgb, imagenComoDatos, leerTema, limpiarControl, r2, rgbAHex, type Tema } from './comun';
import { completarCaches, graficoASvg } from './grafico';
import type { ResultadoOffice } from './docx';
import { colorFormato, FORMATOS_INTEGRADOS, formatearValor, type OpcionesFormato } from './xlsxFormato';
import { descendiente, hijo, hijos, num, type Nodo } from './xml';

const MAX_FILAS = 10000;
const MAX_COLUMNAS = 200;

const PALETA_INDEXADA = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

// Orden de los colores de tema en SpreadsheetML (0 = lt1, 1 = dk1, 2 = lt2, 3 = dk2, 4–9 = accent1–6, 10 = hlink, 11 = folHlink)
const TEMA_POR_INDICE = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

interface FuenteXlsx {
  nombre?: string;
  tam: number;
  b: boolean;
  i: boolean;
  u: boolean;
  tachado: boolean;
  color?: string;
}

interface BordeLado {
  estilo: string;
  color: string | null;
}

interface EstiloCelda {
  formato: string;
  fuente: FuenteXlsx;
  fondo: string | null;
  bordes: { left?: BordeLado; right?: BordeLado; top?: BordeLado; bottom?: BordeLado };
  h: string;
  v: string;
  ajustar: boolean;
  sangria: number;
  /** Tiene relleno o bordes visibles: cuenta como parte del área usada aunque esté vacía */
  visible: boolean;
}

function colorXlsx(n: Nodo | undefined, tema: Tema): string | undefined {
  if (!n) return undefined;
  let hex: string | undefined;
  if (n.a.rgb) hex = n.a.rgb.slice(-6);
  else if (n.a.theme !== undefined) {
    const nombre = TEMA_POR_INDICE[Number(n.a.theme)];
    hex = (tema.colores[nombre] ?? '#000000').slice(1);
  } else if (n.a.indexed !== undefined) {
    const i = Number(n.a.indexed);
    hex = i === 64 ? '000000' : i === 65 ? 'FFFFFF' : PALETA_INDEXADA[i];
  } else if (n.a.auto) return undefined;
  if (!hex) return undefined;
  let rgb = hexARgb(hex);
  const tint = Number(n.a.tint);
  if (Number.isFinite(tint) && tint) rgb = aplicarTint(rgb, tint);
  return rgbAHex(rgb);
}

function leerLado(n: Nodo | undefined, tema: Tema): BordeLado | undefined {
  const estilo = n?.a.style;
  if (!n || !estilo || estilo === 'none') return undefined;
  return { estilo, color: colorXlsx(hijo(n, 'color'), tema) ?? null };
}

function leerEstilos(raiz: Nodo | null, tema: Tema) {
  const formatos = new Map<number, string>();
  const fuentes: FuenteXlsx[] = [];
  const rellenos: (string | null)[] = [];
  const bordes: EstiloCelda['bordes'][] = [];
  const xfs: EstiloCelda[] = [];
  if (!raiz) return { xfs, formatos };
  for (const nf of hijos(hijo(raiz, 'numFmts'), 'numFmt')) formatos.set(num(nf, 'numFmtId'), nf.a.formatCode ?? 'General');
  for (const f of hijos(hijo(raiz, 'fonts'), 'font')) {
    fuentes.push({
      nombre: hijo(f, 'name')?.a.val,
      tam: num(hijo(f, 'sz'), 'val', 11),
      b: !!hijo(f, 'b') && hijo(f, 'b')?.a.val !== '0' && hijo(f, 'b')?.a.val !== 'false',
      i: !!hijo(f, 'i') && hijo(f, 'i')?.a.val !== '0' && hijo(f, 'i')?.a.val !== 'false',
      u: !!hijo(f, 'u') && hijo(f, 'u')?.a.val !== 'none',
      tachado: !!hijo(f, 'strike') && hijo(f, 'strike')?.a.val !== '0',
      color: colorXlsx(hijo(f, 'color'), tema),
    });
  }
  for (const r of hijos(hijo(raiz, 'fills'), 'fill')) {
    const p = hijo(r, 'patternFill');
    if (p && p.a.patternType && p.a.patternType !== 'none') {
      const fg = colorXlsx(hijo(p, 'fgColor'), tema);
      rellenos.push(p.a.patternType === 'solid' ? (fg ?? colorXlsx(hijo(p, 'bgColor'), tema) ?? null) : (fg ?? null));
    } else if (hijo(r, 'gradientFill')) {
      rellenos.push(colorXlsx(hijo(hijo(hijo(r, 'gradientFill'), 'stop'), 'color'), tema) ?? null);
    } else rellenos.push(null);
  }
  for (const b of hijos(hijo(raiz, 'borders'), 'border')) {
    bordes.push({ left: leerLado(hijo(b, 'left') ?? hijo(b, 'start'), tema), right: leerLado(hijo(b, 'right') ?? hijo(b, 'end'), tema), top: leerLado(hijo(b, 'top'), tema), bottom: leerLado(hijo(b, 'bottom'), tema) });
  }
  const porDefecto: FuenteXlsx = { tam: 11, b: false, i: false, u: false, tachado: false };
  for (const xf of hijos(hijo(raiz, 'cellXfs'), 'xf')) {
    const idFormato = num(xf, 'numFmtId');
    const al = hijo(xf, 'alignment');
    const fondo = rellenos[num(xf, 'fillId')] ?? null;
    const borde = bordes[num(xf, 'borderId')] ?? {};
    xfs.push({
      formato: formatos.get(idFormato) ?? FORMATOS_INTEGRADOS[idFormato] ?? 'General',
      fuente: fuentes[num(xf, 'fontId')] ?? fuentes[0] ?? porDefecto,
      fondo,
      bordes: borde,
      h: al?.a.horizontal ?? 'general',
      v: al?.a.vertical ?? 'bottom',
      ajustar: al?.a.wrapText === '1' || al?.a.wrapText === 'true',
      sangria: num(al, 'indent', 0),
      visible: !!fondo || !!(borde.left || borde.right || borde.top || borde.bottom),
    });
  }
  return { xfs, formatos };
}

/* ───────── Referencias de celda ───────── */

function columnaANumero(letras: string): number {
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function leerReferencia(ref: string): { col: number; fila: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  return m ? { col: columnaANumero(m[1].toUpperCase()), fila: Number(m[2]) } : null;
}

function leerRango(ref: string): { c1: number; f1: number; c2: number; f2: number } | null {
  const [a, b] = ref.split(':');
  const x = leerReferencia(a);
  const y = leerReferencia(b ?? a);
  return x && y ? { c1: Math.min(x.col, y.col), f1: Math.min(x.fila, y.fila), c2: Math.max(x.col, y.col), f2: Math.max(x.fila, y.fila) } : null;
}

/* ───────── Hoja ───────── */

interface Celda {
  col: number;
  fila: number;
  estilo: number;
  tipo: string;
  valor: string | null;
}

const PAPEL: Record<number, [number, number]> = {
  1: [215.9, 279.4], 5: [215.9, 355.6], 7: [184.2, 266.7], 8: [297, 420], 9: [210, 297], 11: [148, 210], 13: [182, 257], 66: [420, 594],
};

const BORDE_PX: Record<string, string> = {
  thin: '1px solid', hair: '1px dotted', medium: '2px solid', thick: '3px solid', dashed: '1px dashed', dotted: '1px dotted', double: '3px double',
  mediumDashed: '2px dashed', dashDot: '1px dashed', dashDotDot: '1px dashed', mediumDashDot: '2px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed',
};

const cssLado = (lado: BordeLado | undefined) => (lado ? `${BORDE_PX[lado.estilo] ?? '1px solid'} ${lado.color ?? '#000'}` : null);

function textoDeSi(si: Nodo): string {
  // <si><t>…</t></si> o <si><r><t>…</t></r>…</si> (se ignora el texto fonético <rPh>)
  const t = hijo(si, 't');
  if (t) return t.t;
  return hijos(si, 'r').map((r) => hijo(r, 't')?.t ?? '').join('');
}

function anchoColumnaPx(caracteres: number): number {
  return Math.max(0, Math.trunc(caracteres * 7 + 5));
}

/** Valores (texto) de las celdas de una hoja, por «fila,columna» */
function valoresDeHoja(hoja: Nodo, compartidas: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const fila of hijos(hijo(hoja, 'sheetData'), 'row')) {
    for (const c of hijos(fila, 'c')) {
      const ref = c.a.r ? leerReferencia(c.a.r) : null;
      if (!ref) continue;
      const v = hijo(c, 'v')?.t;
      const t = c.a.t ?? 'n';
      const valor = t === 's' && v !== undefined ? (compartidas[Number(v)] ?? '') : t === 'inlineStr' ? textoDeSi(hijo(c, 'is') ?? { n: 'is', a: {}, h: [], t: '' }) : (v ?? '');
      if (valor !== '') m.set(`${ref.fila},${ref.col}`, valor);
    }
  }
  return m;
}

export async function xlsxAHtml(datos: Uint8Array, opciones: Partial<OpcionesFormato> = {}): Promise<ResultadoOffice> {
  const paquete = await Paquete.abrir(datos);
  const libro = await paquete.xml('xl/workbook.xml');
  if (!libro) throw new Error('El archivo no contiene un libro de Excel (falta xl/workbook.xml). Si es un .xls antiguo, guárdalo como .xlsx.');
  const rels = await paquete.relaciones('xl/workbook.xml');
  const tema = leerTema(await paquete.xml('xl/theme/theme1.xml'));
  const { xfs } = leerEstilos(await paquete.xml('xl/styles.xml'), tema);
  const fmt: OpcionesFormato = { fechas1904: opciones.fechas1904 ?? hijo(libro, 'workbookPr')?.a.date1904 === '1', idioma: opciones.idioma ?? 'es' };
  const avisos = new Set<string>();

  const compartidas: string[] = [];
  const ss = await paquete.xml('xl/sharedStrings.xml');
  for (const si of hijos(ss, 'si')) compartidas.push(textoDeSi(si));

  // Áreas de impresión y títulos de las definidas en el libro
  const areas = new Map<number, string>();
  const titulosFilas = new Map<number, [number, number]>();
  const hojasXml = hijos(hijo(libro, 'sheets'), 'sheet');
  for (const dn of hijos(hijo(libro, 'definedNames'), 'definedName')) {
    const id = dn.a.localSheetId !== undefined ? Number(dn.a.localSheetId) : -1;
    if (id < 0) continue;
    if (dn.a.name === '_xlnm.Print_Area') {
      const m = /!(\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+)/.exec(dn.t);
      if (m) areas.set(id, m[1]);
    } else if (dn.a.name === '_xlnm.Print_Titles') {
      const m = /!\$(\d+):\$(\d+)/.exec(dn.t);
      if (m) titulosFilas.set(id, [Number(m[1]), Number(m[2])]);
    }
  }

  const clases = new Map<number, string>();
  const reglasClase: string[] = [];
  const claseDe = (indice: number): string => {
    let c = clases.get(indice);
    if (c) return c;
    c = `x${indice}`;
    clases.set(indice, c);
    const e = xfs[indice];
    if (!e) {
      reglasClase.push(`.${c}{}`);
      return c;
    }
    const f = e.fuente;
    const d: string[] = [];
    const fam = familiaCss(f.nombre ?? tema.fuenteTexto);
    if (fam) d.push(`font-family:${fam}`);
    d.push(`font-size:${r2(f.tam)}pt`);
    if (f.b) d.push('font-weight:700');
    if (f.i) d.push('font-style:italic');
    if (f.u || f.tachado) d.push(`text-decoration:${[f.u && 'underline', f.tachado && 'line-through'].filter(Boolean).join(' ')}`);
    if (f.color) d.push(`color:${f.color}`);
    if (e.fondo) d.push(`background:${e.fondo}`);
    for (const [lado, nombre] of [['top', 'top'], ['bottom', 'bottom'], ['left', 'left'], ['right', 'right']] as const) {
      const b = cssLado(e.bordes[lado]);
      if (b) d.push(`border-${nombre}:${b}`);
    }
    if (e.v === 'center') d.push('vertical-align:middle');
    else if (e.v === 'top') d.push('vertical-align:top');
    else d.push('vertical-align:bottom');
    if (e.h === 'left') d.push('text-align:left');
    else if (e.h === 'center' || e.h === 'centerContinuous') d.push('text-align:center');
    else if (e.h === 'right') d.push('text-align:right');
    else if (e.h === 'justify' || e.h === 'distributed') d.push('text-align:justify');
    if (e.sangria) d.push(`padding-left:${r2(e.sangria * 9 + 2)}px`);
    if (e.ajustar) d.push('white-space:pre-wrap;overflow-wrap:anywhere');
    reglasClase.push(`.${c}{${d.join(';')}}`);
    return c;
  };

  // Hojas ya leídas (por si un gráfico apunta a celdas de otra hoja)
  const cacheHojas = new Map<string, Nodo>();
  const cacheValores = new Map<string, Map<string, string>>();
  for (const hx of hojasXml) {
    const rel = rels.get(hx.a.id ?? '');
    const nodo = rel ? await paquete.xml(rel.destino) : null;
    if (rel && nodo) cacheHojas.set(rel.destino, nodo);
  }
  const valoresPorHoja = (destino: string, nodo: Nodo) => {
    let v = cacheValores.get(destino);
    if (!v) {
      v = valoresDeHoja(nodo, compartidas);
      cacheValores.set(destino, v);
    }
    return v;
  };

  const hojas: string[] = [];
  const reglasPagina: string[] = [];
  let numeroHoja = 0;
  for (let idx = 0; idx < hojasXml.length; idx++) {
    const hx = hojasXml[idx];
    if (hx.a.state === 'hidden' || hx.a.state === 'veryHidden') continue;
    const rel = rels.get(hx.a.id ?? '');
    if (!rel) continue;
    const hoja = cacheHojas.get(rel.destino) ?? null;
    if (!hoja) continue;
    const nombreHoja = hx.a.name ?? `Hoja${idx + 1}`;

    // Columnas y filas
    const anchos = new Map<number, number>();
    const ocultas = new Set<number>();
    const formatoHoja = hijo(hoja, 'sheetFormatPr');
    const anchoDefecto = formatoHoja?.a.defaultColWidth ? anchoColumnaPx(Number(formatoHoja.a.defaultColWidth)) : 64;
    for (const c of hijos(hijo(hoja, 'cols'), 'col')) {
      const min = num(c, 'min');
      const max = Math.min(num(c, 'max'), MAX_COLUMNAS);
      const px = anchoColumnaPx(num(c, 'width', anchoDefecto / 7));
      for (let k = min; k <= max; k++) {
        if (c.a.hidden === '1') ocultas.add(k);
        else anchos.set(k, px);
      }
    }
    const altoDefecto = num(formatoHoja, 'defaultRowHeight', 15);

    const celdas = new Map<string, Celda>();
    const altos = new Map<number, number>();
    const filasOcultas = new Set<number>();
    let maxFila = 0;
    let maxCol = 0;
    let minFila = Infinity;
    let minCol = Infinity;
    let filaImplicita = 0;
    let truncada = false;
    const datosHoja = hijo(hoja, 'sheetData');
    for (const fila of hijos(datosHoja, 'row')) {
      const nf = fila.a.r ? Number(fila.a.r) : filaImplicita + 1;
      filaImplicita = nf;
      if (nf > MAX_FILAS) {
        truncada = true;
        break;
      }
      if (fila.a.ht && (fila.a.customHeight === '1' || fila.a.customHeight === 'true' || Number(fila.a.ht) !== altoDefecto)) altos.set(nf, Number(fila.a.ht));
      if (fila.a.hidden === '1') filasOcultas.add(nf);
      let colImplicita = 0;
      for (const c of hijos(fila, 'c')) {
        const ref = c.a.r ? leerReferencia(c.a.r) : { col: colImplicita + 1, fila: nf };
        if (!ref) continue;
        colImplicita = ref.col;
        if (ref.col > MAX_COLUMNAS) continue;
        const v = hijo(c, 'v')?.t;
        const tipo = c.a.t ?? 'n';
        let valor: string | null = v ?? null;
        if (tipo === 's' && v !== undefined) valor = compartidas[Number(v)] ?? '';
        else if (tipo === 'inlineStr') valor = textoDeSi(hijo(c, 'is') ?? { n: 'is', a: {}, h: [], t: '' });
        const estilo = num(c, 's', 0);
        const tieneContenido = valor !== null && valor !== '';
        const visible = xfs[estilo]?.visible ?? false;
        if (!tieneContenido && !visible) continue;
        celdas.set(`${ref.fila},${ref.col}`, { col: ref.col, fila: ref.fila, estilo, tipo, valor });
        maxFila = Math.max(maxFila, ref.fila);
        maxCol = Math.max(maxCol, ref.col);
        minFila = Math.min(minFila, ref.fila);
        minCol = Math.min(minCol, ref.col);
      }
    }
    if (truncada) avisos.add(`La hoja «${nombreHoja}» tiene más de ${MAX_FILAS} filas: solo se imprimen las primeras.`);

    // Celdas combinadas
    const combinadas = new Map<string, { filas: number; cols: number }>();
    const cubiertas = new Set<string>();
    for (const m of hijos(hijo(hoja, 'mergeCells'), 'mergeCell')) {
      const r = m.a.ref ? leerRango(m.a.ref) : null;
      if (!r) continue;
      combinadas.set(`${r.f1},${r.c1}`, { filas: r.f2 - r.f1 + 1, cols: r.c2 - r.c1 + 1 });
      for (let f = r.f1; f <= r.f2; f++) for (let c = r.c1; c <= r.c2; c++) if (f !== r.f1 || c !== r.c1) cubiertas.add(`${f},${c}`);
      // Una combinación con relleno o bordes también cuenta como área usada
      if (celdas.has(`${r.f1},${r.c1}`)) {
        maxFila = Math.max(maxFila, r.f2);
        maxCol = Math.max(maxCol, r.c2);
      }
    }

    // Área de impresión
    let f1 = Number.isFinite(minFila) ? minFila : 1;
    let c1 = Number.isFinite(minCol) ? minCol : 1;
    let f2 = maxFila;
    let c2 = maxCol;
    const area = areas.has(idx) ? leerRango(areas.get(idx)!) : null;
    if (area) {
      f1 = area.f1; c1 = area.c1; f2 = Math.min(area.f2, MAX_FILAS); c2 = Math.min(area.c2, MAX_COLUMNAS);
    } else {
      // Las hojas empiezan en A1 aunque las primeras filas estén vacías
      f1 = 1;
      c1 = 1;
    }
    const orientacion = hijo(hoja, 'pageSetup')?.a.orientation === 'landscape' ? 'landscape' : 'portrait';

    // Gráficos e imágenes de la hoja (xdr:wsDr): se colocan sobre la tabla según las celdas en las que están ancladas
    interface Objeto {
      col1: number; fila1: number; col2: number; fila2: number;
      dx1: number; dy1: number; dx2: number; dy2: number;
      ancho: number; alto: number;
      grafico?: Nodo;
      imagen?: string;
    }
    const objetos: Objeto[] = [];
    const rutaDibujo = hijo(hoja, 'drawing')?.a.id ? (await paquete.relaciones(rel.destino)).get(hijo(hoja, 'drawing')!.a.id!)?.destino : undefined;
    if (rutaDibujo) {
      const dibujo = await paquete.xml(rutaDibujo);
      const relsDibujo = await paquete.relaciones(rutaDibujo);
      for (const anclaje of dibujo?.h ?? []) {
        if (!/Anchor$/.test(anclaje.n)) continue;
        const marco = hijo(anclaje, 'graphicFrame') ?? hijo(anclaje, 'pic') ?? hijo(hijo(anclaje, 'AlternateContent'), 'Choice')?.h.find((x) => x.n === 'graphicFrame');
        if (!marco) continue;
        const desde = hijo(anclaje, 'from');
        const hasta = hijo(anclaje, 'to');
        const ext = hijo(anclaje, 'ext') ?? descendiente(hijo(marco, 'xfrm') ?? hijo(hijo(marco, 'spPr'), 'xfrm'), 'ext');
        const emu = (n: Nodo | undefined, nombre: string) => Number(hijo(n, nombre)?.t ?? 0);
        const o: Objeto = {
          col1: emu(desde, 'col'), fila1: emu(desde, 'row'), dx1: emu(desde, 'colOff'), dy1: emu(desde, 'rowOff'),
          col2: hasta ? emu(hasta, 'col') : -1, fila2: hasta ? emu(hasta, 'row') : -1, dx2: emu(hasta, 'colOff'), dy2: emu(hasta, 'rowOff'),
          ancho: num(ext, 'cx'), alto: num(ext, 'cy'),
        };
        const idGrafico = descendiente(marco, 'chart')?.a.id;
        const idImagen = descendiente(marco, 'blip')?.a.embed;
        if (idGrafico) {
          const destino = relsDibujo.get(idGrafico)?.destino;
          const raizGrafico = destino ? await paquete.xml(destino) : null;
          if (raizGrafico) {
            // Datos sin caché (gráficos de librerías): se leen de las celdas a las que apuntan
            completarCaches(raizGrafico, (formula) => {
              const m = /^(?:'((?:[^']|'')+)'|([^!']+))!(.+)$/.exec(formula.trim());
              if (!m) return null;
              const nombreHojaRef = (m[1] ?? m[2]).replace(/''/g, "'");
              const rango = leerRango(m[3].replace(/\$/g, ''));
              const idxHoja = hojasXml.findIndex((hx2) => hx2.a.name === nombreHojaRef);
              const relHoja = idxHoja >= 0 ? rels.get(hojasXml[idxHoja].a.id ?? '') : undefined;
              const nodoHoja = relHoja ? cacheHojas.get(relHoja.destino) : undefined;
              if (!rango || !nodoHoja) return null;
              const valores = valoresPorHoja(relHoja!.destino, nodoHoja);
              const salida: string[] = [];
              for (let f = rango.f1; f <= rango.f2; f++) for (let c = rango.c1; c <= rango.c2; c++) salida.push(valores.get(`${f},${c}`) ?? '');
              return salida;
            });
            o.grafico = raizGrafico;
          }
        } else if (idImagen) {
          const destino = relsDibujo.get(idImagen)?.destino;
          const d = destino ? await imagenComoDatos(paquete, destino) : null;
          if (d) o.imagen = d.uri;
        }
        if (o.grafico || o.imagen) objetos.push(o);
        else avisos.add('Algún objeto de una hoja de Excel (forma, SmartArt…) no se puede dibujar.');
      }
      // El área impresa abarca también lo que cubren los gráficos
      for (const o of objetos) {
        let col2 = o.col2;
        let fila2 = o.fila2;
        if (col2 < 0) {
          let resto = (o.ancho + o.dx1) / 9525;
          col2 = o.col1;
          while (resto > 0 && col2 < MAX_COLUMNAS) resto -= ocultas.has(col2 + 1) ? 0 : (anchos.get(col2 + 1) ?? anchoDefecto), col2++;
        }
        if (fila2 < 0) {
          let resto = (o.alto + o.dy1) / 9525;
          fila2 = o.fila1;
          while (resto > 0 && fila2 < MAX_FILAS) resto -= ((altos.get(fila2 + 1) ?? altoDefecto) * 4) / 3, fila2++;
        }
        c2 = Math.min(MAX_COLUMNAS, Math.max(c2, col2 + 1));
        f2 = Math.min(MAX_FILAS, Math.max(f2, fila2 + 1));
      }
    }
    if (f2 < f1 || c2 < c1) {
      continue; // hoja vacía: no se imprime
    }
    numeroHoja++;

    const gridLines = hijo(hoja, 'printOptions')?.a.gridLines === '1' || hijo(hoja, 'printOptions')?.a.gridLines === 'true';
    const cabecera = titulosFilas.get(idx);

    // Página y escala
    const ps = hijo(hoja, 'pageSetup');
    const margenes = hijo(hoja, 'pageMargins');
    const [pw, ph] = PAPEL[num(ps, 'paperSize', 9)] ?? PAPEL[9];
    const [ancho, alto] = orientacion === 'landscape' ? [ph, pw] : [pw, ph];
    const pulg = 72;
    const mIzq = num(margenes, 'left', 0.7) * pulg;
    const mDer = num(margenes, 'right', 0.7) * pulg;
    const mSup = num(margenes, 'top', 0.75) * pulg;
    const mInf = num(margenes, 'bottom', 0.75) * pulg;
    const anchoUtilPx = ((ancho / 25.4) * 72 - mIzq - mDer) / 0.75;
    const escala = Math.max(0.1, num(ps, 'scale', 100) / 100);
    const ajustarAncho = hijo(hijo(hoja, 'sheetPr'), 'pageSetUpPr')?.a.fitToPage === '1' && num(ps, 'fitToWidth', 1) === 1;
    const centrada = hijo(hoja, 'printOptions')?.a.horizontalCentered === '1';

    // Tabla(s): una por «banda» de columnas cuando la hoja es demasiado ancha para leerse a un tamaño razonable
    const columnas: number[] = [];
    for (let c = c1; c <= c2; c++) if (!ocultas.has(c)) columnas.push(c);
    const anchoDe = (c: number) => anchos.get(c) ?? anchoDefecto;
    const anchoTotal = columnas.reduce((a, c) => a + anchoDe(c), 0);
    const zoomCompleto = anchoTotal > 0 ? anchoUtilPx / anchoTotal : 1;
    const bandas: number[][] = [];
    let zoom: number;
    if (ajustarAncho || zoomCompleto >= Math.min(escala, 1) * 0.7 || columnas.length <= 1) {
      bandas.push(columnas);
      zoom = Math.max(0.2, Math.min(escala, zoomCompleto));
    } else {
      zoom = escala;
      const limite = anchoUtilPx / escala;
      let actual: number[] = [];
      let suma = 0;
      for (const c of columnas) {
        if (actual.length && suma + anchoDe(c) > limite) {
          bandas.push(actual);
          actual = [];
          suma = 0;
        }
        actual.push(c);
        suma += anchoDe(c);
      }
      if (actual.length) bandas.push(actual);
    }

    const filasVisibles: number[] = [];
    for (let f = f1; f <= f2; f++) if (!filasOcultas.has(f)) filasVisibles.push(f);
    const cabeceraFilas = cabecera ? filasVisibles.filter((f) => f >= cabecera[0] && f <= cabecera[1]) : [];
    const nCab = cabeceraFilas.length && filasVisibles.slice(0, cabeceraFilas.length).every((f, k) => f === cabeceraFilas[k]) ? cabeceraFilas.length : 0;

    const tablaDeBanda = (cols: number[]): string => {
      const anchosCols = cols.map(anchoDe);
      const total = anchosCols.reduce((a, b) => a + b, 0);
      const colgroup = `<colgroup>${anchosCols.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>`;
      const cuerpo = (f: number): string => {
        const altoFila = altos.get(f) ?? altoDefecto;
        const tds: string[] = [];
        for (let ci = 0; ci < cols.length; ci++) {
          const c = cols[ci];
          if (cubiertas.has(`${f},${c}`)) continue;
          const cel = celdas.get(`${f},${c}`);
          const estilo = cel ? xfs[cel.estilo] : undefined;
          const comb = combinadas.get(`${f},${c}`);
          let colspan = comb ? cols.filter((x) => x >= c && x < c + comb.cols).length : 1;
          const rowspan = comb ? Array.from({ length: comb.filas }, (_, k) => f + k).filter((x) => !filasOcultas.has(x)).length : 1;
          let texto = '';
          let esNumero = false;
          let esTexto = false;
          let colorValor: string | null = null;
          if (cel && cel.valor !== null) {
            const v = cel.valor;
            if (cel.tipo === 'n' || cel.tipo === 'd') {
              const n = Number(v);
              if (cel.tipo === 'd' && !Number.isFinite(n)) texto = v;
              else if (Number.isFinite(n)) {
                texto = formatearValor(n, estilo?.formato ?? 'General', fmt);
                colorValor = colorFormato(n, estilo?.formato ?? 'General');
                esNumero = true;
                if (/^#+$/.test(texto)) texto = '###';
              } else texto = v;
            } else if (cel.tipo === 'b') texto = v === '1' ? (fmt.idioma === 'es' ? 'VERDADERO' : 'TRUE') : fmt.idioma === 'es' ? 'FALSO' : 'FALSE';
            else if (cel.tipo === 'e') texto = v;
            else {
              texto = estilo && estilo.formato.includes('@') ? formatearValor(v, estilo.formato, fmt) : v;
              esTexto = true;
            }
          }
          // El texto largo sin ajuste invade las celdas vacías de la derecha, como en Excel
          if (esTexto && texto && estilo && !estilo.ajustar && (estilo.h === 'general' || estilo.h === 'left') && !comb) {
            const necesario = texto.length * estilo.fuente.tam * 0.62 * (96 / 72) + 6;
            let disponible = anchosCols[ci];
            let k = ci + 1;
            while (disponible < necesario && k < cols.length) {
              const vecina = cols[k];
              const cv = celdas.get(`${f},${vecina}`);
              if ((cv && cv.valor !== null && cv.valor !== '') || cubiertas.has(`${f},${vecina}`) || combinadas.has(`${f},${vecina}`)) break;
              disponible += anchosCols[k];
              colspan++;
              cubiertas.add(`${f},${vecina}`); // las celdas absorbidas no se emiten
              k++;
            }
          }
          const claseCss = cel ? claseDe(cel.estilo) : '';
          const alineacionAuto = !estilo || estilo.h === 'general' ? (esNumero ? 'text-align:right' : cel && cel.tipo === 'b' ? 'text-align:center' : '') : '';
          const celdaHtml = texto ? escaparHtml(limpiarControl(texto)).replace(/\n/g, '<br>') : '';
          const nowrap = estilo && !estilo.ajustar ? 'white-space:nowrap;overflow:hidden;text-overflow:clip' : '';
          const grid = gridLines && !estilo?.visible ? 'border:1px solid #c8c8c8' : '';
          const css = [alineacionAuto, nowrap, grid, colorValor ? `color:${colorValor}` : ''].filter(Boolean).join(';');
          tds.push(`<td${claseCss ? ` class="${claseCss}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''}${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${css ? ` style="${css}"` : ''}>${celdaHtml}</td>`);
        }
        return `<tr style="height:${r2(altoFila)}pt">${tds.join('')}</tr>`;
      };
      const filasHtml = filasVisibles.map(cuerpo);
      return `<table style="border-collapse:collapse;table-layout:fixed;width:${total}px">${colgroup}${nCab ? `<thead>${filasHtml.slice(0, nCab).join('')}</thead><tbody>${filasHtml.slice(nCab).join('')}</tbody>` : `<tbody>${filasHtml.join('')}</tbody>`}</table>`;
    };

    // Posición (px) de cada columna y fila respecto a la esquina de la tabla
    const xDeColumna = (col0: number, banda: number[]) => {
      let x = 0;
      for (const c of banda) {
        if (c - 1 >= col0) break;
        x += anchoDe(c);
      }
      return x;
    };
    const yDeFila = (fila0: number) => {
      let y = 0;
      for (const f of filasVisibles) {
        if (f - 1 >= fila0) break;
        y += ((altos.get(f) ?? altoDefecto) * 4) / 3;
      }
      return y;
    };
    const superponer = (banda: number[]): string =>
      objetos
        .filter((o) => banda.includes(o.col1 + 1))
        .map((o) => {
          const x = xDeColumna(o.col1, banda) + o.dx1 / 9525;
          const y = yDeFila(o.fila1) + o.dy1 / 9525;
          const wPx = o.col2 >= 0 ? xDeColumna(o.col2, banda) + o.dx2 / 9525 - x : o.ancho / 9525;
          const hPx = o.fila2 >= 0 ? yDeFila(o.fila2) + o.dy2 / 9525 - y : o.alto / 9525;
          if (wPx < 4 || hPx < 4) return '';
          const caja = `position:absolute;left:${r2(x)}px;top:${r2(y)}px;width:${r2(wPx)}px;height:${r2(hPx)}px`;
          if (o.imagen) return `<img src="${o.imagen}" alt="" style="${caja};object-fit:fill">`;
          const g = graficoASvg(o.grafico!, wPx * 0.75, hPx * 0.75, tema, fmt);
          if (g.aviso) avisos.add(`Gráficos de Excel: ${g.aviso}.`);
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(wPx * 0.75)} ${r2(hPx * 0.75)}" style="${caja}">${g.svg}</svg>`;
        })
        .join('');
    const tablas = bandas.map((b, i) => `<div style="zoom:${r2(zoom)};${i > 0 ? 'break-before:page;' : ''}${centrada ? 'display:flex;justify-content:center' : ''}"><div style="position:relative">${tablaDeBanda(b)}${superponer(b)}</div></div>`);
    reglasPagina.push(`@page h${numeroHoja}{size:${r2((ancho / 25.4) * 72)}pt ${r2((alto / 25.4) * 72)}pt;margin:${r2(mSup)}pt ${r2(mDer)}pt ${r2(mInf)}pt ${r2(mIzq)}pt}`);
    hojas.push(`<section style="page:h${numeroHoja}">${tablas.join('')}</section>`);
  }

  if (!hojas.length) throw new Error('El libro de Excel no tiene hojas con datos que imprimir.');
  const hoja = `*{box-sizing:border-box}html,body{margin:0;padding:0}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:${familiaCss(tema.fuenteTexto ?? 'Calibri')};font-size:11pt}td{padding:0 1px;line-height:1.2;overflow:hidden}section{display:block}${reglasClase.join('')}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>Libro</title><style>${hoja}${reglasPagina.join('')}</style></head><body>${hojas.join('')}</body></html>`;
  return { html, avisos: [...avisos], unidades: hojas.length };
}
