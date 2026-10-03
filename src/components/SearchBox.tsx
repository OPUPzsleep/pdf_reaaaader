import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { buscar } from '../tools/registry';
import { categoriaPorId } from '../tools/categorias';

export function SearchBox() {
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  const resultados = useMemo(() => (q.trim() ? buscar(q).slice(0, 8) : []), [q]);

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener('keydown', atajo);
    window.addEventListener('mousedown', fuera);
    return () => {
      window.removeEventListener('keydown', atajo);
      window.removeEventListener('mousedown', fuera);
    };
  }, []);

  const ir = (id: string) => {
    nav(`/herramienta/${id}`);
    setQ('');
    setAbierto(false);
    ref.current?.blur();
  };

  return (
    <div className="buscador" ref={caja}>
      <Search size={16} aria-hidden />
      <input
        ref={ref}
        value={q}
        placeholder="Buscar herramienta…  (Ctrl+K)"
        aria-label="Buscar herramienta"
        onChange={(e) => {
          setQ(e.target.value);
          setIndice(0);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndice((i) => Math.min(i + 1, resultados.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndice((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && resultados[indice]) {
            ir(resultados[indice].id);
          } else if (e.key === 'Escape') {
            setAbierto(false);
            ref.current?.blur();
          }
        }}
      />
      {abierto && q.trim() && (
        <div className="buscador-lista" role="listbox">
          {resultados.length === 0 && <div className="buscador-vacio">Sin resultados para «{q}»</div>}
          {resultados.map((h, i) => (
            <button
              key={h.id}
              type="button"
              role="option"
              aria-selected={i === indice}
              className={'buscador-item' + (i === indice ? ' sel' : '')}
              data-familia={categoriaPorId(h.categoria).familia}
              onMouseEnter={() => setIndice(i)}
              onClick={() => ir(h.id)}
            >
              <span className="icono-redondo">
                <h.icono size={15} />
              </span>
              <span>
                <strong>{h.nombre}</strong>
                <small>{categoriaPorId(h.categoria).nombre}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
