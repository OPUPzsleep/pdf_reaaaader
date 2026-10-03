import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { extensionDe, mimeDe, prepararParaSharp, procesarImagenEnApp } from '../../lib/imagenesApp';
import { formatearBytes, nombreSalida } from '../../lib/pdf/nombres';
import { crearZip } from '../../lib/pdf/zip';
import { MIME, leerArchivo } from '../../lib/platform';
import type { OpImagen } from '../../types/api';

export interface ItemImagen {
  id: string;
  archivo: File;
  datos: Uint8Array;
  url: string;
  ancho?: number;
  alto?: number;
}

interface Comparacion {
  nombre: string;
  antes: number;
  despues: number;
}

interface Props<O> {
  extensiones: string[];
  inicial: O;
  opciones(o: O, cambiar: (parcial: Partial<O>) => void, items: ItemImagen[]): ReactNode;
  operacion(o: O): OpImagen;
  validar?(o: O): string | null;
  sufijo: string;
  boton: string;
  icono: LucideIcon;
  miniatura?(item: ItemImagen, o: O): ReactNode;
  comparar?: boolean;
  /** Etiqueta del cuadro para soltar archivos */
  etiqueta?: string;
}

let contador = 0;

/** Vista común de las herramientas de imagen que aplican la misma operación a uno o varios archivos. */
export function HerramientaImagenes<O extends object>({
  extensiones, inicial, opciones, operacion, validar, sufijo, boton, icono: Icono, miniatura, comparar, etiqueta,
}: Props<O>) {
  const [items, setItems] = useState<ItemImagen[]>([]);
  const [o, setO] = useState<O>(inicial);
  const [tabla, setTabla] = useState<Comparacion[]>([]);
  const tarea = useTarea();
  const salida = useSalida();
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const agregar = async (archivos: File[]) => {
    const nuevos: ItemImagen[] = [];
    for (const f of archivos) {
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      const item: ItemImagen = { id: `img-${++contador}`, archivo: f, datos: await leerArchivo(f), url };
      nuevos.push(item);
      const im = new Image();
      im.onload = () => setItems((v) => v.map((x) => (x.id === item.id ? { ...x, ancho: im.naturalWidth, alto: im.naturalHeight } : x)));
      im.src = url;
    }
    setItems((v) => [...v, ...nuevos]);
    salida.limpiar();
    setTabla([]);
  };

  const ejecutar = () =>
    tarea.ejecutar(async (progreso) => {
      const problema = validar?.(o);
      if (problema) throw new Error(problema);
      const salidas: { nombre: string; datos: Uint8Array }[] = [];
      const filas: Comparacion[] = [];
      let ultimoFormato = 'png' as ReturnType<typeof procesarImagenEnApp> extends Promise<infer R> ? R extends { formato: infer F } ? F : never : never;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        progreso(i / items.length, `Procesando ${it.archivo.name} (${i + 1} de ${items.length})…`);
        let r;
        try {
          r = await procesarImagenEnApp(await prepararParaSharp(it.archivo, it.datos), operacion(o));
        } catch (e) {
          throw new Error(`«${it.archivo.name}»: ${e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)}`);
        }
        ultimoFormato = r.formato;
        salidas.push({ nombre: nombreSalida(it.archivo.name, sufijo, extensionDe(r.formato)), datos: r.datos });
        filas.push({ nombre: it.archivo.name, antes: it.datos.byteLength, despues: r.datos.byteLength });
      }
      setTabla(comparar ? filas : []);
      const total = salidas.reduce((a, s) => a + s.datos.byteLength, 0);
      if (salidas.length === 1) {
        await salida.guardar(salidas[0].nombre, salidas[0].datos, mimeDe(ultimoFormato), `${formatearBytes(items[0].datos.byteLength)} → ${formatearBytes(total)}`);
      } else {
        progreso(0.98, 'Creando ZIP…');
        const zip = await crearZip(salidas);
        await salida.guardar('imagenes_procesadas.zip', zip, MIME.zip, `${salidas.length} imágenes · ${formatearBytes(total)}`);
      }
    });

  const quitar = (id: string) => setItems((v) => v.filter((x) => x.id !== id));

  return (
    <div className="vista">
      <FileDropzone
        extensiones={extensiones}
        multiple
        compacto={items.length > 0}
        etiqueta={items.length ? 'Añadir más imágenes' : etiqueta}
        alElegir={(a) => void agregar(a)}
      />
      {items.length > 0 && (
        <>
          <ul className="lista-imagenes">
            {items.map((it) => (
              <li key={it.id} className="fila-imagen" data-testid="fila-imagen">
                <div className="miniatura-img">{miniatura ? miniatura(it, o) : <img src={it.url} alt="" />}</div>
                <div className="fila-imagen-info">
                  <strong>{it.archivo.name}</strong>
                  <small>
                    {it.ancho ? `${it.ancho} × ${it.alto} px · ` : ''}
                    {formatearBytes(it.datos.byteLength)}
                  </small>
                </div>
                <button type="button" className="btn-icono pequeno" aria-label={`Quitar ${it.archivo.name}`} onClick={() => quitar(it.id)}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          {opciones(o, (p) => setO((v) => ({ ...v, ...p })), items)}
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={ejecutar} data-testid="accion">
              <Icono size={18} /> {boton}
              {items.length > 1 ? ` (${items.length})` : ''}
            </button>
            <button type="button" className="btn" onClick={() => { setItems([]); setTabla([]); salida.limpiar(); }}>
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
                <td className={f.despues <= f.antes ? 'ahorro' : 'aumento'}>
                  {f.antes ? `${Math.round((1 - f.despues / f.antes) * 100)} %` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
