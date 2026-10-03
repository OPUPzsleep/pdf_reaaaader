import { AlertTriangle, CheckCircle2, FolderOpen, Save } from 'lucide-react';
import type { Salida } from '../lib/hooks';
import { formatearBytes } from '../lib/pdf/nombres';
import { ProgressBar } from './ProgressBar';

interface Props {
  ocupado: boolean;
  progreso: number;
  mensaje: string;
  error: string;
  salida: Salida | null;
  alReguardar(): void;
}

/** Estado común de todas las herramientas: progreso, error y resultado guardado. */
export function ResultadoPanel({ ocupado, progreso, mensaje, error, salida, alReguardar }: Props) {
  return (
    <>
      {ocupado && <ProgressBar fraccion={progreso} mensaje={mensaje} />}
      {error && (
        <div className="error" role="alert" data-testid="error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}
      {salida && !ocupado && (
        <div className="resultado" role="status" data-testid="resultado">
          <CheckCircle2 size={26} />
          <div className="resultado-texto">
            <strong>{salida.guardado ? '¡Listo! Archivo guardado' : 'Resultado listo (aún sin guardar)'}</strong>
            <span>
              {salida.nombre} · {formatearBytes(salida.datos.byteLength)}
            </span>
            {salida.resumen && <span>{salida.resumen}</span>}
            {salida.ruta && <span className="ruta">{salida.ruta}</span>}
          </div>
          <div className="resultado-acciones">
            <button type="button" className="btn" onClick={alReguardar}>
              <Save size={16} /> {salida.guardado ? 'Guardar otra copia' : 'Guardar…'}
            </button>
            {salida.ruta && window.api && (
              <button type="button" className="btn" onClick={() => void window.api!.mostrarEnCarpeta(salida.ruta!)}>
                <FolderOpen size={16} /> Mostrar en carpeta
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
