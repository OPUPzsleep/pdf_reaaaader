import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ListaOrdenable } from '../../components/ListaOrdenable';
import { Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { contarPaginas } from '../../lib/pdf/cargar';
import { formatearBytes, nombreBase, nombreSalida } from '../../lib/pdf/nombres';
import { rotarPdf, type Giro } from '../../lib/pdf/rotar';
import { crearZip } from '../../lib/pdf/zip';
import { MIME, leerArchivo } from '../../lib/platform';
import { PrimeraPagina } from '../comun/PrimeraPagina';

interface Item {
  id: string;
  nombre: string;
  datos: Uint8Array;
  paginas: number;
}
let contador = 0;

export default function Rotar() {
  const [items, setItems] = useState<Item[]>([]);
  const [giro, setGiro] = useState<Giro>(90);
  const [aviso, setAviso] = useState('');
  const tarea = useTarea();
  const salida = useSalida();

  const agregar = async (archivos: File[]) => {
    const nuevos: Item[] = [];
    const fallos: string[] = [];
    for (const f of archivos) {
      try {
        const datos = await leerArchivo(f);
        nuevos.push({ id: `rot-${++contador}`, nombre: f.name, datos, paginas: await contarPaginas(datos) });
      } catch {
        fallos.push(f.name);
      }
    }
    setItems((v) => [...v, ...nuevos]);
    setAviso(fallos.length ? `No se pudieron leer: ${fallos.join(', ')}` : '');
    salida.limpiar();
  };

  const rotar = () =>
    tarea.ejecutar(async (progreso) => {
      const salidas: { nombre: string; datos: Uint8Array }[] = [];
      for (let i = 0; i < items.length; i++) {
        progreso(i / items.length, `Girando ${items[i].nombre}…`);
        salidas.push({ nombre: nombreSalida(items[i].nombre, 'girado', 'pdf'), datos: await rotarPdf(items[i].datos, giro) });
      }
      if (salidas.length === 1) {
        await salida.guardar(salidas[0].nombre, salidas[0].datos, MIME.pdf);
      } else {
        const zip = await crearZip(salidas);
        await salida.guardar(`${nombreBase(items[0].nombre)}_y_${salidas.length - 1}_mas_girados.zip`, zip, MIME.zip, `${salidas.length} PDF girados`);
      }
    });

  return (
    <div className="vista">
      <FileDropzone extensiones={['pdf']} multiple compacto={items.length > 0} etiqueta={items.length ? 'Añadir más PDF' : undefined} alElegir={(a) => void agregar(a)} />
      {aviso && <p className="aviso error-texto">{aviso}</p>}
      {items.length > 0 && (
        <>
          <Panel titulo="Giro (se aplica a todas las páginas)">
            <Segmentado
              valor={giro}
              alCambiar={setGiro}
              opciones={[
                { valor: 90, texto: '90° a la derecha' },
                { valor: 180, texto: '180°' },
                { valor: 270, texto: '90° a la izquierda' },
              ]}
            />
          </Panel>
          <ListaOrdenable
            items={items}
            alReordenar={setItems}
            alQuitar={(id) => setItems((v) => v.filter((i) => i.id !== id))}
            render={(i) => (
              <div className="item-pdf">
                <PrimeraPagina datos={i.datos} ancho={56} rotacion={giro} />
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
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={rotar} data-testid="accion">
              <RotateCw size={18} /> Girar {items.length === 1 ? 'PDF' : `${items.length} PDF`}
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
