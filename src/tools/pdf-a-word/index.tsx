import { useEffect, useRef, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Interruptor, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { metadatosDelPdf } from '../../lib/epub';
import { crearRenderNavegador } from '../../lib/epub/renderNavegador';
import { OPCIONES_WORD_POR_DEFECTO, convertirPdfADocx, type OpcionesWord, type ResumenOffice as Resumen } from '../../lib/office/pdfADocx';
import { nombreBase } from '../../lib/pdf/nombres';
import { OPERADORES, abrirPdfjs, cerrarPdfjs } from '../../lib/pdfjs';
import { MIME } from '../../lib/platform';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';
import { ResumenOffice } from '../comun/ResumenOffice';

export default function PdfAWord() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [op, setOp] = useState<OpcionesWord>(OPCIONES_WORD_POR_DEFECTO);
  const [meta, setMeta] = useState({ titulo: '', autor: '' });
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const cancelado = useRef(false);
  const tarea = useTarea();
  const salida = useSalida();
  const cambiar = <K extends keyof OpcionesWord>(k: K, v: OpcionesWord[K]) => setOp((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    if (!pdf) return;
    let vivo = true;
    void (async () => {
      const doc = await abrirPdfjs(pdf.datos).catch(() => null);
      if (!doc) return;
      try {
        const m = await metadatosDelPdf(doc);
        if (vivo) setMeta({ titulo: m.titulo || nombreBase(pdf.nombre), autor: m.autor });
      } finally {
        void cerrarPdfjs(doc);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pdf]);

  const convertir = () =>
    tarea.ejecutar(async (progreso) => {
      if (!pdf) return;
      cancelado.current = false;
      setResumen(null);
      const doc = await abrirPdfjs(pdf.datos);
      try {
        const r = await convertirPdfADocx({
          doc,
          ops: OPERADORES,
          render: crearRenderNavegador(doc, op.ocr ? { idioma: op.idiomaOcr } : undefined),
          opciones: op,
          nombreArchivo: pdf.nombre,
          progreso: (f, m) => progreso(f, m),
          cancelado: () => cancelado.current,
        });
        setResumen(r.resumen);
        await salida.guardar(`${nombreBase(pdf.nombre)}.docx`, r.datos, MIME.docx, `${r.resumen.paginas} páginas${r.resumen.tablas ? ` · ${r.resumen.tablas} ${r.resumen.tablas === 1 ? 'tabla' : 'tablas'}` : ''}`);
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
          <Panel titulo="Qué se convierte">
            <Interruptor marcado={op.tablas} alCambiar={(v) => cambiar('tablas', v)} texto="Detectar las tablas y escribirlas como tablas de Word" />
            <Interruptor marcado={op.incluirImagenes} alCambiar={(v) => cambiar('incluirImagenes', v)} texto="Incluir las imágenes" />
            <Interruptor marcado={op.quitarCabeceras} alCambiar={(v) => cambiar('quitarCabeceras', v)} texto="Quitar cabeceras, pies de página y números de página" />
            <Interruptor marcado={op.ocr} alCambiar={(v) => cambiar('ocr', v)} texto="Reconocer el texto de páginas escaneadas (OCR)" />
            {op.ocr && (
              <Campo grupo etiqueta="Idioma del OCR" ayuda="El OCR es lento (unos segundos por página) y puede cometer errores. Solo se aplica a las páginas sin texto.">
                <Segmentado
                  valor={op.idiomaOcr}
                  alCambiar={(v) => cambiar('idiomaOcr', v)}
                  opciones={[{ valor: 'spa+eng', texto: 'Español + inglés' }, { valor: 'spa', texto: 'Español' }, { valor: 'eng', texto: 'Inglés' }]}
                />
              </Campo>
            )}
            <p className="ayuda">
              El documento se reconstruye con títulos, párrafos con negrita y cursiva, listas, tablas e imágenes. El texto fluye por la página como en cualquier documento de Word, así que la
              maquetación (columnas, cuadros, posiciones exactas) no se reproduce al pie de la letra. Las páginas escaneadas necesitan OCR para tener texto editable.
            </p>
          </Panel>
          <Panel titulo="Datos del documento">
            <div className="fila-campos">
              <Campo etiqueta="Título">
                <input className="entrada ancho" value={op.titulo} placeholder={meta.titulo} onChange={(e) => cambiar('titulo', e.target.value)} data-testid="campo-titulo" />
              </Campo>
              <Campo etiqueta="Autor">
                <input className="entrada ancho" value={op.autor} placeholder={meta.autor || 'Desconocido'} onChange={(e) => cambiar('autor', e.target.value)} data-testid="campo-autor" />
              </Campo>
            </div>
          </Panel>
          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
              <FileText size={18} /> Convertir a Word
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
        <ResumenOffice
          testId="resumen-word"
          lineas={[`Páginas: ${resumen.paginas}`, `Tablas: ${resumen.tablas}`, `Imágenes: ${resumen.imagenes}`, `Idioma: ${resumen.idioma}`]}
          advertencias={resumen.advertencias}
        />
      )}
    </div>
  );
}
