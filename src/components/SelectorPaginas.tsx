import { useEffect, useMemo, useRef, useState } from 'react';
import { MiniaturaPagina } from './Miniatura';
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

/** Miniaturas con selección por clic sincronizada con un campo de rangos ("1-3, 5"). */
export function SelectorPaginas({ doc, total, seleccion, alCambiar, modo }: Props) {
  const [texto, setTexto] = useState(formatearPaginas(seleccion));
  const [errorRango, setErrorRango] = useState('');
  const marcadas = useMemo(() => new Set(seleccion), [seleccion]);

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
          <button type="button" className="btn" onClick={() => cambiarPorClic(Array.from({ length: total }, (_, i) => i))}>
            Todas
          </button>
          <button type="button" className="btn" onClick={() => cambiarPorClic([])}>
            Ninguna
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => cambiarPorClic(Array.from({ length: total }, (_, i) => i).filter((i) => !marcadas.has(i)))}
          >
            Invertir
          </button>
        </div>
      </div>
      {errorRango && <p className="aviso error-texto">{errorRango}</p>}
      <p className="selector-resumen">
        {seleccion.length} de {total} páginas seleccionadas
      </p>
      <div className="cuadricula-paginas">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            type="button"
            className={'celda-pagina seleccionable' + (marcadas.has(i) ? ` marcada ${modo}` : '')}
            aria-pressed={marcadas.has(i)}
            onClick={() => alternar(i)}
            data-testid="miniatura-pagina"
          >
            <MiniaturaPagina doc={doc} numero={i + 1} ancho={130} />
            <span className="celda-numero">{i + 1}</span>
            {marcadas.has(i) && <span className="celda-marca">{modo === 'eliminar' ? '✕' : '✓'}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
