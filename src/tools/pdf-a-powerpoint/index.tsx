import { useRef, useState } from 'react';
import { Presentation, X } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Interruptor, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { crearRenderNavegador } from '../../lib/epub/renderNavegador';
import { OPCIONES_POWERPOINT_POR_DEFECTO, convertirPdfAPptx, type OpcionesPowerpoint } from '../../lib/office/pdfAPptx';
import { nombreBase } from '../../lib/pdf/nombres';
import { OPERADORES, abrirPdfjs, cerrarPdfjs } from '../../lib/pdfjs';
import { MIME } from '../../lib/platform';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';
import { ResumenOffice } from '../comun/ResumenOffice';

export default function PdfAPowerpoint() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [op, setOp] = useState<OpcionesPowerpoint>(OPCIONES_POWERPOINT_POR_DEFECTO);
  const [resumen, setResumen] = useState<{ paginas: number; cajas: number; advertencias: string[] } | null>(null);
  const cancelado = useRef(false);
  const tarea = useTarea();
  const salida = useSalida();
  const cambiar = <K extends keyof OpcionesPowerpoint>(k: K, v: OpcionesPowerpoint[K]) => setOp((o) => ({ ...o, [k]: v }));

  const convertir = () =>
    tarea.ejecutar(async (progreso) => {
      if (!pdf) return;
      cancelado.current = false;
      setResumen(null);
      const doc = await abrirPdfjs(pdf.datos);
      try {
        const r = await convertirPdfAPptx({
          doc,
          ops: OPERADORES,
          render: crearRenderNavegador(doc, op.modo === 'editable' && op.ocr ? { idioma: op.idiomaOcr } : undefined),
          opciones: op,
          nombreArchivo: pdf.nombre,
          progreso: (f, m) => progreso(f, m),
          cancelado: () => cancelado.current,
        });
        setResumen({ paginas: r.resumen.paginas, cajas: r.resumen.cajas, advertencias: r.resumen.advertencias });
        await salida.guardar(`${nombreBase(pdf.nombre)}.pptx`, r.datos, MIME.pptx, `${r.resumen.paginas} diapositivas`);
      } finally {
        void cerrarPdfjs(doc);
      }
    });

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void cargar(a[0]).then(() => { setResumen(null); salida.limpiar(); })} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo nombre={pdf.nombre} bytes={pdf.datos.byteLength} detalle={`${pdf.paginas} páginas`} alQuitar={() => { quitar(); setResumen(null); salida.limpiar(); }} />
          <Panel titulo="Tipo de diapositivas">
            <Segmentado
              valor={op.modo}
              alCambiar={(m) => cambiar('modo', m)}
              opciones={[{ valor: 'editable', texto: 'Texto editable sobre el fondo (recomendado)' }, { valor: 'imagen', texto: 'Solo imágenes' }]}
            />
            <p className="ayuda">
              {op.modo === 'editable'
                ? 'Cada página es una diapositiva: el fondo, los dibujos y las fotos se conservan como imagen y el texto pasa a cuadros de texto que puedes editar, con su tamaño, negrita, cursiva y color. Las fuentes que no tengas instaladas se sustituyen por otras parecidas.'
                : 'Cada página es una imagen que ocupa toda la diapositiva: idéntica al PDF, pero sin texto editable.'}
            </p>
            {op.modo === 'editable' && (
              <>
                <Interruptor marcado={op.ocr} alCambiar={(v) => cambiar('ocr', v)} texto="Reconocer el texto de páginas escaneadas (OCR)" />
                {op.ocr && (
                  <Campo grupo etiqueta="Idioma del OCR" ayuda="El texto reconocido queda sobre la imagen original, sin verse, para poder buscarlo y copiarlo.">
                    <Segmentado
                      valor={op.idiomaOcr}
                      alCambiar={(v) => cambiar('idiomaOcr', v)}
                      opciones={[{ valor: 'spa+eng', texto: 'Español + inglés' }, { valor: 'spa', texto: 'Español' }, { valor: 'eng', texto: 'Inglés' }]}
                    />
                  </Campo>
                )}
              </>
            )}
          </Panel>
          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
              <Presentation size={18} /> Convertir a PowerPoint
            </button>
            {tarea.ocupado && (
              <button type="button" className="btn" onClick={() => (cancelado.current = true)}>
                <X size={16} /> Cancelar
              </button>
            )}
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
      {resumen && !tarea.ocupado && (
        <ResumenOffice testId="resumen-pptx" lineas={[`Diapositivas: ${resumen.paginas}`, ...(op.modo === 'editable' ? [`Cuadros de texto editables: ${resumen.cajas}`] : [])]} advertencias={resumen.advertencias} />
      )}
    </div>
  );
}
