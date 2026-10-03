import { CATEGORIAS } from '../tools/categorias';
import { HERRAMIENTAS } from '../tools/registry';
import { ToolCard } from '../components/ToolCard';

export function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Todas las herramientas de PDF e imágenes, sin conexión</h1>
        <p>Tus archivos nunca salen de tu equipo. Elige una herramienta para empezar.</p>
      </section>
      {CATEGORIAS.map((c) => {
        const lista = HERRAMIENTAS.filter((h) => h.categoria === c.id);
        if (lista.length === 0) return null;
        return (
          <section key={c.id} className="categoria" data-familia={c.familia}>
            <h2>
              <span className="punto" />
              {c.nombre}
            </h2>
            <div className="rejilla">
              {lista.map((h) => (
                <ToolCard key={h.id} h={h} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
