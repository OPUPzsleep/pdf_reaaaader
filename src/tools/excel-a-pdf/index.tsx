import { FileSpreadsheet } from 'lucide-react';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function ExcelAPdf() {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={['xls', 'xlsx', 'ods', 'csv']}
      inicial={{}}
      requiere="libreoffice"
      boton="Convertir a PDF"
      icono={FileSpreadsheet}
      nombreZip="pdf_convertidos.zip"
      etiqueta="Arrastra hojas de cálculo de Excel (XLS, XLSX), ODS o CSV"
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Convirtiendo ${archivo.name}…`);
        const ext = archivo.name.split('.').pop() ?? '';
        const pdf = await requerirApi().externos.officeAPdf('office', datos, ext);
        return { nombre: nombreSalida(archivo.name, '', 'pdf'), datos: pdf, mime: MIME.pdf };
      }}
    />
  );
}
