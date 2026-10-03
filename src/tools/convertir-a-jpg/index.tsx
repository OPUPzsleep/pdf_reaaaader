import { Image as ImageIcon } from 'lucide-react';
import { Campo, Panel } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';

interface Op {
  calidad: number;
  fondo: string;
}

export default function ConvertirAJpg() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'avif']}
      inicial={{ calidad: 90, fondo: '#ffffff' }}
      sufijo=""
      boton="Convertir a JPG"
      icono={ImageIcon}
      etiqueta="Arrastra imágenes PNG, WebP, GIF, BMP, TIFF o SVG"
      operacion={(o) => ({ tipo: 'convertir', formato: 'jpeg', calidad: o.calidad, fondo: o.fondo })}
      opciones={(o, c) => (
        <Panel titulo="Opciones de JPG">
          <div className="fila-campos">
            <Campo etiqueta={`Calidad: ${o.calidad} %`}>
              <input type="range" min={40} max={100} value={o.calidad} onChange={(e) => c({ calidad: Number(e.target.value) })} />
            </Campo>
            <Campo etiqueta="Color de fondo" ayuda="El JPG no admite transparencia: se rellena con este color.">
              <input type="color" className="entrada color" value={o.fondo} onChange={(e) => c({ fondo: e.target.value })} />
            </Campo>
          </div>
        </Panel>
      )}
    />
  );
}
