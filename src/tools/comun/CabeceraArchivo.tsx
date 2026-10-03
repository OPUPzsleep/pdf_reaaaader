import { FileText, RefreshCcw } from 'lucide-react';
import { formatearBytes } from '../../lib/pdf/nombres';

export function CabeceraArchivo({
  nombre, bytes, detalle, alQuitar,
}: {
  nombre: string;
  bytes: number;
  detalle?: string;
  alQuitar(): void;
}) {
  return (
    <div className="cab-archivo" data-testid="cabecera-archivo">
      <span className="icono-redondo">
        <FileText size={16} />
      </span>
      <div>
        <strong>{nombre}</strong>
        <small>
          {formatearBytes(bytes)}
          {detalle ? ` · ${detalle}` : ''}
        </small>
      </div>
      <button type="button" className="btn" onClick={alQuitar}>
        <RefreshCcw size={15} /> Cambiar archivo
      </button>
    </div>
  );
}
