import { useState } from 'react';
import { Eye, EyeOff, LockOpen, ShieldCheck, ShieldOff } from 'lucide-react';
import { FileDropzone } from '../../components/FileDropzone';
import { Campo, Panel } from '../../components/forms';
import { ResultadoPanel } from '../../components/ResultadoPanel';
import { useSalida, useTarea } from '../../lib/hooks';
import { desbloquearPdf, inspeccionarProteccion, type EstadoProteccion } from '../../lib/pdf/desbloquear';
import { nombreSalida } from '../../lib/pdf/nombres';
import { MIME, leerArchivo } from '../../lib/platform';
import { CabeceraArchivo } from '../comun/CabeceraArchivo';

interface Archivo {
  nombre: string;
  datos: Uint8Array;
}

const TEXTO_ESTADO: Record<Exclude<EstadoProteccion, 'invalido'>, { titulo: string; detalle: string }> = {
  'sin-proteccion': {
    titulo: 'Este PDF no tiene contraseña ni restricciones',
    detalle: 'No hace falta desbloquearlo: ya se puede abrir, imprimir, copiar y editar sin límites.',
  },
  restricciones: {
    titulo: 'Se abre sin contraseña, pero tiene restricciones',
    detalle: 'El autor ha limitado acciones como imprimir, copiar el texto o editar. Se pueden quitar sin necesidad de ninguna clave.',
  },
  clave: {
    titulo: 'Este PDF pide una contraseña para abrirse',
    detalle: 'Escribe la contraseña (la de apertura o la de propietario) y se guardará una copia sin protección.',
  },
};

/** Quita la contraseña y las restricciones de un PDF, sin conexión y sin cambiar su contenido. */
export default function DesbloquearPdf() {
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [estado, setEstado] = useState<EstadoProteccion | 'analizando'>('analizando');
  const [errorLectura, setErrorLectura] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const tarea = useTarea();
  const salida = useSalida();

  const elegir = async (f: File) => {
    setErrorLectura('');
    salida.limpiar();
    tarea.limpiarError();
    setClave('');
    try {
      const datos = await leerArchivo(f);
      setArchivo({ nombre: f.name, datos });
      setEstado('analizando');
      const e = await inspeccionarProteccion(datos);
      if (e === 'invalido') {
        setArchivo(null);
        setErrorLectura(`No se pudo leer ${f.name}: no parece un PDF válido o está dañado.`);
        return;
      }
      setEstado(e);
    } catch (e) {
      setArchivo(null);
      setErrorLectura(e instanceof Error ? e.message : String(e));
    }
  };

  const quitar = () => {
    setArchivo(null);
    setClave('');
    setErrorLectura('');
    salida.limpiar();
    tarea.limpiarError();
  };

  const desbloquear = () =>
    tarea.ejecutar(async (progreso) => {
      if (!archivo) return;
      progreso(0.1, 'Quitando la protección…');
      // qpdf trabaja de un tirón: se deja pintar el aviso antes de empezar
      await new Promise((r) => setTimeout(r, 30));
      const r = await desbloquearPdf(archivo.datos, clave);
      await salida.guardar(nombreSalida(archivo.nombre, 'desbloqueado', 'pdf'), r, MIME.pdf, 'Sin contraseña ni restricciones');
    });

  const necesitaClave = estado === 'clave';
  const puede = estado === 'restricciones' || (necesitaClave && clave.length > 0);
  const info = estado !== 'analizando' && estado !== 'invalido' ? TEXTO_ESTADO[estado] : null;

  return (
    <div className="vista">
      {!archivo && <FileDropzone extensiones={['pdf']} alElegir={(a) => void elegir(a[0])} />}
      {errorLectura && <p className="aviso error-texto">{errorLectura}</p>}
      {archivo && (
        <>
          <CabeceraArchivo nombre={archivo.nombre} bytes={archivo.datos.byteLength} alQuitar={quitar} />
          {estado === 'analizando' && <div className="cargando">Comprobando la protección…</div>}
          {info && (
            <Panel>
              <div className="estado-proteccion" data-estado={estado} data-testid="estado-proteccion">
                {estado === 'sin-proteccion' ? <ShieldCheck size={22} /> : <ShieldOff size={22} />}
                <div>
                  <strong>{info.titulo}</strong>
                  <p className="ayuda">{info.detalle}</p>
                </div>
              </div>
              {necesitaClave && (
                <Campo etiqueta="Contraseña del PDF">
                  <div className="entrada-clave">
                    <input
                      className="entrada"
                      type={verClave ? 'text' : 'password'}
                      value={clave}
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      onChange={(e) => {
                        setClave(e.target.value);
                        tarea.limpiarError();
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && puede && !tarea.ocupado && desbloquear()}
                      data-testid="campo-clave"
                    />
                    <button
                      type="button"
                      className="btn-icono"
                      aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                      aria-pressed={verClave}
                      onClick={() => setVerClave((v) => !v)}
                    >
                      {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Campo>
              )}
            </Panel>
          )}
          {estado !== 'analizando' && (
            <div className="acciones pegajosa">
              <button type="button" className="btn primario grande" disabled={!puede || tarea.ocupado} onClick={desbloquear} data-testid="accion">
                <LockOpen size={18} /> {estado === 'restricciones' ? 'Quitar restricciones' : 'Desbloquear PDF'}
              </button>
              <span className="ayuda">Todo ocurre en tu equipo. Hay que conocer la contraseña: la herramienta no intenta adivinarla.</span>
            </div>
          )}
        </>
      )}
      <ResultadoPanel {...tarea} salida={salida.salida} alReguardar={() => void salida.reguardar()} />
    </div>
  );
}
