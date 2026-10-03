export function ProgressBar({ fraccion, mensaje }: { fraccion: number; mensaje?: string }) {
  const indeterminado = fraccion < 0;
  return (
    <div className="progreso" role="progressbar" aria-valuenow={indeterminado ? undefined : Math.round(fraccion * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progreso-barra">
        <div className={'progreso-relleno' + (indeterminado ? ' indeterminado' : '')} style={indeterminado ? undefined : { width: `${Math.round(fraccion * 100)}%` }} />
      </div>
      <span>{mensaje || (indeterminado ? 'Procesando…' : `${Math.round(fraccion * 100)} %`)}</span>
    </div>
  );
}
