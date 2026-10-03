import { Moon, Sun } from 'lucide-react';
import { useTema } from '../app/theme';

export function ThemeToggle() {
  const { tema, alternar } = useTema();
  const aClaro = tema === 'oscuro';
  return (
    <button
      type="button"
      className="btn-icono"
      onClick={alternar}
      aria-label={aClaro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={aClaro ? 'Tema claro' : 'Tema oscuro'}
      data-testid="alternar-tema"
    >
      {aClaro ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
