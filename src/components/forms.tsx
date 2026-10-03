import type { ReactNode } from 'react';

/** Con `grupo` el contenedor es un div (para controles de botones como Segmentado); si no, un label. */
export function Campo({ etiqueta, ayuda, children, grupo }: { etiqueta: string; ayuda?: string; children: ReactNode; grupo?: boolean }) {
  const Contenedor = grupo ? 'div' : 'label';
  return (
    <Contenedor className="campo" role={grupo ? 'group' : undefined} aria-label={grupo ? etiqueta : undefined}>
      <span className="campo-etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <small>{ayuda}</small>}
    </Contenedor>
  );
}

export function Segmentado<T extends string | number>({
  valor, opciones, alCambiar, etiqueta,
}: {
  valor: T;
  opciones: { valor: NoInfer<T>; texto: string; titulo?: string }[];
  alCambiar(v: NoInfer<T>): void;
  etiqueta?: string;
}) {
  return (
    <div className="segmentado" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          title={o.titulo}
          className={o.valor === valor ? 'activo' : ''}
          onClick={() => alCambiar(o.valor)}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Numero({
  valor, alCambiar, min, max, paso = 1, ancho,
}: {
  valor: number;
  alCambiar(v: number): void;
  min?: number;
  max?: number;
  paso?: number;
  ancho?: number;
}) {
  return (
    <input
      type="number"
      className="entrada"
      style={ancho ? { width: ancho } : undefined}
      value={Number.isFinite(valor) ? valor : ''}
      min={min}
      max={max}
      step={paso}
      onChange={(e) => alCambiar(e.target.value === '' ? NaN : Number(e.target.value))}
    />
  );
}

export function Interruptor({ marcado, alCambiar, texto }: { marcado: boolean; alCambiar(v: boolean): void; texto: string }) {
  return (
    <label className="interruptor">
      <input type="checkbox" checked={marcado} onChange={(e) => alCambiar(e.target.checked)} />
      <span>{texto}</span>
    </label>
  );
}

export function Panel({ titulo, children, className }: { titulo?: string; children: ReactNode; className?: string }) {
  return (
    <section className={'panel ' + (className ?? '')}>
      {titulo && <h3>{titulo}</h3>}
      {children}
    </section>
  );
}
