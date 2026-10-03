import { Campo, Segmentado } from '../../components/forms';
import { FileDropzone } from '../../components/FileDropzone';
import type { SolicitudHtml } from '../../types/api';
import { requerirApi } from '../../lib/platform';

export type OrigenEditable = 'url' | 'html' | 'archivo';

export interface EstadoOrigen {
  modo: OrigenEditable;
  url: string;
  html: string;
  archivo: File | null;
}

export const ORIGEN_INICIAL: EstadoOrigen = { modo: 'url', url: '', html: '', archivo: null };

export function aSolicitud(o: EstadoOrigen): SolicitudHtml['origen'] {
  if (o.modo === 'url') {
    const url = o.url.trim();
    if (!url) throw new Error('Escribe la dirección de la página.');
    return { tipo: 'url', url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
  }
  if (o.modo === 'html') {
    if (!o.html.trim()) throw new Error('Pega el código HTML.');
    return { tipo: 'html', html: o.html };
  }
  if (!o.archivo) throw new Error('Elige un archivo .html.');
  return { tipo: 'archivo', ruta: requerirApi().rutaDeArchivo(o.archivo) };
}

/** Selector del origen del contenido: dirección web, archivo .html o código pegado. */
export function OrigenHtml({ valor, alCambiar }: { valor: EstadoOrigen; alCambiar(v: EstadoOrigen): void }) {
  return (
    <div className="origen-html">
      <Segmentado
        valor={valor.modo}
        alCambiar={(modo) => alCambiar({ ...valor, modo })}
        opciones={[{ valor: 'url', texto: 'Dirección web (URL)' }, { valor: 'archivo', texto: 'Archivo .html' }, { valor: 'html', texto: 'Pegar código' }]}
      />
      {valor.modo === 'url' && (
        <Campo etiqueta="Dirección" ayuda="Necesita conexión a internet solo para esta opción.">
          <input className="entrada" value={valor.url} placeholder="https://ejemplo.com" onChange={(e) => alCambiar({ ...valor, url: e.target.value })} data-testid="campo-url" />
        </Campo>
      )}
      {valor.modo === 'archivo' && (
        <>
          <FileDropzone extensiones={['html', 'htm']} compacto alElegir={(a) => alCambiar({ ...valor, archivo: a[0] })} etiqueta={valor.archivo ? `Archivo: ${valor.archivo.name}` : 'Elige un archivo .html'} />
        </>
      )}
      {valor.modo === 'html' && (
        <Campo etiqueta="Código HTML">
          <textarea
            className="entrada"
            rows={10}
            value={valor.html}
            placeholder="<h1>Hola</h1>"
            onChange={(e) => alCambiar({ ...valor, html: e.target.value })}
            data-testid="campo-html"
          />
        </Campo>
      )}
    </div>
  );
}
