import { FileSpreadsheet } from 'lucide-react';
import { HerramientaOffice } from '../comun/HerramientaOffice';

export default function ExcelAPdf() {
  return <HerramientaOffice tipo="excel" icono={FileSpreadsheet} etiqueta="Arrastra hojas de cálculo de Excel (.xlsx) o archivos CSV" />;
}
