import { FileText } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function WordAPdf() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['doc', 'docx', 'odt', 'rtf']}
      inicial={{}}
      requiere="libreoffice"
      boton="Convertir a PDF"
      icono={FileText}
      nombreZip="pdf_convertidos.zip"
      etiqueta="Arrastra documentos de Word (DOC, DOCX), ODT o RTF"
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name}…`);
        const ext = archivo.name.split('.').pop() ?? '';
        const pdf = await requerirApi().externos.officeAPdf('office', datos, ext);
        return { nombre: nombreSalida(archivo.name, '', 'pdf'), datos: pdf, mime: MIME.pdf };
      }}
    />
  );
}
