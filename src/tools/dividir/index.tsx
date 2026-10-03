import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Numero, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { dividirPdf, type ModoDivision } from '../../lib/pdf/dividir';
import { nombreBase } from '../../lib/pdf/nombres';
import { crearZip } from '../../lib/pdf/zip';
import { MIME } from '../../lib/platform';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';

export default function Dividir() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [tipo, setTipo] = useState<ModoDivision['tipo']>('rangos');
  const [texto, setTexto] = useState('');
  const [n, setN] = useState(1);
  const tarea = useTarea();
  const salida = useSalida();

  const dividir = () =>
    tarea.ejecutar(async (progreso) => {
      if (!pdf) return;
      const modo: ModoDivision = tipo === 'rangos' ? { tipo, texto } : tipo === 'cada' ? { tipo, n } : { tipo };
      const partes = await dividirPdf(pdf.datos, modo, (f) => progreso(f * 0.9, 'Dividiendo…'));
      const base = nombreBase(pdf.nombre);
      if (partes.length === 1) {
        await salida.guardar(`${base}_${partes[0].etiqueta}.pdf`, partes[0].datos, MIME.pdf, '1 archivo');
        return;
      }
      progreso(0.95, 'Creando ZIP…');
      const zip = await crearZip(partes.map((p) => ({ nombre: `${base}_${p.etiqueta}.pdf`, datos: p.datos })));
      await salida.guardar(`${base}_dividido.zip`, zip, MIME.zip, `${partes.length} archivos PDF dentro del ZIP`);
    });

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void cargar(a[0])} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo nombre={pdf.nombre} bytes={pdf.datos.byteLength} detalle={`${pdf.paginas} páginas`} alQuitar={() => { quitar(); salida.limpiar(); }} />
          <Panel titulo="Cómo dividir">
            <Segmentado
              valor={tipo}
              alCambiar={setTipo}
              opciones={[
                { valor: 'rangos', texto: 'Por rangos' },
                { valor: 'cada', texto: 'Cada N páginas' },
                { valor: 'una', texto: 'Una página por archivo' },
              ]}
            />
            {tipo === 'rangos' && (
              <Campo etiqueta="Rangos" ayuda="Cada rango o página suelta genera un PDF. Ej.: 1-3, 5, 7-9">
                <input className="entrada" value={texto} placeholder="1-3, 5, 7-9" onChange={(e) => setTexto(e.target.value)} data-testid="campo-rangos" />
              </Campo>
            )}
            {tipo === 'cada' && (
              <Campo etiqueta="Páginas por parte" ayuda={`Se crearán ${Math.ceil(pdf.paginas / Math.max(1, Math.floor(n) || 1))} archivos.`}>
                <Numero valor={n} alCambiar={setN} min={1} max={pdf.paginas} ancho={110} />
              </Campo>
            )}
            {tipo === 'una' && <p className="ayuda">Se creará un PDF por cada una de las {pdf.paginas} páginas, empaquetados en un ZIP.</p>}
          </Panel>
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={dividir} data-testid="accion">
              <Scissors size={18} /> Dividir PDF
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
