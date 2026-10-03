import { useState } from 'react';
import { Merge } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ListaOrdenable } from '../../components/ListaOrdenable';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { contarPaginas } from '../../lib/pdf/cargar';
import { formatearBytes } from '../../lib/pdf/nombres';
import { unirPdfs } from '../../lib/pdf/unir';
import { MIME, leerArchivo } from '../../lib/platform';
import { PrimeraPagina } from '../comun/PrimeraPagina';

interface Item {
  id: string;
  nombre: string;
  datos: Uint8Array;
  paginas: number;
}

let contador = 0;

export default function Unir() {
  const [items, setItems] = useState<Item[]>([]);
  const [aviso, setAviso] = useState('');
  const tarea = useTarea();
  const salida = useSalida();

  const agregar = async (archivos: File[]) => {
    const nuevos: Item[] = [];
    const fallos: string[] = [];
    for (const f of archivos) {
      try {
        const datos = await leerArchivo(f);
        nuevos.push({ id: `pdf-${++contador}`, nombre: f.name, datos, paginas: await contarPaginas(datos) });
      } catch {
        fallos.push(f.name);
      }
    }
    setItems((v) => [...v, ...nuevos]);
    setAviso(fallos.length ? `No se pudieron leer (dañados o con contraseña): ${fallos.join(', ')}` : '');
    salida.limpiar();
  };

  const unir = () =>
    tarea.ejecutar(async (progreso) => {
      const r = await unirPdfs(items, (f) => progreso(f, `Uniendo… ${Math.round(f * 100)} %`));
      const total = items.reduce((a, i) => a + i.paginas, 0);
      await salida.guardar('unido.pdf', r, MIME.pdf, `${items.length} PDF · ${total} páginas`);
    });

  return (
    <div className="vista">
      <FileDropzone
        extensiones={['pdf']}
        multiple
        compacto={items.length > 0}
        etiqueta={items.length ? 'Añadir más PDF' : undefined}
        alElegir={(a) => void agregar(a)}
      />
      {aviso && <p className="aviso error-texto">{aviso}</p>}
      {items.length > 0 && (
        <>
          <p className="ayuda">Arrastra para cambiar el orden. Se unirán de arriba abajo.</p>
          <ListaOrdenable
            items={items}
            alReordenar={setItems}
            alQuitar={(id) => setItems((v) => v.filter((i) => i.id !== id))}
            render={(i) => (
              <div className="item-pdf">
                <PrimeraPagina datos={i.datos} ancho={46} />
                <div>
                  <strong>{i.nombre}</strong>
                  <small>
                    {i.paginas} {i.paginas === 1 ? 'página' : 'páginas'} · {formatearBytes(i.datos.byteLength)}
                  </small>
                </div>
              </div>
            )}
          />
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={items.length < 2 || tarea.ocupado} onClick={unir}>
              <Merge size={18} /> Unir {items.length} PDF
            </button>
            <button type="button" className="btn" onClick={() => setItems([])}>
              Vaciar lista
            </button>
          </div>
          {items.length < 2 && <p className="ayuda">Añade al menos un PDF más.</p>}
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
