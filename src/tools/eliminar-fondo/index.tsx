import { Eraser } from 'lucide-react';
import { prepararParaSharp } from '../../lib/imagenesApp';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function EliminarFondo() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff', 'avif']}
      inicial={{}}
      requiere="modelo-fondo"
      boton="Quitar el fondo"
      icono={Eraser}
      nombreZip="sin_fondo.zip"
      etiqueta="Arrastra una o varias imágenes"
      opciones={() => (
        <p className="ayuda">
          Una red neuronal (ISNet) detecta el objeto principal y deja el resto transparente. Funciona mejor con un sujeto claro: personas, productos, animales. El resultado se guarda como PNG con transparencia.
        </p>
      )}
      procesar={async ({ datos, archivo }, _o, progreso) => {
        const api = requerirApi();
        progreso(-1, `Quitando el fondo de ${archivo.name}…`);
        const png = await api.ia.quitarFondo('fondo', await prepararParaSharp(archivo, datos));
        return { nombre: nombreSalida(archivo.name, 'sin-fondo', 'png'), datos: png, mime: MIME.png };
      }}
    />
  );
}
