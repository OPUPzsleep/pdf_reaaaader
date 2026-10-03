import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RotateCw, ScanLine, X } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { ListaOrdenable } from '../../components/ListaOrdenable';
import { Campo, Panel, Segmentado } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { NOMBRE_FILTRO, dibujarEscaneo, type FiltroEscaneo } from '../../lib/escaneo';
import { canvasABytes } from '../../lib/pdfjs';
import { IMAGENES_PDF_POR_DEFECTO, imagenesAPdf, type ImagenEntrada, type OpcionesImagenesPdf } from '../../lib/pdf/imagenesAPdf';
import { MIME } from '../../lib/platform';

interface Pagina {
  id: string;
  bitmap: ImageBitmap;
  rotacion: number;
  filtro: FiltroEscaneo;
}
let contador = 0;

function Vista({ p, ancho = 64 }: { p: Pagina; ancho?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = dibujarEscaneo(p.bitmap, p.rotacion, p.filtro, ancho * 2);
    const destino = ref.current!;
    destino.width = c.width;
    destino.height = c.height;
    destino.getContext('2d')!.drawImage(c, 0, 0);
  }, [p.bitmap, p.rotacion, p.filtro, ancho]);
  return <canvas ref={ref} className="vista-escaneo" style={{ maxWidth: ancho, maxHeight: ancho * 1.3 }} />;
}

