import { useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Interruptor, Numero, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { useArchivoPdf } from '../../lib/useArchivoPdf';
import { nombreSalida } from '../../lib/pdf/nombres';
import { extraerPaginas } from '../../lib/pdf/paginas';
import {
  NUMEROS_POR_DEFECTO, numerarPaginas,
  type FormatoNumero, type FuenteNumero, type OpcionesNumeros, type Posicion,
} from '../../lib/pdf/numeros';
import { MIME } from '../../lib/platform';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';
import { PrimeraPagina } from '../comun/PrimeraPagina';

const POSICIONES: Posicion[] = [
  'sup-izq', 'sup-centro', 'sup-der',
  'cen-izq', 'cen-centro', 'cen-der',
  'inf-izq', 'inf-centro', 'inf-der',
];
const NOMBRE_POS: Record<Posicion, string> = {
  'sup-izq': 'Arriba a la izquierda', 'sup-centro': 'Arriba en el centro', 'sup-der': 'Arriba a la derecha',
  'cen-izq': 'Centro a la izquierda', 'cen-centro': 'En el centro', 'cen-der': 'Centro a la derecha',
  'inf-izq': 'Abajo a la izquierda', 'inf-centro': 'Abajo en el centro', 'inf-der': 'Abajo a la derecha',
};
const FORMATOS: FormatoNumero[] = ['n', 'Página n', 'Página n de N', 'n / N', '- n -'];

export default function NumerosDePagina() {
  const { pdf, error, cargar, quitar } = useArchivoPdf();
  const [op, setOp] = useState<OpcionesNumeros>(NUMEROS_POR_DEFECTO);
  const [vista, setVista] = useState<Uint8Array | null>(null);
  const [errorRango, setErrorRango] = useState('');
  const tarea = useTarea();
  const salida = useSalida();
  const cambiar = <K extends keyof OpcionesNumeros>(k: K, v: OpcionesNumeros[K]) => setOp((o) => ({ ...o, [k]: v }));

  // Vista previa: primera página con la numeración aplicada (con retardo para no recalcular en cada tecla)
  useEffect(() => {
    if (!pdf) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const primera = await extraerPaginas(pdf.datos, [0]);
        const total = pdf.paginas + Math.floor(op.inicio) - 1;
        const r = await numerarPaginas(primera, { ...op, rango: '' }, { totalVisible: total });
        if (vivo) {
          setVista(r);
          setErrorRango('');
        }
      } catch (e) {
        if (vivo) setErrorRango(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [pdf, op]);

  const aplicar = () =>
    tarea.ejecutar(async () => {
      if (!pdf) return;
      const r = await numerarPaginas(pdf.datos, op);
      await salida.guardar(nombreSalida(pdf.nombre, 'numerado', 'pdf'), r, MIME.pdf, 'Numeración añadida');
    });

  return (
    <div className="vista">
      {!pdf && <FileDropzone extensiones={['pdf']} alElegir={(a) => void cargar(a[0])} />}
      {error && <p className="aviso error-texto">{error}</p>}
      {pdf && (
        <>
          <CabeceraArchivo nombre={pdf.nombre} bytes={pdf.datos.byteLength} detalle={`${pdf.paginas} páginas`} alQuitar={() => { quitar(); setVista(null); salida.limpiar(); }} />
          <div className="dos-columnas">
            <div className="columna-opciones">
              <Panel titulo="Posición">
                <div className="rejilla-3x3" role="radiogroup" aria-label="Posición del número">
                  {POSICIONES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={op.posicion === p}
                      aria-label={NOMBRE_POS[p]}
                      title={NOMBRE_POS[p]}
                      className={op.posicion === p ? 'activo' : ''}
                      onClick={() => cambiar('posicion', p)}
                      data-testid={`pos-${p}`}
                    />
                  ))}
                </div>
              </Panel>
              <Panel titulo="Formato">
                <Segmentado valor={op.formato} alCambiar={(v) => cambiar('formato', v)} opciones={FORMATOS.map((f) => ({ valor: f, texto: f }))} />
                <div className="fila-campos">
                  <Campo etiqueta="Fuente">
                    <select className="entrada" value={op.fuente} onChange={(e) => cambiar('fuente', e.target.value as FuenteNumero)}>
                      <option value="Helvetica">Helvetica (sans)</option>
                      <option value="Times">Times (serif)</option>
                      <option value="Courier">Courier (monoespaciada)</option>
                    </select>
                  </Campo>
                  <Campo etiqueta="Tamaño (pt)">
                    <Numero valor={op.tamano} alCambiar={(v) => cambiar('tamano', v || 11)} min={6} max={72} ancho={90} />
                  </Campo>
                  <Campo etiqueta="Margen (pt)">
                    <Numero valor={op.margen} alCambiar={(v) => cambiar('margen', v || 0)} min={0} max={200} ancho={90} />
                  </Campo>
                  <Campo etiqueta="Color">
                    <input type="color" className="entrada color" value={op.color} onChange={(e) => cambiar('color', e.target.value)} />
                  </Campo>
                </div>
                <Interruptor marcado={op.negrita} alCambiar={(v) => cambiar('negrita', v)} texto="Negrita" />
              </Panel>
              <Panel titulo="Páginas">
                <div className="fila-campos">
                  <Campo etiqueta="Empezar a contar en">
                    <Numero valor={op.inicio} alCambiar={(v) => cambiar('inicio', Number.isFinite(v) ? v : 1)} min={0} ancho={90} />
                  </Campo>
                  <Campo etiqueta="Numerar solo las páginas" ayuda="Vacío = todas. Ej.: 2-10">
                    <input className="entrada" value={op.rango} placeholder="Todas" onChange={(e) => cambiar('rango', e.target.value)} />
                  </Campo>
                </div>
              </Panel>
            </div>
            <div className="columna-vista">
              <h4>Vista previa (primera página)</h4>
              {vista ? <PrimeraPagina datos={vista} ancho={260} /> : <div className="cargando">Generando…</div>}
            </div>
          </div>
          {errorRango && <p className="aviso error-texto">{errorRango}</p>}
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={aplicar} data-testid="accion">
              <Hash size={18} /> Añadir números de página
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
