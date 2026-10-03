// Geometrías de formas de PowerPoint (DrawingML) convertidas a trayectos SVG.
import { num, hijo, hijos, type Nodo } from './xml';

const f = (n: number) => String(Math.round(n * 100) / 100);

/** Valores de ajuste (<a:avLst><a:gd name="adj" fmla="val 25000"/>) por nombre */
export function leerAjustes(prstGeom: Nodo | undefined): Record<string, number> {
  const r: Record<string, number> = {};
  for (const gd of hijos(hijo(prstGeom, 'avLst'), 'gd')) {
    const m = /^val\s+(-?\d+)/.exec(gd.a.fmla ?? '');
    if (m && gd.a.name) r[gd.a.name] = Number(m[1]);
  }
  return r;
}

const poligono = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

function arcoElipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

function estrella(w: number, h: number, puntas: number, interior: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < puntas * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / puntas;
    const r = i % 2 === 0 ? 1 : interior;
    pts.push([w / 2 + (Math.cos(ang) * w * r) / 2, h / 2 + (Math.sin(ang) * h * r) / 2]);
  }
  return poligono(pts);
}

function rectRedondeado(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${f(r)} 0H${f(w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)}V${f(h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}H${f(r)}A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)}V${f(r)}A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0Z`;
}

export interface GeometriaSvg {
  /** Trayecto SVG en unidades de la forma (w × h) */
  d: string;
  /** Las líneas no se rellenan */
  soloLinea?: boolean;
  /** Regla de relleno para formas con huecos */
  evenodd?: boolean;
}

/** Devuelve el trayecto de una forma predefinida, o null si no se conoce (se dibujará como rectángulo). */
export function geometriaPredefinida(prst: string, w: number, h: number, adj: Record<string, number>): GeometriaSvg | null {
  const ss = Math.min(w, h);
  const a = (n: string, def: number) => (adj[n] ?? def) / 100000;
  switch (prst) {
    case 'rect':
    case 'flowChartProcess':
    case 'flowChartPredefinedProcess':
    case 'flowChartInternalStorage':
    case 'frame':
    case 'plaque':
    case 'snip1Rect':
    case 'snip2SameRect':
    case 'snipRoundRect':
    case 'wedgeRectCallout':
    case 'borderCallout1':
    case 'accentCallout1':
      return { d: `M0 0H${f(w)}V${f(h)}H0Z` };
    case 'roundRect':
    case 'flowChartAlternateProcess':
      return { d: rectRedondeado(w, h, ss * a('adj', 16667)) };
    case 'flowChartTerminator':
      return { d: rectRedondeado(w, h, ss / 2) };
    case 'round2SameRect':
    case 'round1Rect':
      return { d: rectRedondeado(w, h, ss * a('adj1', 16667)) };
    case 'ellipse':
    case 'flowChartConnector':
    case 'flowChartOr':
    case 'flowChartSummingJunction':
    case 'wedgeEllipseCallout':
    case 'cloud':
    case 'cloudCallout':
      return { d: arcoElipse(w / 2, h / 2, w / 2, h / 2) };
    case 'donut': {
      const g = ss * a('adj', 25000);
      return { d: arcoElipse(w / 2, h / 2, w / 2, h / 2) + arcoElipse(w / 2, h / 2, Math.max(0.1, w / 2 - g), Math.max(0.1, h / 2 - g)), evenodd: true };
    }
    case 'triangle':
      return { d: poligono([[0, h], [w * a('adj', 50000), 0], [w, h]]) };
    case 'rtTriangle':
      return { d: poligono([[0, 0], [0, h], [w, h]]) };
    case 'diamond':
    case 'flowChartDecision':
      return { d: poligono([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) };
    case 'parallelogram':
    case 'flowChartInputOutput': {
      const o = ss * a('adj', 25000);
      return { d: poligono([[o, 0], [w, 0], [w - o, h], [0, h]]) };
    }
    case 'trapezoid':
    case 'flowChartManualOperation': {
      const o = ss * a('adj', 25000);
      return { d: poligono([[o, 0], [w - o, 0], [w, h], [0, h]]) };
    }
    case 'pentagon':
    case 'regularPentagon': {
      return { d: poligono([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]) };
    }
    case 'hexagon': {
      const o = ss * a('adj', 25000);
      return { d: poligono([[0, h / 2], [o, 0], [w - o, 0], [w, h / 2], [w - o, h], [o, h]]) };
    }
    case 'octagon': {
      const o = ss * a('adj', 29289);
      return { d: poligono([[o, 0], [w - o, 0], [w, o], [w, h - o], [w - o, h], [o, h], [0, h - o], [0, o]]) };
    }
    case 'rightArrow': {
      const sh = (h * a('adj1', 50000)) / 2;
      const hl = ss * a('adj2', 50000);
      return { d: poligono([[0, h / 2 - sh], [w - hl, h / 2 - sh], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h / 2 + sh], [0, h / 2 + sh]]) };
    }
    case 'leftArrow': {
      const sh = (h * a('adj1', 50000)) / 2;
      const hl = ss * a('adj2', 50000);
      return { d: poligono([[w, h / 2 - sh], [hl, h / 2 - sh], [hl, 0], [0, h / 2], [hl, h], [hl, h / 2 + sh], [w, h / 2 + sh]]) };
    }
    case 'upArrow': {
      const sh = (w * a('adj1', 50000)) / 2;
      const hl = ss * a('adj2', 50000);
      return { d: poligono([[w / 2 - sh, h], [w / 2 - sh, hl], [0, hl], [w / 2, 0], [w, hl], [w / 2 + sh, hl], [w / 2 + sh, h]]) };
    }
    case 'downArrow': {
      const sh = (w * a('adj1', 50000)) / 2;
      const hl = ss * a('adj2', 50000);
      return { d: poligono([[w / 2 - sh, 0], [w / 2 - sh, h - hl], [0, h - hl], [w / 2, h], [w, h - hl], [w / 2 + sh, h - hl], [w / 2 + sh, 0]]) };
    }
    case 'leftRightArrow': {
      const sh = (h * a('adj1', 50000)) / 2;
      const hl = ss * a('adj2', 50000);
      return { d: poligono([[0, h / 2], [hl, 0], [hl, h / 2 - sh], [w - hl, h / 2 - sh], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h / 2 + sh], [hl, h / 2 + sh], [hl, h]]) };
    }
    case 'chevron': {
      const o = ss * a('adj', 50000);
      return { d: poligono([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h], [o, h / 2]]) };
    }
    case 'homePlate':
    case 'flowChartOffpageConnector': {
      const o = ss * a('adj', 50000);
      return { d: poligono([[0, 0], [w - o, 0], [w, h / 2], [w - o, h], [0, h]]) };
    }
    case 'plus':
    case 'mathPlus': {
      const o = ss * a('adj', prst === 'plus' ? 25000 : 23520);
      return { d: poligono([[o, 0], [w - o, 0], [w - o, o], [w, o], [w, h - o], [w - o, h - o], [w - o, h], [o, h], [o, h - o], [0, h - o], [0, o], [o, o]]) };
    }
    case 'star4':
      return { d: estrella(w, h, 4, 0.38) };
    case 'star5':
      return { d: estrella(w, h, 5, 0.382) };
    case 'star6':
      return { d: estrella(w, h, 6, 0.58) };
    case 'star8':
      return { d: estrella(w, h, 8, 0.7) };
    case 'line':
    case 'straightConnector1':
    case 'bentConnector2':
    case 'bentConnector3':
    case 'curvedConnector3':
      return { d: `M0 0L${f(w)} ${f(h)}`, soloLinea: true };
    case 'heart':
      return { d: `M${f(w / 2)} ${f(h)}C${f(-w * 0.2)} ${f(h * 0.45)} ${f(w * 0.1)} ${f(-h * 0.1)} ${f(w / 2)} ${f(h * 0.28)}C${f(w * 0.9)} ${f(-h * 0.1)} ${f(w * 1.2)} ${f(h * 0.45)} ${f(w / 2)} ${f(h)}Z` };
    case 'can':
    case 'flowChartMagneticDisk': {
      const e = Math.min(h / 4, ss * a('adj', 25000));
      return { d: `M0 ${f(e)}A${f(w / 2)} ${f(e)} 0 0 1 ${f(w)} ${f(e)}V${f(h - e)}A${f(w / 2)} ${f(e)} 0 0 1 0 ${f(h - e)}Z` };
    }
    default:
      return null;
  }
}

/** Trayecto de una geometría personalizada (<a:custGeom>), en el sistema de coordenadas propio de cada trayecto */
export function geometriaPersonalizada(cust: Nodo): { rutas: { d: string; w: number; h: number; sinRelleno: boolean; sinTrazo: boolean }[] } {
  const rutas: { d: string; w: number; h: number; sinRelleno: boolean; sinTrazo: boolean }[] = [];
  for (const p of hijos(hijo(cust, 'pathLst'), 'path')) {
    const pw = num(p, 'w', 0);
    const ph = num(p, 'h', 0);
    let d = '';
    let ax = 0;
    let ay = 0;
    const pt = (n: Nodo | undefined): [number, number] => [num(n, 'x'), num(n, 'y')];
    for (const c of p.h) {
      if (c.n === 'moveTo') {
        [ax, ay] = pt(c.h[0]);
        d += `M${ax} ${ay}`;
      } else if (c.n === 'lnTo') {
        [ax, ay] = pt(c.h[0]);
        d += `L${ax} ${ay}`;
      } else if (c.n === 'cubicBezTo') {
        const [p1, p2, p3] = c.h.map(pt);
        if (p1 && p2 && p3) {
          d += `C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}`;
          [ax, ay] = p3;
        }
      } else if (c.n === 'quadBezTo') {
        const [p1, p2] = c.h.map(pt);
        if (p1 && p2) {
          d += `Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}`;
          [ax, ay] = p2;
        }
      } else if (c.n === 'arcTo') {
        const wR = num(c, 'wR');
        const hR = num(c, 'hR');
        const st = (num(c, 'stAng') / 60000) * (Math.PI / 180);
        const sw = (num(c, 'swAng') / 60000) * (Math.PI / 180);
        if (wR > 0 && hR > 0) {
          const cx = ax - wR * Math.cos(st);
          const cy = ay - hR * Math.sin(st);
          const ex = cx + wR * Math.cos(st + sw);
          const ey = cy + hR * Math.sin(st + sw);
          d += `A${wR} ${hR} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${f(ex)} ${f(ey)}`;
          ax = ex;
          ay = ey;
        }
      } else if (c.n === 'close') d += 'Z';
    }
    if (d) rutas.push({ d, w: pw, h: ph, sinRelleno: p.a.fill === 'none', sinTrazo: p.a.stroke === '0' || p.a.stroke === 'false' });
  }
  return { rutas };
}
