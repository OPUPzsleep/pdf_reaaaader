import type { LucideIcon } from 'lucide-react';
import { EXTENSIONES_OFFICE, officeAHtml, type TipoOffice } from '../../lib/office';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, requerirApi } from '../../lib/platform';
import { HerramientaConversion } from './HerramientaConversion';

interface Props {
  tipo: TipoOffice;
  icono: LucideIcon;
  etiqueta: string;
}

/** Word, Excel y PowerPoint a PDF con motores propios: el documento se convierte en HTML y Chromium (Electron) lo imprime a PDF. */
export function HerramientaOffice({ tipo, icono, etiqueta }: Props) {
  return (
    <HerramientaConversion<Record<string, never>>
      extensiones={EXTENSIONES_OFFICE[tipo]}
      inicial={{}}
      boton="Convertir a PDF"
      icono={icono}
      nombreZip="pdf_convertidos.zip"
      etiqueta={etiqueta}
      procesar={async ({ datos, archivo }, _o, progreso) => {
        progreso(-1, `Leyendo ${archivo.name}…`);
        const r = await officeAHtml(datos, archivo.name, tipo);
        progreso(-1, `Creando el PDF de ${archivo.name}…`);
        const pdf = await requerirApi().html.aPdf({
          origen: { tipo: 'html', html: r.html },
          pdf: { tamano: 'A4', horizontal: false, margenMm: 0, fondos: true, tamanoCss: true },
        });
        return { nombre: nombreSalida(archivo.name, '', 'pdf'), datos: pdf, mime: MIME.pdf, nota: r.avisos.length ? r.avisos.join(' ') : undefined };
      }}
    />
  );
}
