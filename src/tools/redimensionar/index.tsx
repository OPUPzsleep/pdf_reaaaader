import { Ruler } from 'lucide-react';
import { Campo, Interruptor, Numero, Panel, Segmentado } from '../../components/forms';
import { HerramientaImagenes } from '../comun/HerramientaImagenes';
import type { FormatoImagen } from '../../types/api';

interface Op {
  modo: 'pixeles' | 'porcentaje';
  ancho: number;
  alto: number;
  porcentaje: number;
  mantener: boolean;
  sinAgrandar: boolean;
  formato: 'igual' | FormatoImagen;
  calidad: number;
}

const INICIAL: Op = { modo: 'pixeles', ancho: NaN, alto: NaN, porcentaje: 50, mantener: true, sinAgrandar: false, formato: 'igual', calidad: 90 };
const num = (n: number) => (Number.isFinite(n) && n > 0 ? n : undefined);

export default function Redimensionar() {
  return (
    <HerramientaImagenes<Op>
      extensiones={['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'svg']}
      inicial={INICIAL}
      sufijo="redimensionada"
      boton="Redimensionar"
      icono={Ruler}
      validar={(o) => (o.modo === 'pixeles' && !num(o.ancho) && !num(o.alto) ? 'Escribe un ancho, un alto o los dos.' : null)}
      operacion={(o) => ({
        tipo: 'redimensionar',
        ancho: o.modo === 'pixeles' ? num(o.ancho) : undefined,
        alto: o.modo === 'pixeles' ? num(o.alto) : undefined,
        porcentaje: o.modo === 'porcentaje' ? o.porcentaje : undefined,
        ajuste: o.mantener ? 'inside' : 'fill',
        sinAgrandar: o.sinAgrandar,
        formato: o.formato === 'igual' ? undefined : o.formato,
        calidad: o.calidad,
      })}
      opciones={(o, c, items) => (
        <Panel titulo="Nuevo tamaño">
          <Segmentado valor={o.modo} alCambiar={(modo) => c({ modo })} opciones={[{ valor: 'pixeles', texto: 'En píxeles' }, { valor: 'porcentaje', texto: 'En porcentaje' }]} />
          {o.modo === 'pixeles' ? (
            <>
              <div className="fila-campos">
                <Campo etiqueta="Ancho (px)">
                  <Numero valor={o.ancho} alCambiar={(ancho) => c({ ancho })} min={1} max={30000} ancho={120} />
                </Campo>
                <Campo etiqueta="Alto (px)">
                  <Numero valor={o.alto} alCambiar={(alto) => c({ alto })} min={1} max={30000} ancho={120} />
                </Campo>
              </div>
              <Interruptor marcado={o.mantener} alCambiar={(mantener) => c({ mantener })} texto="Mantener la proporción (la imagen cabe dentro de esas medidas)" />
              <Interruptor marcado={o.sinAgrandar} alCambiar={(sinAgrandar) => c({ sinAgrandar })} texto="No agrandar imágenes más pequeñas" />
            </>
          ) : (
            <Campo etiqueta={`Escala: ${o.porcentaje} %`} ayuda={items[0]?.ancho ? `Ejemplo: ${items[0].ancho} × ${items[0].alto} → ${Math.round((items[0].ancho * o.porcentaje) / 100)} × ${Math.round(((items[0].alto ?? 0) * o.porcentaje) / 100)} px` : undefined}>
              <input type="range" min={5} max={300} value={o.porcentaje} onChange={(e) => c({ porcentaje: Number(e.target.value) })} />
            </Campo>
          )}
          <div className="fila-campos">
            <Campo grupo etiqueta="Formato de salida">
              <Segmentado
                valor={o.formato}
                alCambiar={(formato) => c({ formato })}
                opciones={[{ valor: 'igual', texto: 'El mismo' }, { valor: 'jpeg', texto: 'JPG' }, { valor: 'png', texto: 'PNG' }, { valor: 'webp', texto: 'WebP' }]}
              />
            </Campo>
          </div>
        </Panel>
      )}
    />
  );
}
