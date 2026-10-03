import { Minimize2 } from 'lucide-react';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import type { PerfilCompresion } from '../../types/api';
import { HerramientaConversion } from '../comun/HerramientaConversion';

const TEXTOS: Record<PerfilCompresion, string> = {
  bajo: 'Compresión máxima: imágenes a 72 ppp. El archivo pesa mucho menos, pero la calidad de las imágenes baja de forma visible. Pensado para enviar por correo o ver en pantalla.',
  medio: 'Recomendada: imágenes a 150 ppp. Buen equilibrio entre tamaño y calidad.',
  alto: 'Menos compresión: imágenes a 300 ppp. Mantiene la calidad de impresión y reduce el tamaño de forma moderada.',
};

export default function ComprimirPdf() {
  return (
    <HerramientaConversion<{ perfil: PerfilCompresion }>
      extensiones={['pdf']}
      inicial={{ perfil: 'medio' }}
      requiere="ghostscript"
      boton="Comprimir PDF"
      icono={Minimize2}
      comparar
      nombreZip="pdf_comprimidos.zip"
      opciones={(o, c) => (
        <Panel titulo="Nivel de compresión">
          <Campo grupo etiqueta="Calidad">
            <Segmentado
              valor={o.perfil}
              alCambiar={(perfil) => c({ perfil })}
              opciones={[{ valor: 'bajo', texto: 'Compresión máxima' }, { valor: 'medio', texto: 'Recomendada' }, { valor: 'alto', texto: 'Menos compresión' }]}
            />
          </Campo>
          <p className="ayuda">{TEXTOS[o.perfil]} El texto sigue siendo seleccionable.</p>
        </Panel>
      )}
      procesar={async ({ datos, archivo }, o, progreso) => {
        progreso(-1, `Comprimiendo ${archivo.name}…`);
        const r = await requerirApi().externos.comprimirPdf('comprimir', datos, o.perfil);
        return { nombre: nombreSalida(archivo.name, 'comprimido', 'pdf'), datos: r.datos, mime: MIME.pdf, nota: r.reducido ? undefined : 'este PDF ya estaba optimizado; se conserva el original.' };
      }}
    />
  );
}
