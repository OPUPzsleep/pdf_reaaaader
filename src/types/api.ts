// Contrato entre el renderer y el proceso principal (expuesto por preload como window.api).

export interface FiltroArchivo {
  name: string;
  extensions: string[];
}

export interface GuardarOpciones {
  nombrePorDefecto: string;
  datos: Uint8Array;
  filtros?: FiltroArchivo[];
}

export interface ResultadoGuardar {
  guardado: boolean;
  ruta?: string;
}

export interface ProgresoEvento {
  id: string;
  /** 0..1, o -1 si es indeterminado */
  fraccion: number;
  mensaje?: string;
}

export type FormatoImagen = 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff' | 'avif';

export interface OpImagenBase {
  datos: Uint8Array;
}

export type OpImagen =
  | {
      tipo: 'redimensionar';
      ancho?: number;
      alto?: number;
      /** Si se indica, se ignoran ancho y alto: escala la imagen este porcentaje (10–500) */
      porcentaje?: number;
      /** 'inside' conserva proporción dentro del cuadro; 'fill' deforma a la medida exacta */
      ajuste: 'fill' | 'inside';
      /** No agrandar imágenes más pequeñas que el cuadro */
      sinAgrandar?: boolean;
      formato?: FormatoImagen;
      calidad?: number;
    }
  | { tipo: 'recortar'; x: number; y: number; ancho: number; alto: number; formato?: FormatoImagen; calidad?: number }
  | { tipo: 'girar'; grados: 0 | 90 | 180 | 270; volteoH: boolean; volteoV: boolean; formato?: FormatoImagen; calidad?: number }
  | { tipo: 'convertir'; formato: FormatoImagen; calidad?: number; fondo?: string }
  | { tipo: 'comprimir'; formato?: FormatoImagen; calidad: number };

export interface SolicitudImagen {
  datos: Uint8Array;
  operacion: OpImagen;
}

export interface ResultadoImagen {
  datos: Uint8Array;
  formato: FormatoImagen;
  ancho: number;
  alto: number;
}

export interface InfoImagen {
  ancho: number;
  alto: number;
  formato: string;
  bytes: number;
}

export interface SolicitudHtml {
  /** Una URL http/https, un archivo .html del disco o código HTML pegado */
  origen: { tipo: 'url'; url: string } | { tipo: 'html'; html: string } | { tipo: 'archivo'; ruta: string };
  /** Solo para PDF */
  pdf?: { tamano: 'A4' | 'Letter' | 'A3' | 'Legal'; horizontal: boolean; margenMm: number; fondos: boolean };
  /** Solo para imagen */
  imagen?: { ancho: number; formato: 'png' | 'jpeg'; calidad: number };
}

export interface EstadoBinario {
  id: 'libreoffice' | 'ghostscript' | 'realesrgan' | 'modelo-fondo';
  nombre: string;
  disponible: boolean;
  ruta?: string;
  detalle?: string;
}

export type PerfilCompresion = 'bajo' | 'medio' | 'alto';

export type DestinoOffice = 'docx' | 'pptx' | 'xlsx';

export interface PdfreaaaaderApi {
  esElectron: true;
  version: string;
  guardarArchivo(op: GuardarOpciones): Promise<ResultadoGuardar>;
  mostrarEnCarpeta(ruta: string): Promise<void>;
  rutaDeArchivo(file: File): string;
  imagen: {
    procesar(s: SolicitudImagen): Promise<ResultadoImagen>;
    info(datos: Uint8Array): Promise<InfoImagen>;
  };
  html: {
    aPdf(s: SolicitudHtml): Promise<Uint8Array>;
    aImagen(s: SolicitudHtml): Promise<Uint8Array>;
  };
  externos: {
    estado(): Promise<EstadoBinario[]>;
    comprimirPdf(id: string, datos: Uint8Array, perfil: PerfilCompresion): Promise<Uint8Array>;
    pdfAPdfA(id: string, datos: Uint8Array): Promise<Uint8Array>;
    officeAPdf(id: string, datos: Uint8Array, extension: string): Promise<Uint8Array>;
    pdfAOffice(id: string, datos: Uint8Array, destino: DestinoOffice): Promise<Uint8Array>;
  };
  ia: {
    quitarFondo(id: string, datos: Uint8Array): Promise<Uint8Array>;
    ampliar(id: string, datos: Uint8Array, escala: 2 | 3 | 4): Promise<Uint8Array>;
  };
  alProgreso(cb: (e: ProgresoEvento) => void): () => void;
}

declare global {
  interface Window {
    api?: PdfreaaaaderApi;
  }
}
