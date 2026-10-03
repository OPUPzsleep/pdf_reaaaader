import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react';
import { dibujarPagina, type PDFDocumentProxy } from '../lib/pdfjs';

interface Props {
  doc: PDFDocumentProxy;
  total: number;
  /** Páginas (índices base 0) por las que se puede avanzar con las flechas */
  paginas: number[];
  /** Posición inicial dentro de `paginas` */
  inicio: number;
  marcadas: Set<number>;
  modo: 'eliminar' | 'conservar';
  /** Marca o desmarca una página desde la propia vista previa */
  alternar(indice: number): void;
  alCerrar(): void;
  /** Texto de contexto bajo el título («Revisando las páginas elegidas»), si procede */
  contexto?: string;
}

/** Ventana emergente con una página en grande, para ver con claridad qué se va a eliminar (o conservar). */
export function VistaPagina({ doc, total, paginas, inicio, marcadas, modo, alternar, alCerrar, contexto }: Props) {
  const [pos, setPos] = useState(Math.min(Math.max(inicio, 0), paginas.length - 1));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  const indice = paginas[pos];
  const marcada = marcadas.has(indice);
  const eliminar = modo === 'eliminar';

  const ir = useCallback(
    (d: number) => setPos((p) => Math.min(Math.max(p + d, 0), paginas.length - 1)),
    [paginas.length],
  );

  // Teclado: Esc cierra y las flechas cambian de página. Intro/Espacio activan el botón de marcar, que tiene el foco.
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    boton.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        alCerrar();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        ir(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        ir(-1);
      }
    };
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      previo?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dibuja la página a un tamaño que quepa en la ventana
  useEffect(() => {
    let vivo = true;
    let cancelar: (() => void) | undefined;
    setCargando(true);
    setError(false);
    (async () => {
      try {
        const pagina = await doc.getPage(indice + 1);
        const base = pagina.getViewport({ scale: 1, rotation: pagina.rotate });
        const maxAncho = Math.min(window.innerWidth * 0.9 - 150, 900);
        const maxAlto = window.innerHeight * 0.96 - 210;
        const css = Math.max(0.1, Math.min(maxAncho / base.width, maxAlto / base.height));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (!vivo || !canvas.current) return;
        canvas.current.style.width = `${Math.round(base.width * css)}px`;
        canvas.current.style.height = `${Math.round(base.height * css)}px`;
        const r = await dibujarPagina(pagina, canvas.current, css * dpr, { fondo: '#ffffff' });
        cancelar = r.cancelar;
        pagina.cleanup();
        if (vivo) setCargando(false);
      } catch {
        if (vivo) {
          setError(true);
          setCargando(false);
        }
      }
    })();
    return () => {
      vivo = false;
      cancelar?.();
    };
  }, [doc, indice]);

  const etiqueta = eliminar
    ? marcada
      ? 'Se eliminará'
      : 'Se conservará'
    : marcada
      ? 'Elegida'
      : 'No elegida';
  const accion = eliminar
    ? marcada
      ? 'No eliminar esta página'
      : 'Eliminar esta página'
    : marcada
      ? 'No conservar esta página'
      : 'Conservar esta página';

  return (
    <div className="visor-fondo" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()} data-testid="vista-pagina-fondo">
      <div className="visor-caja" role="dialog" aria-modal="true" aria-label={`Vista de la página ${indice + 1}`} data-testid="vista-pagina">
        <header className="visor-cabecera">
          <div>
            <strong>
              Página {indice + 1} de {total}
            </strong>
            {contexto && (
              <small>
                {contexto} ({pos + 1} de {paginas.length})
              </small>
            )}
          </div>
          <span className={'visor-estado ' + (marcada ? (eliminar ? 'eliminar' : 'conservar') : 'neutra')} data-testid="vista-estado">
            {etiqueta}
          </span>
          <button type="button" className="btn-icono" onClick={alCerrar} aria-label="Cerrar la vista previa" data-testid="vista-cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="visor-cuerpo">
          <button type="button" className="visor-flecha" onClick={() => ir(-1)} disabled={pos === 0} aria-label="Página anterior" data-testid="vista-anterior">
            <ChevronLeft size={26} />
          </button>
          <div className={'visor-hoja' + (marcada ? (eliminar ? ' eliminar' : ' conservar') : '')}>
            <canvas ref={canvas} className={cargando ? 'cargando' : ''} data-testid="vista-lienzo" />
            {cargando && <span className="visor-cargando">Dibujando la página…</span>}
            {error && <span className="visor-cargando error-texto">No se pudo dibujar esta página.</span>}
          </div>
          <button
            type="button"
            className="visor-flecha"
            onClick={() => ir(1)}
            disabled={pos === paginas.length - 1}
            aria-label="Página siguiente"
            data-testid="vista-siguiente"
          >
            <ChevronRight size={26} />
          </button>
        </div>

        <footer className="visor-pie">
          <button
            ref={boton}
            type="button"
            className={'btn ' + (marcada ? '' : eliminar ? 'peligro-solido' : 'primario')}
            onClick={() => alternar(indice)}
            data-testid="vista-alternar"
          >
            {eliminar ? <Trash2 size={16} /> : <Check size={16} />}
            {accion}
          </button>
          <small className="ayuda">← → para cambiar de página · Esc para cerrar</small>
        </footer>
      </div>
    </div>
  );
}
