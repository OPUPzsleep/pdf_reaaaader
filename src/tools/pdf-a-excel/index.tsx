import { FileSpreadsheet } from 'lucide-react';
import { Interruptor, Panel } from '../../components/forms';
import { OPERADORES, abrirPdfjs, cerrarPdfjs } from '../../lib/pdfjs';
import { OPCIONES_TABLAS_POR_DEFECTO, pdfAXlsx, type OpcionesTablas } from '../../lib/tablas';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME } from '../../lib/platform';
import { HerramientaConversion } from '../comun/HerramientaConversion';

export default function PdfAExcel() {
  return (
    <HerramientaConversion<OpcionesTablas>
      extensiones={['pdf']}
      inicial={OPCIONES_TABLAS_POR_DEFECTO}
      boton="Convertir a Excel"
      icono={FileSpreadsheet}
      nombreZip="excel_convertidos.zip"
      opciones={(o, c) => (
        <Panel titulo="Tablas">
          <p className="ayuda">
            Se buscan las tablas del PDF (filas con celdas alineadas en columnas) y cada una se guarda en su hoja de Excel. Las tablas que continúan en la página siguiente se unen.
          </p>
          <Interruptor marcado={o.numeros} alCambiar={(numeros) => c({ numeros })} texto="Convertir los números (1.234,50 · 12 %) en números de Excel" />
          <Interruptor marcado={o.incluirTexto} alCambiar={(incluirTexto) => c({ incluirTexto })} texto="Guardar el resto del texto en una hoja «Texto»" />
        </Panel>
      )}
      procesar={async ({ datos, archivo }, o, progreso) => {
        const doc = await abrirPdfjs(datos);
        try {
          const r = await pdfAXlsx(doc, OPERADORES, o, progreso);
          return {
            nombre: nombreSalida(archivo.name, '', 'xlsx'),
            datos: r.datos,
            mime: MIME.xlsx,
            nota: r.resumen.advertencias.length
              ? r.resumen.advertencias.join(' ')
              : `se encontraron ${r.resumen.tablas} ${r.resumen.tablas === 1 ? 'tabla' : 'tablas'} (${r.resumen.filas} filas). Revisa los resultados: la detección de tablas es aproximada.`,
          };
        } finally {
          void cerrarPdfjs(doc);
        }
      }}
    />
  );
}
