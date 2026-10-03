import { FileText } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function PdfAWord() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['pdf']}
      inicial={{}}
      requiere="libreoffice"
      boton="Convertir a Word"
      icono={FileText}
      nombreZip="documentos_convertidos.zip"
      opciones={() => <p className="ayuda">La conversión conserva el texto y la mayor parte del diseño, pero los PDF con maquetaciones complejas (columnas, tablas, formularios) pueden necesitar retoques. Los PDF escaneados no se convierten en texto editable.</p>}
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name}…`);
        const r = await requerirApi().externos.pdfAOffice('office', datos, 'docx');
        return { nombre: nombreSalida(archivo.name, '', 'docx'), datos: r, mime: MIME.docx };
      }}
    />
  );
}
