import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  /** Extensiones admitidas sin punto, p. ej. ['pdf'] */
  extensiones: string[];
  multiple?: boolean;
  etiqueta?: string;
  ayuda?: string;
  alElegir(archivos: File[]): void;
  compacto?: boolean;
}

export function FileDropzone({ extensiones, multiple, etiqueta, ayuda, alElegir, compacto }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [aviso, setAviso] = useState('');
  const accept = extensiones.map((e) => '.' + e).join(',');

  const procesar = (lista: FileList | File[]) => {
    const todos = Array.from(lista);
    const validos = todos.filter((f) => extensiones.includes(f.name.split('.').pop()?.toLowerCase() ?? ''));
    const ignorados = todos.length - validos.length;
    setAviso(
      ignorados > 0
        ? `Se ignoraron ${ignorados} archivo${ignorados > 1 ? 's' : ''} que no son ${extensiones.map((e) => e.toUpperCase()).join('/')}.`
        : '',
    );
    if (validos.length) alElegir(multiple ? validos : validos.slice(0, 1));
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setEncima(false);
    procesar(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        className={'zona' + (encima ? ' encima' : '') + (compacto ? ' compacta' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        onClick={() => entrada.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && entrada.current?.click()}
        data-testid="zona-archivos"
      >
        <Upload size={compacto ? 22 : 34} aria-hidden />
        <strong>{etiqueta ?? (multiple ? 'Arrastra tus archivos aquí o haz clic para elegirlos' : 'Arrastra tu archivo aquí o haz clic para elegirlo')}</strong>
        <span>{ayuda ?? `Formatos: ${extensiones.map((e) => e.toUpperCase()).join(', ')}`}</span>
        <input
          ref={entrada}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          data-testid="entrada-archivos"
          onChange={(e) => {
            if (e.target.files) procesar(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {aviso && <p className="aviso">{aviso}</p>}
    </div>
  );
}
