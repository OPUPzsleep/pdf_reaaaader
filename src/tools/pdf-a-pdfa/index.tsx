import { FileCheck2 } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function PdfAPdfA() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['pdf']}
      inicial={{}}
      requiere="ghostscript"
      boton="Convertir a PDF/A"
      icono={FileCheck2}
      nombreZip="pdfa.zip"
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name} a PDF/A…`);
        const r = await requerirApi().externos.pdfAPdfA('pdfa', datos);
        return { nombre: nombreSalida(archivo.name, 'pdfa', 'pdf'), datos: r, mime: MIME.pdf, nota: 'se generó PDF/A-2b (archivo a largo plazo). Los PDF con fuentes sin incrustar o con transparencias complejas pueden cambiar de aspecto.' };
      }}
      opciones={() => (
        <p className="ayuda">
          PDF/A es un formato pensado para conservar documentos durante décadas: incrusta las fuentes y los colores. Se genera el nivel PDF/A-2b.
        </p>
      )}
    />
  );
}
