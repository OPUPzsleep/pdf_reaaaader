import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

/** Panel con los datos de una conversión (tablas, imágenes…) y sus advertencias */
export function ResumenOffice({ lineas, advertencias, testId }: { lineas: ReactNode[]; advertencias: string[]; testId: string }) {
  return (
    <div className="panel" data-testid={testId}>
      <h3>
        <Info size={15} style={{ verticalAlign: '-2px' }} /> Resumen de la conversión
      </h3>
      <ul className="resumen-lista">
        {lineas.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {advertencias.map((a) => (
        <div key={a} className="error aviso-epub" role="alert">
          <AlertTriangle size={16} />
          <span>{a}</span>
        </div>
      ))}
    </div>
  );
}
