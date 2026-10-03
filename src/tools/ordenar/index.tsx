import { useMemo, useState } from 'react';
import { RotateCcw, RotateCw, Save, Trash2 } from 'lucide-react';
import { CuadriculaOrdenable } from '../../components/CuadriculaOrdenable';
import { FileDropzone } from '../../components/FileDropzone';
import { MiniaturaPagina } from '../../components/Miniatura';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useDocsPdfjs, useSalida, useTarea } from '../../lib/hooks';
import { contarPaginas } from '../../lib/pdf/cargar';
import { nombreBase, nombreSalida } from '../../lib/pdf/nombres';
import { reordenarPaginas } from '../../lib/pdf/paginas';
import { MIME, leerArchivo } from '../../lib/platform';

interface Fuente {
  nombre: string;
  datos: Uint8Array;
  paginas: number;
}

interface Pag {
  id: string;
  fuente: number;
  pagina: number;
  rotacion: number;
}

let contador = 0;
const crearPaginas = (fuente: number, total: number): Pag[] =>
  Array.from({ length: total }, (_, p) => ({ id: `p-${++contador}`, fuente, pagina: p, rotacion: 0 }));

export default function Ordenar() {
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [paginas, setPaginas] = useState<Pag[]>([]);
  const [aviso, setAviso] = useState('');
  const tarea = useTarea();
  const salida = useSalida();
  const datos = useMemo(() => fuentes.map((f) => f.datos), [fuentes]);
  const docs = useDocsPdfjs(datos);

  const agregar = async (archivos: File[]) => {
    const nuevasFuentes: Fuente[] = [];
    const nuevasPaginas: Pag[] = [];
    const fallos: string[] = [];
    for (const f of archivos) {
      try {
        const d = await leerArchivo(f);
        const n = await contarPaginas(d);
        nuevasPaginas.push(...crearPaginas(fuentes.length + nuevasFuentes.length, n));
        nuevasFuentes.push({ nombre: f.name, datos: d, paginas: n });
      } catch {
        fallos.push(f.name);
      }
    }
    setFuentes((v) => [...v, ...nuevasFuentes]);
    setPaginas((v) => [...v, ...nuevasPaginas]);
    setAviso(fallos.length ? `No se pudieron leer: ${fallos.join(', ')}` : '');
    salida.limpiar();
  };

  const girar = (id: string, grados: number) =>
    setPaginas((v) => v.map((p) => (p.id === id ? { ...p, rotacion: (((p.rotacion + grados) % 360) + 360) % 360 } : p)));
  const borrar = (id: string) => setPaginas((v) => v.filter((p) => p.id !== id));
  const girarTodas = (grados: number) => setPaginas((v) => v.map((p) => ({ ...p, rotacion: (((p.rotacion + grados) % 360) + 360) % 360 })));
  const restaurar = () => {
    setPaginas(fuentes.flatMap((f, i) => crearPaginas(i, f.paginas)));
    salida.limpiar();
  };

  const guardar = () =>
    tarea.ejecutar(async () => {
      const r = await reordenarPaginas(datos, paginas.map(({ fuente, pagina, rotacion }) => ({ fuente, pagina, rotacion })));
      const nombre = fuentes.length === 1 ? nombreSalida(fuentes[0].nombre, 'ordenado', 'pdf') : `${nombreBase(fuentes[0].nombre)}_ordenado.pdf`;
      await salida.guardar(nombre, r, MIME.pdf, `${paginas.length} páginas`);
    });

  return (
    <div className="vista">
      {fuentes.length === 0 && <FileDropzone extensiones={['pdf']} alElegir={(a) => void agregar(a)} />}
      {aviso && <p className="aviso error-texto">{aviso}</p>}
      {fuentes.length > 0 && (
        <>
          <div className="barra-herramientas">
            <div className="barra-info">
              <strong>{paginas.length}</strong> páginas · de {fuentes.length} {fuentes.length === 1 ? 'PDF' : 'PDF'} ({fuentes.map((f) => f.nombre).join(', ')})
            </div>
            <button type="button" className="btn" onClick={() => girarTodas(270)}>
              <RotateCcw size={15} /> Todas a la izquierda
            </button>
            <button type="button" className="btn" onClick={() => girarTodas(90)}>
              <RotateCw size={15} /> Todas a la derecha
            </button>
            <button type="button" className="btn" onClick={restaurar}>
              Restaurar
            </button>
          </div>
          <FileDropzone extensiones={['pdf']} multiple compacto etiqueta="Añadir páginas de otro PDF" alElegir={(a) => void agregar(a)} />
          <p className="ayuda">Arrastra las miniaturas para cambiar el orden. Usa los botones de cada página para girarla o borrarla.</p>
          <CuadriculaOrdenable
            items={paginas}
            alReordenar={setPaginas}
            render={(p, i) => {
              const doc = docs[p.fuente];
              return (
                <>
                  <div className="celda-cuerpo">
                    {doc ? <MiniaturaPagina doc={doc} numero={p.pagina + 1} ancho={130} rotacion={p.rotacion} /> : <div className="miniatura vacia" style={{ width: 130, height: 170 }} />}
                  </div>
                  <span className="celda-numero">{i + 1}</span>
                  <div className="celda-acciones">
                    <button type="button" className="btn-icono pequeno" aria-label="Girar a la izquierda" onClick={() => girar(p.id, 270)}>
                      <RotateCcw size={14} />
                    </button>
                    <button type="button" className="btn-icono pequeno" aria-label="Girar a la derecha" onClick={() => girar(p.id, 90)}>
                      <RotateCw size={14} />
                    </button>
                    <button type="button" className="btn-icono pequeno peligro" aria-label="Eliminar página" onClick={() => borrar(p.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              );
            }}
          />
          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={paginas.length === 0 || tarea.ocupado} onClick={guardar} data-testid="accion">
              <Save size={18} /> Guardar PDF ordenado
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setFuentes([]);
                setPaginas([]);
                salida.limpiar();
              }}
            >
              Empezar de nuevo
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