function mensajeCamara(e: unknown): string {
  const nombre = e instanceof DOMException ? e.name : '';
  if (nombre === 'NotAllowedError') return 'No hay permiso para usar la cámara. Permítelo en la configuración de Windows (Privacidad → Cámara).';
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró ninguna cámara. Puedes importar fotos desde el equipo.';
  if (nombre === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación.';
  return 'No se pudo iniciar la cámara. Puedes importar fotos desde el equipo.';
}

export default function Escanear() {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [filtro, setFiltro] = useState<FiltroEscaneo>('documento');
  const [op, setOp] = useState<OpcionesImagenesPdf>({ ...IMAGENES_PDF_POR_DEFECTO, margen: 'ninguno' });
  const [camara, setCamara] = useState<'apagada' | 'activa'>('apagada');
  const [errorCamara, setErrorCamara] = useState('');
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([]);
  const [dispositivo, setDispositivo] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const todas = useRef<Pagina[]>([]);
  const tarea = useTarea();
  const salida = useSalida();
  todas.current = paginas;

  const detener = useCallback(() => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
    setCamara('apagada');
  }, []);

  useEffect(
    () => () => {
      flujo.current?.getTracks().forEach((t) => t.stop());
      todas.current.forEach((p) => p.bitmap.close());
    },
    [],
  );

  const iniciar = async (id = dispositivo) => {
    setErrorCamara('');
    flujo.current?.getTracks().forEach((t) => t.stop());
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      flujo.current = s;
      setCamara('activa');
      const lista = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      setDispositivos(lista);
      if (!id) setDispositivo(s.getVideoTracks()[0]?.getSettings().deviceId ?? '');
    } catch (e) {
      setErrorCamara(mensajeCamara(e));
      setCamara('apagada');
    }
  };

  useEffect(() => {
    if (camara === 'activa' && video.current && flujo.current) {
      video.current.srcObject = flujo.current;
      void video.current.play().catch(() => undefined);
    }
  }, [camara]);

  const nuevaPagina = (bitmap: ImageBitmap): Pagina => ({ id: `esc-${++contador}`, bitmap, rotacion: 0, filtro });

  const capturar = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    const bitmap = await createImageBitmap(c);
    setPaginas((p) => [...p, nuevaPagina(bitmap)]);
    salida.limpiar();
  };

  const importar = async (archivos: File[]) => {
    const nuevas: Pagina[] = [];
    for (const f of archivos) {
      try {
        nuevas.push(nuevaPagina(await createImageBitmap(f, { imageOrientation: 'from-image' })));
      } catch {
        setErrorCamara(`No se pudo leer «${f.name}».`);
      }
    }
    setPaginas((p) => [...p, ...nuevas]);
    salida.limpiar();
  };

  const cambiar = (id: string, parcial: Partial<Pagina>) => setPaginas((v) => v.map((p) => (p.id === id ? { ...p, ...parcial } : p)));
  const quitar = (id: string) =>
    setPaginas((v) => {
      v.find((p) => p.id === id)?.bitmap.close();
      return v.filter((p) => p.id !== id);
    });

  const crearPdf = () =>
    tarea.ejecutar(async (progreso) => {
      const entradas: ImagenEntrada[] = [];
      for (let i = 0; i < paginas.length; i++) {
        progreso(i / paginas.length / 2 + 0.0, `Procesando página ${i + 1} de ${paginas.length}…`);
        const p = paginas[i];
        const canvas = dibujarEscaneo(p.bitmap, p.rotacion, p.filtro, 2800);
        const bn = p.filtro === 'bn';
        entradas.push({ datos: await canvasABytes(canvas, bn ? 'image/png' : 'image/jpeg', 0.88), tipo: bn ? 'png' : 'jpg' });
        canvas.width = canvas.height = 0;
      }
      const pdf = await imagenesAPdf(entradas, op, (f) => progreso(0.5 + f / 2, 'Creando PDF…'));
      await salida.guardar('escaneo.pdf', pdf, MIME.pdf, `${paginas.length} ${paginas.length === 1 ? 'página' : 'páginas'}`);
    });

  return (
    <div className="vista">
      <div className="dos-columnas escaner">
        <Panel titulo="Cámara">
          {camara === 'activa' ? (
            <>
              <div className="visor">
                <video ref={video} muted playsInline data-testid="video-camara" />
              </div>
              <div className="acciones">
                <button type="button" className="btn primario grande" onClick={() => void capturar()} data-testid="capturar">
                  <Camera size={18} /> Capturar página
                </button>
                <button type="button" className="btn" onClick={detener}>
                  <CameraOff size={16} /> Apagar cámara
                </button>
                {dispositivos.length > 1 && (
                  <select className="entrada" value={dispositivo} aria-label="Cámara" onChange={(e) => { setDispositivo(e.target.value); void iniciar(e.target.value); }}>
                    {dispositivos.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Cámara ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          ) : (
            <div className="acciones">
              <button type="button" className="btn primario" onClick={() => void iniciar()} data-testid="activar-camara">
                <Camera size={16} /> Activar cámara
              </button>
              <span className="ayuda">Apunta al documento sobre un fondo liso y con buena luz.</span>
            </div>
          )}
          {errorCamara && <p className="aviso error-texto" role="alert" data-testid="error-camara">{errorCamara}</p>}
        </Panel>
        <Panel titulo="O importa fotos">
          <FileDropzone extensiones={['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif']} multiple compacto etiqueta="Elegir imágenes" alElegir={(a) => void importar(a)} />
        </Panel>
      </div>

      {paginas.length > 0 && (
        <>
          <Panel titulo="Filtro para las nuevas páginas">
            <Segmentado
              valor={filtro}
              alCambiar={(f) => setFiltro(f)}
              opciones={(Object.keys(NOMBRE_FILTRO) as FiltroEscaneo[]).map((f) => ({ valor: f, texto: NOMBRE_FILTRO[f] }))}
            />
            <div>
              <button type="button" className="btn" onClick={() => setPaginas((v) => v.map((p) => ({ ...p, filtro })))} data-testid="aplicar-todas">
                Aplicar este filtro a todas las páginas
              </button>
            </div>
          </Panel>
          <p className="ayuda">{paginas.length} {paginas.length === 1 ? 'página' : 'páginas'}. Arrastra para reordenar.</p>
          <ListaOrdenable
            items={paginas}
            alReordenar={setPaginas}
            alQuitar={quitar}
            render={(p) => (
              <div className="item-pdf">
                <Vista p={p} />
                <div className="controles-escaneo">
                  <select className="entrada" value={p.filtro} aria-label="Filtro de la página" onChange={(e) => cambiar(p.id, { filtro: e.target.value as FiltroEscaneo })}>
                    {(Object.keys(NOMBRE_FILTRO) as FiltroEscaneo[]).map((f) => (
                      <option key={f} value={f}>
                        {NOMBRE_FILTRO[f]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn" onClick={() => cambiar(p.id, { rotacion: (p.rotacion + 90) % 360 })}>
                    <RotateCw size={15} /> Girar
                  </button>
                  <button type="button" className="btn peligro" onClick={() => quitar(p.id)} aria-label="Eliminar página">
                    <X size={15} /> Quitar
                  </button>
                </div>
              </div>
            )}
          />
          <Panel titulo="Página del PDF">
            <div className="fila-campos">
              <Campo grupo etiqueta="Tamaño">
                <Segmentado valor={op.tamano} alCambiar={(tamano) => setOp({ ...op, tamano })} opciones={[{ valor: 'A4', texto: 'A4' }, { valor: 'Carta', texto: 'Carta' }, { valor: 'ajustar', texto: 'Ajustar a la foto' }]} />
              </Campo>
              <Campo grupo etiqueta="Margen">
                <Segmentado valor={op.margen} alCambiar={(margen) => setOp({ ...op, margen })} opciones={[{ valor: 'ninguno', texto: 'Sin margen' }, { valor: 'pequeno', texto: 'Pequeño' }, { valor: 'grande', texto: 'Grande' }]} />
              </Campo>
            </div>
          </Panel>
          <div className="acciones pegajosa">
            <button type="button" className="btn primario grande" disabled={tarea.ocupado} onClick={crearPdf} data-testid="accion">
              <ScanLine size={18} /> Crear PDF
            </button>
          </div>
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
