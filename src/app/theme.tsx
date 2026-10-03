import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Tema = 'claro' | 'oscuro';
const CLAVE = 'pdfreaaaader-tema';

function temaInicial(): Tema {
  try {
    const g = localStorage.getItem(CLAVE);
    if (g === 'claro' || g === 'oscuro') return g;
  } catch {
    /* sin almacenamiento */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
}

interface Ctx {
  tema: Tema;
  alternar(): void;
  fijar(t: Tema): void;
}

const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      /* ignorar */
    }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === 'claro' ? 'oscuro' : 'claro')), []);
  const valor = useMemo(() => ({ tema, alternar, fijar: setTema }), [tema, alternar]);
  return <ThemeCtx.Provider value={valor}>{children}</ThemeCtx.Provider>;
}

export function useTema() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error('useTema fuera de ThemeProvider');
  return c;
}
