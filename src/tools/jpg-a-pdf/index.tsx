import { useEffect, useRef, useState } from 'react';
import { FileImage } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ListaOrdenable } from '../../components/ListaOrdenable';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { normalizarImagen } from '../../lib/imagen';
import { IMAGENES_PDF_POR_DEFECTO, imagenesAPdf, type OpcionesImagenesPdf } from '../../lib/pdf/imagenesAPdf';
import { formatearBytes, nombreBase } from '../../lib/pdf/nombres';
import { MIME, leerArchivo } from '../../lib/platform';

interface Item {
  id: string;
  nombre: string;
  tipoMime: string;
  datos: Uint8Array;
  url: string;
}
let contador = 0;

const EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

export default function JpgAPdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [op, setOp] = useState<OpcionesImagenesPdf>(IMAGENES_PDF_POR_DEFECTO);
  const tarea = useTarea();
  const salida = useSalida();
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const agregar = async (archivos: File[]) => {
    const nuevos: Item[] = [];
    for (const f of archivos) {
      const datos = await leerArchivo(f);
      const url = URL.createObjectURL(f);
      urls.current.push(url);
      nuevos.push({ id: `img-${++contador}`, nombre: f.name, tipoMime: f.type, datos, url });
    }
    setItems((v) => [...v, ...nuevos]);
    salida.limpiar();
  };

  const convertir = () =>
    tarea.ejecutar(async (progreso) => {
      const entradas = [];
      for (let i = 0; i < items.length; i++) {
        progreso((i / items.length) * 0.5, `Preparando imagen ${i + 1} de ${items.length}…`);
        try {
          entradas.push(await normalizarImagen(items[i].datos, items[i].nombre, items[i].tipoMime));
        } catch {
          throw new Error(`No se pudo leer la imagen «${items[i].nombre}».`);
        }
      }
      const r = await imagenesAPdf(entradas, op, (f) => progreso(0.5 + f * 0.5, 'Creando PDF…'));
      const nombre = items.length === 1 ? `${nombreBase(items[0].nombre)}.pdf` : 'imagenes.pdf';
      await salida.guardar(nombre, r, MIME.pdf, `${items.length} ${items.length === 1 ? 'imagen' : 'imágenes'}`);
    });

  return (
    <div className="vista">
      <FileDropzone
        extensiones={EXTENSIONES}
        multiple
        compacto={items.length > 0}
        etiqueta={items.length ? 'Añadir más imágenes' : undefined}
        alElegir={(a) => void agregar(a)}
      />
      {items.length > 0 && (
        <>
          <ListaOrdenable
            items={items}
            alReordenar={setItems}
            alQuitar={(id) => setItems((v) => v.filter((i) => i.id !== id))}
            render={(i) => (
              <div className="item-pdf">
                <img className="mini-img" src={i.url} alt="" />
                <div>
                  <strong>{i.nombre}</strong>
                  <small>{formatearBytes(i.datos.byteLength)}</small>
                </div>
              </div>
            )}
          />
          <Panel titulo="Opciones de página">
            <div className="fila-campos">
              <Campo grupo etiqueta="Orientación">
                <Segmentado
                  valor={op.orientacion}
                  alCambiar={(v) => setOp({ ...op, orientacion: v })}
                  opciones={[{ valor: 'auto', texto: 'Automática' }, { valor: 'vertical', texto: 'Vertical' }, { valor: 'horizontal', texto: 'Horizontal' }]}
                />
              </Campo>
              <Campo grupo etiqueta="Tamaño de página">
                <Segmentado
                  valor={op.tamano}
                  alCambiar={(v) => setOp({ ...op, tamano: v })}
                  opciones={[{ valor: 'ajustar', texto: 'Ajustar a la imagen' }, { valor: 'A4', texto: 'A4' }, { valor: 'Carta', texto: 'Carta' }]}
                />
              </Campo>
              <Campo grupo etiqueta="Margen">
                <Segmentado
                  valor={op.margen}
                  alCambiar={(v) => setOp({ ...op, margen: v })}
                  opciones={[{ valor: 'ninguno', texto: 'Sin margen' }, { valor: 'pequeno', texto: 'Pequeño' }, { valor: 'grande', texto: 'Grande' }]}
                />
              </Campo>
            </div>
          </Panel>
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={convertir} data-testid="accion">
              <FileImage size={18} /> Convertir a PDF
            </button>
            <button type="button" className="btn" onClick={() => setItems([])}>
              Vaciar lista
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
