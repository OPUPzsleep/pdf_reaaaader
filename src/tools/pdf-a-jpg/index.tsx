import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { abrirPdfjs, cerrarPdfjs, paginaABytes } from '../../lib/pdfjs';
import { nombreBase } from '../../lib/pdf/nombres';
import { crearZip } from '../../lib/pdf/zip';
import { MIME } from '../../lib/platform';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';

export default function PdfAJpg() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [dpi, setDpi] = useState(150);
  const [formato, setFormato] = useState<'jpg' | 'png'>('jpg');
  const [calidad, setCalidad] = useState(90);
  const tarea = useTarea();
  const salida = useSalida();

  const convertir = () =>
    tarea.ejecutar(async (progreso) => {
      if (!pdf) return;
      const doc = await abrirPdfjs(pdf.datos);
      try {
        const base = nombreBase(pdf.nombre);
        const ancho = String(doc.numPages).length;
        const archivos: { nombre: string; datos: Uint8Array }[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          progreso((i - 1) / doc.numPages, `Página ${i} de ${doc.numPages}…`);
          const datos = await paginaABytes(doc, i, dpi, formato === 'jpg' ? 'image/jpeg' : 'image/png', calidad / 100);
          archivos.push({ nombre: `${base}_pagina-${String(i).padStart(Math.max(ancho, 2), '0')}.${formato}`, datos });
        }
        if (archivos.length === 1) {
          await salida.guardar(archivos[0].nombre, archivos[0].datos, formato === 'jpg' ? MIME.jpg : MIME.png, `${dpi} DPI`);
        } else {
          progreso(0.98, 'Creando ZIP…');
          await salida.guardar(`${base}_imagenes.zip`, await crearZip(archivos), MIME.zip, `${archivos.length} imágenes a ${dpi} DPI`);
        }
      } finally {
        void cerrarPdfjs(doc);
      }
    });

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void cargar(a[0])} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo nombre={pdf.nombre} bytes={pdf.datos.byteLength} detalle={`${pdf.paginas} páginas`} alQuitar={() => { quitar(); salida.limpiar(); }} />
          <Panel titulo="Calidad de la imagen">
            <Campo grupo etiqueta="Resolución (DPI)" ayuda="150 es buena para pantalla; 300 para imprimir. Más DPI = imágenes más pesadas.">
              <Segmentado
                valor={dpi}
                alCambiar={setDpi}
                opciones={[72, 150, 200, 300, 600].map((d) => ({ valor: d, texto: String(d) }))}
              />
            </Campo>
            <Campo grupo etiqueta="Formato">
              <Segmentado valor={formato} alCambiar={setFormato} opciones={[{ valor: 'jpg', texto: 'JPG' }, { valor: 'png', texto: 'PNG (sin pérdida)' }]} />
            </Campo>
            {formato === 'jpg' && (
              <Campo etiqueta={`Calidad JPG: ${calidad} %`}>
                <input type="range" min={50} max={100} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} />
              </Campo>
            )}
          </Panel>
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
              <ImageIcon size={18} /> Convertir a {formato.toUpperCase()}
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
