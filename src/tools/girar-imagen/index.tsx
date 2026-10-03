import { RefreshCw } from 'lucide-react';
import { Interruptor, Panel, Segmentado } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';

interface Op {
  grados: 0 | 90 | 180 | 270;
  volteoH: boolean;
  volteoV: boolean;
}

export default function GirarImagen() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif']}
      inicial={{ grados: 90, volteoH: false, volteoV: false }}
      sufijo="girada"
      boton="Girar imagen"
      icono={RefreshCw}
      operacion={(o) => ({ tipo: 'girar', grados: o.grados, volteoH: o.volteoH, volteoV: o.volteoV })}
      miniatura={(it, o) => (
        <img
          src={it.url}
          alt=""
          style={{ transform: `rotate(${o.grados}deg) scale(${o.volteoH ? -1 : 1}, ${o.volteoV ? -1 : 1})`, transition: 'transform 0.2s' }}
        />
      )}
      opciones={(o, c) => (
        <Panel titulo="Giro y volteo">
          <Segmentado
            valor={o.grados}
            alCambiar={(grados) => c({ grados })}
            opciones={[{ valor: 0, texto: 'Sin girar' }, { valor: 90, texto: '90° derecha' }, { valor: 180, texto: '180°' }, { valor: 270, texto: '90° izquierda' }]}
          />
          <Interruptor marcado={o.volteoH} alCambiar={(volteoH) => c({ volteoH })} texto="Voltear en horizontal (espejo)" />
          <Interruptor marcado={o.volteoV} alCambiar={(volteoV) => c({ volteoV })} texto="Voltear en vertical" />
        </Panel>
      )}
    />
  );
}
