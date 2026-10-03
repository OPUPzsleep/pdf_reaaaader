import { useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Crop as CropIcon } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { extensionDe, mimeDe, prepararParaSharp, procesarImagenEnApp } from '../../lib/imagenesApp';
import { nombreSalida } from '../../lib/pdf/nombres';
import { leerArchivo } from '../../lib/platform';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';

interface Cargada {
  archivo: File;
  datos: Uint8Array;
  url: string;
}

const PROPORCIONES: { texto: string; valor: number | undefined }[] = [
  { texto: 'Libre', valor: undefined },
  { texto: '1:1', valor: 1 },
  { texto: '4:3', valor: 4 / 3 },
  { texto: '3:2', valor: 3 / 2 },
  { texto: '16:9', valor: 16 / 9 },
  { texto: '3:4', valor: 3 / 4 },
];

export default function Recortar() {
  const [img, setImg] = useState<Cargada | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [hecho, setHecho] = useState<PixelCrop>();
  const [proporcion, setProporcion] = useState(0);
  const ref = useRef<HTMLImageElement>(null);
  const tarea = useTarea();
  const salida = useSalida();

  const cargar = async (f: File) => {
    if (img) URL.revokeObjectURL(img.url);
    setImg({ archivo: f, datos: await leerArchivo(f), url: URL.createObjectURL(f) });
    setCrop(undefined);
    setHecho(undefined);
    salida.limpiar();
  };

  /** Convierte la selección (píxeles mostrados) a píxeles reales de la imagen. */
  const rectReal = () => {
    const el = ref.current;
    if (!el || !hecho || hecho.width < 1 || hecho.height < 1) return null;
    const ex = el.naturalWidth / el.width;
    const ey = el.naturalHeight / el.height;
    return { x: Math.round(hecho.x * ex), y: Math.round(hecho.y * ey), ancho: Math.round(hecho.width * ex), alto: Math.round(hecho.height * ey) };
  };
  const real = rectReal();

  const recortar = () =>
    tarea.ejecutar(async () => {
      const r = rectReal();
      if (!img || !r) throw new Error('Dibuja primero sobre la imagen la zona que quieres conservar.');
      let res;
      try {
        res = await procesarImagenEnApp(await prepararParaSharp(img.archivo, img.datos), { tipo: 'recortar', ...r });
      } catch (e) {
        throw new Error(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e));
      }
      await salida.guardar(nombreSalida(img.archivo.name, 'recortada', extensionDe(res.formato)), res.datos, mimeDe(res.formato), `${res.ancho} × ${res.alto} px`);
    });

  return (
    <div className="vista">
      {!img && <FileDropzone extensiones={['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif']} alElegir={(a) => void cargar(a[0])} />}
      {img && (
        <>
          <CabeceraArchivo nombre={img.archivo.name} bytes={img.datos.byteLength} alQuitar={() => { URL.revokeObjectURL(img.url); setImg(null); setCrop(undefined); setHecho(undefined); salida.limpiar(); }} />
          <Panel titulo="Zona a conservar">
            <Campo grupo etiqueta="Proporción">
              <Segmentado
                valor={proporcion}
                alCambiar={(i) => { setProporcion(i); setCrop(undefined); setHecho(undefined); }}
                opciones={PROPORCIONES.map((p, i) => ({ valor: i, texto: p.texto }))}
              />
            </Campo>
            <div className="area-recorte">
              <ReactCrop crop={crop} onChange={(_, pct) => setCrop(pct)} onComplete={(c) => setHecho(c)} aspect={PROPORCIONES[proporcion].valor} keepSelection>
                <img ref={ref} src={img.url} alt="Imagen a recortar" style={{ maxHeight: '60vh', maxWidth: '100%' }} />
              </ReactCrop>
            </div>
            <p className="ayuda" data-testid="medidas-recorte">
              {real ? `Recorte: ${real.ancho} × ${real.alto} px (desde ${real.x}, ${real.y})` : 'Arrastra sobre la imagen para elegir la zona.'}
            </p>
          </Panel>
          <div className="acciones">
            <button type="button" className="btn primario grande" disabled={!real || tarea.ocupado} onClick={recortar} data-testid="accion">
              <CropIcon size={18} /> Recortar imagen
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
