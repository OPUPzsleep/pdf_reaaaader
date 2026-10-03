import { ArrowRightLeft } from 'lucide-react';
import { Panel } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';

/** JPG → PNG: una imagen PNG por cada JPG, sin tocar el tamaño. */
export default function JpgAPng() {
  return (
    <HerramientaImagenes<Record<string, never>>
      extensiones={['jpg', 'jpeg', 'jfif']}
      inicial={{}}
      sufijo=""
      boton="Convertir a PNG"
      icono={ArrowRightLeft}
      etiqueta="Arrastra imágenes JPG"
      operacion={() => ({ tipo: 'convertir', formato: 'png' })}
      opciones={() => (
        <Panel titulo="Resultado">
          <p className="ayuda">
            Cada JPG se guarda como PNG con el mismo tamaño en píxeles. El PNG no pierde calidad al guardarse, pero pesa más que el JPG y no recupera
            lo que el JPG ya había perdido.
          </p>
        </Panel>
      )}
    />
  );
}
