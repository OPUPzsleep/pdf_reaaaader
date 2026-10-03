import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, FileText, X, type LucideIcon } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea, type Progreso } from '../../lib/hooks';
import { formatearBytes } from '../../lib/pdf/nombres';
import { crearZip } from '../../lib/pdf/zip';
import { MIME, leerArchivo } from '../../lib/platform';
import type { EstadoBinario } from '../../types/api';

export interface SalidaConversion {
  nombre: string;
  datos: Uint8Array;
  mime: string;
  /** Aviso o detalle para mostrar bajo el resultado */
  nota?: string;
}

interface Item {
  id: string;
  archivo: File;
  datos: Uint8Array;
}

interface Comparacion {
  nombre: string;
  antes: number;
  despues: number;
}

interface Props<O> {
  extensiones: string[];
  inicial: O;
  opciones?(o: O, cambiar: (p: Partial<O>) => void): ReactNode;
  /** Programa externo del que depende la herramienta */
  requiere?: EstadoBinario['id'];
  procesar(entrada: { datos: Uint8Array; archivo: File }, o: O, progreso: Progreso): Promise<SalidaConversion>;
  boton: string;
  icono: LucideIcon;
  comparar?: boolean;
  etiqueta?: string;
  nombreZip: string;
}

let contador = 0;

export const quitarPrefijoIpc = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/** Vista común de las herramientas que convierten uno o varios archivos con un motor externo o con pdf.js. */
export function HerramientaConversion<O extends object>({ extensiones, inicial, opciones, requiere, procesar, boton, icono: Icono, comparar, etiqueta, nombreZip }: Props<O>) {
  const [items, setItems] = useState<Item[]>([]);
  const [o, setO] = useState<O>(inicial);
  const [tabla, setTabla] = useState<Comparacion[]>([]);
  const [notas, setNotas] = useState<string[]>([]);
  const [falta, setFalta] = useState<EstadoBinario | null>(null);
  const tarea = useTarea();
  const salida = useSalida();
  const cancelado = useRef(false);

  useEffect(() => {
    if (!requiere || !window.api) return;
    void window.api.externos.estado().then((lista) => {
      const e = lista.find((x) => x.id === requiere);
      setFalta(e && !e.disponible ? e : null);
    });
  }, [requiere]);

  const agregar = async (archivos: File[]) => {
    const nuevos: Item[] = [];
    for (const f of archivos) nuevos.push({ id: `arch-${++contador}`, archivo: f, datos: await leerArchivo(f) });
    setItems((v) => [...v, ...nuevos]);
    salida.limpiar();
    setTabla([]);
    setNotas([]);
  };

  const ejecutar = () =>
    tarea.ejecutar(async (progreso) => {
      cancelado.current = false;
      const resultados: SalidaConversion[] = [];
      const filas: Comparacion[] = [];
      const avisos: string[] = [];
      for (let i = 0; i < items.length; i++) {
        if (cancelado.current) throw new Error('Operación cancelada.');
        const it = items[i];
        progreso(items.length > 1 ? i / items.length : -1, `Procesando ${it.archivo.name} (${i + 1} de ${items.length})…`);
        try {
          const r = await procesar({ datos: it.datos, archivo: it.archivo }, o, (f, m) => progreso(items.length > 1 ? (i + Math.max(0, f)) / items.length : f, m ?? `Procesando ${it.archivo.name}…`));
          resultados.push(r);
          filas.push({ nombre: it.archivo.name, antes: it.datos.byteLength, despues: r.datos.byteLength });
          if (r.nota) avisos.push(`${it.archivo.name}: ${r.nota}`);
        } catch (e) {
          throw new Error(`«${it.archivo.name}»: ${quitarPrefijoIpc(e)}`);
        }
      }
      setTabla(comparar ? filas : []);
      setNotas(avisos);
      if (resultados.length === 1) {
        await salida.guardar(resultados[0].nombre, resultados[0].datos, resultados[0].mime);
      } else {
        progreso(0.98, 'Creando ZIP…');
        await salida.guardar(nombreZip, await crearZip(resultados.map((r) => ({ nombre: r.nombre, datos: r.datos }))), MIME.zip, `${resultados.length} archivos`);
      }
    });

  return (
    <div className="vista">
      {falta && (
        <div className="error aviso-epub" role="alert" data-testid="falta-binario">
          <AlertTriangle size={18} />
          <span>
            <strong>{falta.nombre} no está disponible.</strong> {falta.detalle}
          </span>
        </div>
      )}
      <FileDropzone extensiones={extensiones} multiple compacto={items.length > 0} etiqueta={items.length ? 'Añadir más archivos' : etiqueta} alElegir={(a) => void agregar(a)} />
      {items.length > 0 && (
        <>
          <ul className="lista-imagenes">
            {items.map((it) => (
              <li key={it.id} className="fila-imagen" data-testid="fila-archivo">
                <span className="icono-redondo grande">
                  <FileText size={22} />
                </span>
                <div className="fila-imagen-info">
                  <strong>{it.archivo.name}</strong>
                  <small>{formatearBytes(it.datos.byteLength)}</small>
                </div>
                <button type="button" className="btn-icono pequeno" aria-label={`Quitar ${it.archivo.name}`} onClick={() => setItems((v) => v.filter((x) => x.id !== it.id))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          {opciones?.(o, (p) => setO((v) => ({ ...v, ...p })))}
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado || !!falta} onClick={ejecutar} data-testid="accion">
              <Icono size={18} /> {boton}
              {items.length > 1 ? ` (${items.length})` : ''}
            </button>
            {tarea.ocupado && (
              <button type="button" className="btn" onClick={() => (cancelado.current = true)}>
                <X size={16} /> Cancelar
              </button>
            )}
            <button type="button" className="btn" onClick={() => { setItems([]); setTabla([]); setNotas([]); salida.limpiar(); }}>
              Vaciar lista
            </button>
          </div>
        </>
      )}
      {tabla.length > 0 && (
        <table className="tabla" data-testid="tabla-comparacion">
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Antes</th>
              <th>Después</th>
              <th>Ahorro</th>
            </tr>
          </thead>
          <tbody>
            {tabla.map((f) => (
              <tr key={f.nombre}>
                <td>{f.nombre}</td>
                <td>{formatearBytes(f.antes)}</td>
                <td>{formatearBytes(f.despues)}</td>
                <td className={f.despues < f.antes ? 'ahorro' : ''}>{f.despues < f.antes ? `${Math.round((1 - f.despues / f.antes) * 100)} %` : 'Ya estaba optimizado'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
      {notas.length > 0 && !tarea.ocupado && (
        <div className="error aviso-epub" role="alert" data-testid="notas">
          <AlertTriangle size={16} />
          <span>{notas.join(' ')}</span>
        </div>
      )}
    </div>
  );
}
