import { FileText } from 'lucide-react';
import { HerramientaOffice } from '../comun/HerramientaOffice';

export default function WordAPdf() {
  return <HerramientaOffice tipo="word" icono={FileText} etiqueta="Arrastra documentos de Word (.docx)" />;
}
