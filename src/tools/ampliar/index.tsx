import { Maximize2 } from 'lucide-react';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { prepararParaSharp } from '../../lib/imagenesApp';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

interface Op {
  escala: 2 | 3 | 4;
  tipo: 'foto' | 'ilustracion';
}

export default function Ampliar() {
  return (
    <HerramientaConversion<Op>
      extensiones={['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'avif']}
      inicial={{ escala: 2, tipo: 'foto' }}
      requiere="realesrgan"
      boton="Ampliar"
      icono={Maximize2}
      nombreZip="ampliadas.zip"
      etiqueta="Arrastra una o varias imágenes"
      opciones={(o, c) => (
        <Panel titulo="Ampliación con IA">
          <div className="fila-campos">
            <Campo grupo etiqueta="Aumento">
              <Segmentado valor={o.escala} alCambiar={(escala) => c({ escala })} opciones={[{ valor: 2, texto: '×2' }, { valor: 3, texto: '×3' }, { valor: 4, texto: '×4' }]} />
            </Campo>
            <Campo grupo etiqueta="Tipo de imagen">
              <Segmentado valor={o.tipo} alCambiar={(tipo) => c({ tipo })} opciones={[{ valor: 'foto', texto: 'Fotografía' }, { valor: 'ilustracion', texto: 'Dibujo o ilustración' }]} />
            </Campo>
          </div>
          <p className="ayuda">
            Real-ESRGAN reconstruye el detalle con una red neuronal y usa la tarjeta gráfica (necesita Vulkan). Puede tardar de unos segundos a varios minutos según el tamaño; el máximo es de 8 megapíxeles por imagen.
          </p>
        </Panel>
      )}
      procesar={async ({ datos, archivo }, o, progreso) => {
        const api = requerirApi();
        const id = `ampliar-${Date.now()}`;
        const off = api.alProgreso((e) => {
          if (e.id === id) progreso(e.fraccion, e.mensaje);
        });
        try {
          progreso(0, `Ampliando ${archivo.name}…`);
          const png = await api.ia.ampliar(id, await prepararParaSharp(archivo, datos), o.escala, o.tipo);
          return { nombre: nombreSalida(archivo.name, `x${o.escala}`, 'png'), datos: png, mime: MIME.png };
        } finally {
          off();
        }
      }}
    />
  );
}
