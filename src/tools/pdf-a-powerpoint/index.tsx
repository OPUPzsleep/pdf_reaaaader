import { Presentation } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function PdfAPowerpoint() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['pdf']}
      inicial={{}}
      requiere="libreoffice"
      boton="Convertir a PowerPoint"
      icono={Presentation}
      nombreZip="documentos_convertidos.zip"
      opciones={() => <p className="ayuda">Cada página del PDF se convierte en una diapositiva con sus textos e imágenes. Los PDF escaneados quedan como imagen.</p>}
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name}…`);
        const r = await requerirApi().externos.pdfAOffice('office', datos, 'pptx');
        return { nombre: nombreSalida(archivo.name, '', 'pptx'), datos: r, mime: MIME.pptx };
      }}
    />
  );
}
