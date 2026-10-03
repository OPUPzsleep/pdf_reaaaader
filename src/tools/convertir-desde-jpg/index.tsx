import { Braces } from 'lucide-react';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';

interface Op {
  formato: 'png' | 'webp' | 'gif';
  calidad: number;
}

export default function ConvertirDesdeJpg() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['jpg', 'jpeg']}
      inicial={{ formato: 'png', calidad: 90 }}
      sufijo=""
      boton="Convertir"
      icono={Braces}
      etiqueta="Arrastra imágenes JPG"
      operacion={(o) => ({ tipo: 'convertir', formato: o.formato, calidad: o.calidad })}
      opciones={(o, c) => (
        <Panel titulo="Convertir a">
          <Segmentado valor={o.formato} alCambiar={(formato) => c({ formato })} opciones={[{ valor: 'png', texto: 'PNG' }, { valor: 'webp', texto: 'WebP' }, { valor: 'gif', texto: 'GIF' }]} />
          {o.formato === 'webp' && (
            <Campo etiqueta={`Calidad WebP: ${o.calidad} %`}>
              <input type="range" min={40} max={100} value={o.calidad} onChange={(e) => c({ calidad: Number(e.target.value) })} />
            </Campo>
          )}
        </Panel>
      )}
    />
  );
}
