import { useCallback, useEffect, useRef, useState } from 'react';
import { guardarBytes } from './platform';
import { abrirPdfjs, cerrarPdfjs, type PDFDocumentProxy } from './pdfjs';

export type Progreso = (fraccion: number, mensaje?: string) => void;

/** Ejecuta una tarea larga con estado de ocupado, progreso y error en español. */
export function useTarea() {
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const ejecutar = useCallback(async (fn: (p: Progreso) => Promise<void>) => {
    setOcupado(true);
    setError('');
    setProgreso(0);
    setMensaje('');
    try {
      await fn((f, m) => {
        setProgreso(f);
        if (m !== undefined) setMensaje(m);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }, []);

  return { ocupado, progreso, mensaje, error, ejecutar, limpiarError: () => setError('') };
}

export interface Salida {
  nombre: string;
  datos: Uint8Array;
  mime: string;
  ruta?: string;
  guardado: boolean;
  resumen?: string;
}

/** Guarda el resultado y recuerda el último archivo generado para poder guardarlo otra vez. */
export function useSalida() {
  const [salida, setSalida] = useState<Salida | null>(null);

  const guardar = useCallback(async (nombre: string, datos: Uint8Array, mime: string, resumen?: string) => {
    const r = await guardarBytes(nombre, datos, mime);
    setSalida({ nombre, datos, mime, ruta: r.ruta, guardado: r.guardado, resumen });
  }, []);

  const reguardar = useCallback(async () => {
    if (!salida) return;
    const r = await guardarBytes(salida.nombre, salida.datos, salida.mime);
    setSalida({ ...salida, ruta: r.ruta ?? salida.ruta, guardado: r.guardado || salida.guardado });
  }, [salida]);

  return { salida, guardar, reguardar, limpiar: () => setSalida(null) };
}

/** Abre un PDF con pdf.js mientras el componente lo necesite y lo libera al cambiar o desmontar. */
export function usePdfjs(datos: Uint8Array | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!datos) {
      setDoc(null);
      return;
    }
    let vivo = true;
    let abierto: PDFDocumentProxy | null = null;
    setError('');
    abrirPdfjs(datos)
      .then((d) => {
        if (!vivo) {
          void cerrarPdfjs(d);
          return;
        }
        abierto = d;
        setDoc(d);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
      setDoc(null);
      if (abierto) void cerrarPdfjs(abierto);
    };
  }, [datos]);

  return { doc, error };
}

/** Mantiene una referencia estable al último valor (útil dentro de efectos asíncronos). */
export function useUltimo<T>(valor: T) {
  const ref = useRef(valor);
  ref.current = valor;
  return ref;
}

/** Abre varios PDF con pdf.js (por ejemplo las fuentes de "Ordenar PDF"). `lista` debe ser estable (useMemo). */
export function useDocsPdfjs(lista: Uint8Array[]) {
  const [docs, setDocs] = useState<(PDFDocumentProxy | null)[]>([]);
  useEffect(() => {
    let vivo = true;
    const abiertos: PDFDocumentProxy[] = [];
    Promise.all(
      lista.map((d) =>
        abrirPdfjs(d).then(
          (doc) => {
            abiertos.push(doc);
            return doc;
          },
          () => null,
        ),
      ),
    ).then((r) => vivo && setDocs(r));
    return () => {
      vivo = false;
      abiertos.forEach((d) => void cerrarPdfjs(d));
    };
  }, [lista]);
  return docs;
}
