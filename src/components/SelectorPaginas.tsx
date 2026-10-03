import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, ZoomIn } from 'lucide-react';
import { MiniaturaPagina } from './Miniatura';
import { VistaPagina } from './VistaPagina';
import { Interruptor } from './forms';
import type { PDFDocumentProxy } from '../lib/pdfjs';
import { formatearPaginas, parsearPaginas } from '../lib/pdf/rangos';

interface Props {
  doc: PDFDocumentProxy;
  total: number;
  /** Índices base 0 seleccionados */
  seleccion: number[];
  alCambiar(sel: number[]): void;
  /** "marcar" pinta las páginas elegidas con la acción (eliminar); "conservar" las resalta como elegidas */
  modo: 'eliminar' | 'conservar';
}

const CLAVE_PREVIA = 'pdfreaaaader.vistaPreviaAlSeleccionar';

function leerPrevia(): boolean {
  try {
    return localStorage.getItem(CLAVE_PREVIA) === '1';
  } catch {
    return false;
  }
}

/** Páginas que recorre la ventana de vista previa, y la posición con la que se abre */
interface Vista {
  paginas: number[];
  inicio: number;
  contexto?: string;
}

/** Miniaturas con selección por clic sincronizada con un campo de rangos ("1-3, 5"). */
export function SelectorPaginas({ doc, total, seleccion, alCambiar, modo }: Props) {
  const [texto, setTexto] = useState(formatearPaginas(seleccion));
  const [errorRango, setErrorRango] = useState('');
  const marcadas = useMemo(() => new Set(seleccion), [seleccion]);
  const [vista, setVista] = useState<Vista | null>(null);
  // Si está activa, un clic en la miniatura abre la vista previa (donde se marca la página) en vez de marcarla directamente
  const [previa, setPrevia] = useState(leerPrevia);
  const cambiarPrevia = (v: boolean) => {
    setPrevia(v);
    try {
      localStorage.setItem(CLAVE_PREVIA, v ? '1' : '0');
    } catch {
      /* sin almacenamiento: solo vale para esta sesión */
    }
  };
  const todas = useMemo(() => Array.from({ length: total }, (_, i) => i), [total]);

  // Si la selección cambia por clic o por los botones, el campo de texto se reescribe; si la
  // cambia el propio texto, se respeta lo que el usuario está escribiendo.
  const origen = useRef<'texto' | 'clic'>('clic');
  useEffect(() => {
    if (origen.current === 'clic') setTexto(formatearPaginas(seleccion));
  }, [seleccion]);

  const cambiarPorClic = (sel: number[]) => {
    origen.current = 'clic';
    setErrorRango('');
    alCambiar(sel);
  };

  const alEscribir = (v: string) => {
    origen.current = 'texto';
    setTexto(v);
    if (!v.trim()) {
      setErrorRango('');
      alCambiar([]);
      return;
    }
    try {
      alCambiar(parsearPaginas(v, total));
      setErrorRango('');
    } catch (e) {
      setErrorRango(e instanceof Error ? e.message : String(e));
    }
  };

  const alternar = (i: number) => {
    const s = new Set(marcadas);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    cambiarPorClic([...s].sort((a, b) => a - b));
  };

  return (
    <div>
      <div className="selector-rango">
        <label className="campo">
          <span className="campo-etiqueta">Páginas {modo === 'eliminar' ? 'a eliminar' : 'a conservar'}</span>
          <input
            className="entrada"
            value={texto}
            placeholder="Ej.: 1-3, 5, 8-"
            onChange={(e) => alEscribir(e.target.value)}
            data-testid="campo-rango"
          />
        </label>
        <div className="selector-botones">
          <button type="button" className="btn" onClick={() => cambiarPorClic(todas)}>
            Todas
          </button>
          <button type="button" className="btn" onClick={() => cambiarPorClic([])}>
            Ninguna
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => cambiarPorClic(todas.filter((i) => !marcadas.has(i)))}
          >
            Invertir
          </button>
          <button
            type="button"
            className="btn"
            disabled={seleccion.length === 0}
            onClick={() =>
              setVista({ paginas: [...seleccion], inicio: 0, contexto: modo === 'eliminar' ? 'Páginas a eliminar' : 'Páginas elegidas' })
            }
            data-testid="revisar-seleccion"
          >
            <Eye size={16} /> Revisar selección
          </button>
        </div>
      </div>
      {errorRango && <p className="aviso error-texto">{errorRango}</p>}
      <p className="selector-resumen">
        {seleccion.length} de {total} páginas seleccionadas
      </p>
      <div className="selector-opciones">
        <Interruptor marcado={previa} alCambiar={cambiarPrevia} texto="Ver la página en grande al hacer clic en una miniatura" />
      </div>
      <div className="cuadricula-paginas">
        {todas.map((i) => (
          <div key={i} className="celda-envoltorio">
            <button
              type="button"
              className={'celda-pagina seleccionable' + (marcadas.has(i) ? ` marcada ${modo}` : '')}
              aria-pressed={marcadas.has(i)}
              onClick={() => (previa ? setVista({ paginas: todas, inicio: i }) : alternar(i))}
              data-testid="miniatura-pagina"
            >
              <MiniaturaPagina doc={doc} numero={i + 1} ancho={130} />
              <span className="celda-numero">{i + 1}</span>
              {marcadas.has(i) && <span className="celda-marca">{modo === 'eliminar' ? '✕' : '✓'}</span>}
            </button>
            <button
              type="button"
              className="celda-lupa"
              aria-label={`Ver la página ${i + 1} en grande`}
              title="Ver en grande"
              onClick={() => setVista({ paginas: todas, inicio: i })}
              data-testid="ver-pagina"
            >
              <ZoomIn size={16} />
            </button>
          </div>
        ))}
      </div>
      {vista && (
        <VistaPagina
          doc={doc}
          total={total}
          paginas={vista.paginas}
          inicio={vista.inicio}
          contexto={vista.contexto}
          marcadas={marcadas}
          modo={modo}
          alternar={alternar}
          alCerrar={() => setVista(null)}
        />
      )}
    </div>
  );
}
