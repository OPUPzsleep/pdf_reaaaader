import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Info, X } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Interruptor, Numero, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { OPERADORES, abrirPdfjs, cerrarPdfjs } from '../../lib/pdfjs';
import { convertirPdfAEpub, metadatosDelPdf, OPCIONES_EPUB_POR_DEFECTO, type OpcionesEpub, type ResumenConversion } from '../../lib/epub';
import { crearRenderNavegador } from '../../lib/epub/renderNavegador';
import { nombreBase } from '../../lib/pdf/nombres';
import { MIME } from '../../lib/platform';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';

const IDIOMAS = [
  { valor: 'auto', texto: 'Detectar automáticamente' },
  { valor: 'es', texto: 'Español' },
  { valor: 'en', texto: 'Inglés' },
  { valor: 'fr', texto: 'Francés' },
  { valor: 'de', texto: 'Alemán' },
  { valor: 'pt', texto: 'Portugués' },
  { valor: 'it', texto: 'Italiano' },
  { valor: 'ca', texto: 'Catalán' },
];

export default function PdfAEpub() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [op, setOp] = useState<OpcionesEpub>(OPCIONES_EPUB_POR_DEFECTO);
  const [meta, setMeta] = useState<{ titulo: string; autor: string }>({ titulo: '', autor: '' });
  const [resumen, setResumen] = useState<ResumenConversion | null>(null);
  const cancelado = useRef(false);
  const tarea = useTarea();
  const salida = useSalida();
  const cambiar = <K extends keyof OpcionesEpub>(k: K, v: OpcionesEpub[K]) => setOp((o) => ({ ...o, [k]: v }));

  const alCargar = async (f: File) => {
    await cargar(f);
    setResumen(null);
    salida.limpiar();
    setOp((o) => ({ ...o, titulo: '', autor: '' }));
  };

  // Al elegir el PDF se leen su título y autor para mostrarlos como sugerencia
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
        const render = crearRenderNavegador(doc, op.ocr ? { idioma: op.idiomaOcr } : undefined);
        const r = await convertirPdfAEpub({
          doc,
          ops: OPERADORES,
          render,
          opciones: op,
          nombreArchivo: pdf.nombre,
          progreso: (f, m) => progreso(f, m),
          cancelado: () => cancelado.current,
        });
        setResumen(r.resumen);
        await salida.guardar(
          `${nombreBase(pdf.nombre)}.epub`,
          r.datos,
          MIME.epub,
          `${r.resumen.capitulos} ${r.resumen.capitulos === 1 ? 'capítulo' : 'capítulos'} · ${r.resumen.paginas} páginas`,
        );
      } finally {
        void cerrarPdfjs(doc);
      }
    });

  const adaptable = op.modo === 'adaptable';

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void alCargar(a[0])} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo nombre={pdf.nombre} bytes={pdf.datos.byteLength} detalle={`${pdf.paginas} páginas`} alQuitar={() => { quitar(); setResumen(null); salida.limpiar(); }} />

          <Panel titulo="Tipo de libro electrónico">
            <Segmentado
              valor={op.modo}
              alCambiar={(m) => cambiar('modo', m)}
              opciones={[{ valor: 'adaptable', texto: 'Texto adaptable (recomendado)' }, { valor: 'fijo', texto: 'Diseño fijo (cada página como imagen)' }]}
            />
            <p className="ayuda">
              {adaptable
                ? 'El texto se ajusta al tamaño de letra y a la pantalla de tu lector, como en un libro electrónico normal. Funciona mejor con libros y documentos de texto.'
                : 'Cada página se conserva exactamente como en el PDF. Es lo mejor para cómics, revistas, partituras o PDF con columnas y tablas complejas, pero el texto no se puede reajustar.'}
            </p>
          </Panel>

          <Panel titulo="Datos del libro">
            <div className="fila-campos">
              <Campo etiqueta="Título">
                <input className="entrada ancho" value={op.titulo} placeholder={meta.titulo} onChange={(e) => cambiar('titulo', e.target.value)} data-testid="campo-titulo" />
              </Campo>
              <Campo etiqueta="Autor">
                <input className="entrada ancho" value={op.autor} placeholder={meta.autor || 'Desconocido'} onChange={(e) => cambiar('autor', e.target.value)} data-testid="campo-autor" />
              </Campo>
              {adaptable && (
                <Campo etiqueta="Idioma del texto">
                  <select className="entrada" value={op.idioma} onChange={(e) => cambiar('idioma', e.target.value)} data-testid="campo-idioma">
                    {IDIOMAS.map((i) => (
                      <option key={i.valor} value={i.valor}>
                        {i.texto}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
            </div>
          </Panel>

          {adaptable && (
            <>
              <Panel titulo="Capítulos">
                <Segmentado
                  valor={op.capitulos}
                  alCambiar={(c) => cambiar('capitulos', c)}
                  opciones={[
                    { valor: 'auto', texto: 'Automático' },
                    { valor: 'marcadores', texto: 'Marcadores del PDF' },
                    { valor: 'titulos', texto: 'Títulos del texto' },
                    { valor: 'paginas', texto: 'Cada N páginas' },
                  ]}
                />
                {op.capitulos === 'paginas' && (
                  <Campo etiqueta="Páginas por capítulo">
                    <Numero valor={op.paginasPorCapitulo} alCambiar={(n) => cambiar('paginasPorCapitulo', n || 1)} min={1} max={500} ancho={110} />
                  </Campo>
                )}
                <p className="ayuda">
                  Automático usa los marcadores (índice) del PDF si existen; si no, los títulos grandes que encuentre, y como último recurso divide cada {op.paginasPorCapitulo} páginas.
                </p>
              </Panel>

              <Panel titulo="Contenido">
                <Interruptor marcado={op.quitarCabeceras} alCambiar={(v) => cambiar('quitarCabeceras', v)} texto="Quitar cabeceras, pies de página y números de página" />
                <Interruptor marcado={op.incluirImagenes} alCambiar={(v) => cambiar('incluirImagenes', v)} texto="Incluir las imágenes" />
                <Interruptor marcado={op.portada} alCambiar={(v) => cambiar('portada', v)} texto="Usar la primera página como portada" />
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
              </Panel>
            </>
          )}

          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
              <BookOpen size={18} /> Convertir a EPUB
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
        <div className="panel" data-testid="resumen-epub">
          <h3>
            <Info size={15} style={{ verticalAlign: '-2px' }} /> Resumen de la conversión
          </h3>
          <ul className="resumen-lista">
            <li>Modo: {resumen.estrategia === 'diseño fijo' ? 'diseño fijo' : 'texto adaptable'}</li>
            <li>Capítulos: {resumen.capitulos} ({resumen.estrategia})</li>
            <li>Imágenes: {resumen.imagenes}</li>
            <li>Idioma: {resumen.idioma}</li>
          </ul>
          {resumen.advertencias.map((a) => (
            <div key={a} className="error aviso-epub" role="alert">
              <AlertTriangle size={16} />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
