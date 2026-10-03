/** "informe final.pdf" → "informe final" */
export function nombreBase(nombre: string): string {
  return nombre.replace(/\.[^./\\]+$/, '');
}

export function nombreSalida(original: string, sufijo: string, extension: string): string {
  const base = nombreBase(original) || 'documento';
  return `${base}${sufijo ? '_' + sufijo : ''}.${extension.replace(/^\./, '')}`;
}

export function formatearBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
