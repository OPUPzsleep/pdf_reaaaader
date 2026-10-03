import { useCallback, useState } from 'react';
import { contarPaginas } from './pdf/cargar';
import { leerArchivo } from './platform';

export interface PdfCargado {
  nombre: string;
  datos: Uint8Array;
  paginas: number;
}

/** Carga un único PDF elegido por el usuario y cuenta sus páginas. */
export function useArchivoPdf() {
  const [pdf, setPdf] = useState<PdfCargado | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async (archivo: File) => {
    try {
      const datos = await leerArchivo(archivo);
      const paginas = await contarPaginas(datos).catch(() => {
        throw new Error(`No se pudo leer ${archivo.name}: no parece un PDF válido, está dañado o tiene contraseña.`);
      });
      setPdf({ nombre: archivo.name, datos, paginas });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return { pdf, error, cargar, quitar: () => setPdf(null) };
}
