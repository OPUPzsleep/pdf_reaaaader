import { Presentation } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function PowerpointAPdf() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['ppt', 'pptx', 'odp']}
      inicial={{}}
      requiere="libreoffice"
      boton="Convertir a PDF"
      icono={Presentation}
      nombreZip="pdf_convertidos.zip"
      etiqueta="Arrastra presentaciones de PowerPoint (PPT, PPTX) u ODP"
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name}…`);
        const ext = archivo.name.split('.').pop() ?? '';
        const pdf = await requerirApi().externos.officeAPdf('office', datos, ext);
        return { nombre: nombreSalida(archivo.name, '', 'pdf'), datos: pdf, mime: MIME.pdf };
      }}
    />
  );
}
