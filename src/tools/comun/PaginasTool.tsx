import { useState } from 'react';
import { FileOutput, Trash2 } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { SelectorPaginas } from '../../components/SelectorPaginas';
import { usePdfjs, useSalida, useTarea } from '../../lib/hooks';
import { eliminarPaginas, extraerPaginas } from '../../lib/pdf/paginas';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME } from '../../lib/platform';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { CabeceraArchivo } from './CabeceraArchivo';

/** Vista común de "Eliminar páginas" y "Extraer páginas": miniaturas seleccionables + campo de rangos. */
export function PaginasTool({ modo }: { modo: 'eliminar' | 'conservar' }) {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const { doc } = usePdfjs(pdf?.datos ?? null);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const tarea = useTarea();
  const salida = useSalida();

  const ejecutar = () =>
    tarea.ejecutar(async () => {
      if (!pdf) return;
      if (modo === 'eliminar') {
        const r = await eliminarPaginas(pdf.datos, seleccion);
        await salida.guardar(nombreSalida(pdf.nombre, 'sin-paginas', 'pdf'), r, MIME.pdf, `${pdf.paginas - seleccion.length} páginas restantes`);
      } else {
        const r = await extraerPaginas(pdf.datos, seleccion);
        await salida.guardar(nombreSalida(pdf.nombre, 'extraido', 'pdf'), r, MIME.pdf, `${seleccion.length} páginas extraídas`);
      }
    });

  const invalido = seleccion.length === 0 || (modo === 'eliminar' && pdf !== null && seleccion.length >= pdf.paginas);

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void cargar(a[0])} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo
            nombre={pdf.nombre}
            bytes={pdf.datos.byteLength}
            detalle={`${pdf.paginas} páginas`}
            alQuitar={() => {
              quitar();
              setSeleccion([]);
              salida.limpiar();
            }}
          />
          {doc ? (
            <SelectorPaginas doc={doc} total={pdf.paginas} seleccion={seleccion} alCambiar={setSeleccion} modo={modo} />
          ) : (
            <div className="cargando">Preparando miniaturas…</div>
          )}
          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={invalido || tarea.ocupado} onClick={ejecutar} data-testid="accion">
              {modo === 'eliminar' ? <Trash2 size={18} /> : <FileOutput size={18} />}
              {modo === 'eliminar' ? `Eliminar ${seleccion.length} página${seleccion.length === 1 ? '' : 's'}` : `Extraer ${seleccion.length} página${seleccion.length === 1 ? '' : 's'}`}
            </button>
            {modo === 'eliminar' && pdf.paginas === seleccion.length && <span className="ayuda">No puedes eliminar todas las páginas.</span>}
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
