import { useState } from 'react';
import { Code2 } from 'lucide-react';
import { Campo, Interruptor, Numero, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { MIME, requerirApi } from '../../lib/platform';
import { aSolicitud, ORIGEN_INICIAL, OrigenHtml } from '../comun/OrigenHtml';

export default function HtmlAPdf() {
  const [origen, setOrigen] = useState(ORIGEN_INICIAL);
  const [tamano, setTamano] = useState<'A4' | 'Letter' | 'A3' | 'Legal'>('A4');
  const [horizontal, setHorizontal] = useState(false);
  const [margen, setMargen] = useState(10);
  const [fondos, setFondos] = useState(true);
  const tarea = useTarea();
  const salida = useSalida();

  const convertir = () =>
    tarea.ejecutar(async (progreso) => {
      const api = requerirApi();
      const solicitud = aSolicitud(origen);
      progreso(-1, 'Cargando la página y generando el PDF…');
      const pdf = await api.html.aPdf({ origen: solicitud, pdf: { tamano, horizontal, margenMm: margen || 0, fondos } }).catch((e: Error) => {
        throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      });
      const nombre = origen.modo === 'archivo' && origen.archivo ? origen.archivo.name.replace(/\.[^.]+$/, '') + '.pdf' : 'pagina.pdf';
      await salida.guardar(nombre, pdf, MIME.pdf);
    });

  return (
    <div className="vista">
      <Panel titulo="Contenido">
        <OrigenHtml valor={origen} alCambiar={setOrigen} />
      </Panel>
      <Panel titulo="Página">
        <div className="fila-campos">
          <Campo grupo etiqueta="Tamaño">
            <Segmentado valor={tamano} alCambiar={setTamano} opciones={[{ valor: 'A4', texto: 'A4' }, { valor: 'Letter', texto: 'Carta' }, { valor: 'A3', texto: 'A3' }, { valor: 'Legal', texto: 'Legal' }]} />
          </Campo>
          <Campo grupo etiqueta="Orientación">
            <Segmentado valor={horizontal ? 'h' : 'v'} alCambiar={(v) => setHorizontal(v === 'h')} opciones={[{ valor: 'v', texto: 'Vertical' }, { valor: 'h', texto: 'Horizontal' }]} />
          </Campo>
          <Campo etiqueta="Margen (mm)">
            <Numero valor={margen} alCambiar={setMargen} min={0} max={50} ancho={90} />
          </Campo>
        </div>
        <Interruptor marcado={fondos} alCambiar={setFondos} texto="Imprimir colores e imágenes de fondo" />
      </Panel>
      <div className="acciones">
        <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
          <Code2 size={18} /> Convertir a PDF
        </button>
      </div>
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
