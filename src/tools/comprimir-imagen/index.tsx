import { ImageDown } from 'lucide-react';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';
import type { FormatoImagen } from '../../types/api';

interface Op {
  calidad: number;
  formato: 'igual' | FormatoImagen;
}

export default function ComprimirImagen() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['jpg', 'jpeg', 'png', 'webp']}
      inicial={{ calidad: 75, formato: 'igual' }}
      sufijo="comprimida"
      boton="Comprimir"
      icono={ImageDown}
      comparar
      operacion={(o) => ({ tipo: 'comprimir', calidad: o.calidad, formato: o.formato === 'igual' ? undefined : o.formato })}
      opciones={(o, c) => (
        <Panel titulo="Nivel de compresión">
          <Campo etiqueta={`Calidad: ${o.calidad} %`} ayuda="Menos calidad = archivo más pequeño. Entre 60 y 80 casi no se nota.">
            <input type="range" min={20} max={100} value={o.calidad} onChange={(e) => c({ calidad: Number(e.target.value) })} />
          </Campo>
          <Campo grupo etiqueta="Formato de salida" ayuda="WebP suele pesar menos que JPG con la misma calidad.">
            <Segmentado valor={o.formato} alCambiar={(formato) => c({ formato })} opciones={[{ valor: 'igual', texto: 'El mismo' }, { valor: 'jpeg', texto: 'JPG' }, { valor: 'webp', texto: 'WebP' }]} />
          </Campo>
        </Panel>
      )}
    />
  );
}
