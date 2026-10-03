import { Presentation } from 'lucide-react';
import { HerramientaOffice } from '../comun/HerramientaOffice';

export default function PowerpointAPdf() {
  return <HerramientaOffice tipo="powerpoint" icono={Presentation} etiqueta="Arrastra presentaciones de PowerPoint (.pptx)" />;
}
