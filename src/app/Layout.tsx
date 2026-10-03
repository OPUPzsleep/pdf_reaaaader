import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { CATEGORIAS } from '../tools/categorias';
import { HERRAMIENTAS } from '../tools/registry';
import { SearchBox } from '../components/SearchBox';
import { ThemeToggle } from '../components/ThemeToggle';
import { Logo } from '../components/Logo';

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="marca" aria-label="pdfreaaaader — inicio">
          <Logo />
          <span>pdfreaaaader</span>
        </Link>
        <SearchBox />
        <span className="topbar-estado" title="Todo se procesa en tu equipo">
          Sin conexión
        </span>
        <ThemeToggle />
      </header>
      <div className="cuerpo">
        <nav className="lateral" aria-label="Herramientas">
          {CATEGORIAS.map((c) => (
            <div key={c.id} className="lateral-grupo" data-familia={c.familia}>
              <div className="lateral-titulo">
                <span className="punto" />
                {c.nombre}
              </div>
              {HERRAMIENTAS.filter((h) => h.categoria === c.id).map((h) => (
                <NavLink
                  key={h.id}
                  to={`/herramienta/${h.id}`}
                  className={({ isActive }) => 'lateral-enlace' + (isActive ? ' activo' : '')}
                >
                  <h.icono size={16} aria-hidden />
                  {h.nombre}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <main className="principal">
          <ErrorBoundary key={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
