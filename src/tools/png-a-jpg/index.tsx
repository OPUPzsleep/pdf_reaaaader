import { ArrowRightLeft } from 'lucide-react';
import { Campo, Panel } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';

interface Op {
  calidad: number;
  fondo: string;
}

/** PNG → JPG: el JPG no admite transparencia, así que las zonas transparentes se rellenan con un color. */
export default function PngAJpg() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['png', 'apng']}
      inicial={{ calidad: 90, fondo: '#ffffff' }}
      sufijo=""
      boton="Convertir a JPG"
      icono={ArrowRightLeft}
      etiqueta="Arrastra imágenes PNG"
      operacion={(o) => ({ tipo: 'convertir', formato: 'jpeg', calidad: o.calidad, fondo: o.fondo })}
      opciones={(o, c) => (
        <Panel titulo="Opciones de JPG">
          <div className="fila-campos">
            <Campo etiqueta={`Calidad: ${o.calidad} %`} ayuda="Más calidad, más peso.">
              <input type="range" min={40} max={100} value={o.calidad} onChange={(e) => c({ calidad: Number(e.target.value) })} data-testid="calidad" />
            </Campo>
            <Campo etiqueta="Color de fondo" ayuda="El JPG no admite transparencia: las partes transparentes se rellenan con este color.">
              <input type="color" className="entrada color" value={o.fondo} onChange={(e) => c({ fondo: e.target.value })} data-testid="fondo" />
            </Campo>
          </div>
        </Panel>
      )}
    />
  );
}
