import { Link } from 'react-router-dom';
import { categoriaPorId } from '../tools/categorias';
import type { Herramienta } from '../tools/registry';

export function ToolCard({ h }: { h: Herramienta }) {
  return (
    <Link
      to={`/herramienta/${h.id}`}
      className="tarjeta"
      data-familia={categoriaPorId(h.categoria).familia}
      data-testid={`tarjeta-${h.id}`}
    >
      <span className="icono-redondo grande">
        <h.icono size={26} />
      </span>
      <h3>{h.nombre}</h3>
      <p>{h.descripcion}</p>
    </Link>
  );
}
