import { useState } from 'react';
import { Code2 } from 'lucide-react';
import { Campo, Numero, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { MIME, requerirApi } from '../../lib/platform';
import { aSolicitud, ORIGEN_INICIAL, OrigenHtml } from '../comun/OrigenHtml';

export default function HtmlAImagen() {
  const [origen, setOrigen] = useState(ORIGEN_INICIAL);
  const [ancho, setAncho] = useState(1280);
  const [formato, setFormato] = useState<'png' | 'jpeg'>('png');
  const [calidad, setCalidad] = useState(90);
  const tarea = useTarea();
  const salida = useSalida();

  const capturar = () =>
    tarea.ejecutar(async (progreso) => {
      const api = requerirApi();
      const solicitud = aSolicitud(origen);
      progreso(-1, 'Cargando la página y capturándola…');
      const img = await api.html.aImagen({ origen: solicitud, imagen: { ancho: ancho || 1280, formato, calidad } }).catch((e: Error) => {
        throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      });
      const base = origen.modo === 'archivo' && origen.archivo ? origen.archivo.name.replace(/\.[^.]+$/, '') : 'captura';
      await salida.guardar(`${base}.${formato === 'jpeg' ? 'jpg' : 'png'}`, img, formato === 'jpeg' ? MIME.jpg : MIME.png, `Ancho ${ancho || 1280} px, página completa`);
    });

  return (
    <div className="vista">
      <Panel titulo="Contenido">
        <OrigenHtml valor={origen} alCambiar={setOrigen} />
      </Panel>
      <Panel titulo="Imagen">
        <div className="fila-campos">
          <Campo etiqueta="Ancho de la ventana (px)" ayuda="La captura incluye toda la página, de arriba abajo.">
            <Numero valor={ancho} alCambiar={setAncho} min={320} max={4000} ancho={120} />
          </Campo>
          <Campo grupo etiqueta="Formato">
            <Segmentado valor={formato} alCambiar={setFormato} opciones={[{ valor: 'png', texto: 'PNG' }, { valor: 'jpeg', texto: 'JPG' }]} />
          </Campo>
          {formato === 'jpeg' && (
            <Campo etiqueta={`Calidad: ${calidad} %`}>
              <input type="range" min={50} max={100} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} />
            </Campo>
          )}
        </div>
      </Panel>
      <div className="acciones">
        <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={capturar} data-testid="accion">
          <Code2 size={18} /> Capturar como imagen
        </button>
      </div>
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
