import { usePdfjs } from '../../lib/hooks';
import { MiniaturaPagina } from '../../components/Miniatura';

/** Miniatura de la primera página de un PDF en memoria. */
export function PrimeraPagina({ datos, ancho = 90, rotacion = 0 }: { datos: Uint8Array; ancho?: number; rotacion?: number }) {
  const { doc } = usePdfjs(datos);
  if (!doc) return <div className="miniatura vacia" style={{ width: ancho, height: ancho * 1.3 }} />;
  return <MiniaturaPagina doc={doc} numero={1} ancho={ancho} rotacion={rotacion} />;
}
