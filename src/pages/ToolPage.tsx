import { Suspense } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';
import { herramientaPorId } from '../tools/registry';
import { categoriaPorId } from '../tools/categorias';

export function ToolPage() {
  const { id = '' } = useParams();
  const h = herramientaPorId(id);

  if (!h) {
    return (
      <div className="vacio">
        <h2>Herramienta no encontrada</h2>
        <Link to="/" className="btn">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const Vista = h.componente;
  const cat = categoriaPorId(h.categoria);

  return (
    <div className="herramienta" data-familia={cat.familia}>
      <div className="herramienta-cab">
        <Link to="/" className="volver">
          <ArrowLeft size={16} /> Todas las herramientas
        </Link>
        <div className="herramienta-titulo">
          <span className="icono-redondo grande">
            <h.icono size={28} />
          </span>
          <div>
            <h1>{h.nombre}</h1>
            <p>{h.descripcion}</p>
          </div>
        </div>
      </div>
      {Vista ? (
        <Suspense fallback={<div className="cargando">Cargando…</div>}>
          <Vista />
        </Suspense>
      ) : (
        <div className="vacio">
          <Construction size={36} />
          <h2>En construcción</h2>
          <p>Esta herramienta todavía no está disponible.</p>
        </div>
      )}
    </div>
  );
}
