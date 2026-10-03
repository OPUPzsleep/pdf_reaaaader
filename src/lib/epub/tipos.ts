// Modelo de datos del conversor PDF → EPUB. Todas las coordenadas son «visuales»: origen abajo a la
// izquierda, unidades de PDF (1/72 pulgada), con el giro de página ya aplicado.

export interface Fragmento {
  texto: string;
  x: number;
  /** Línea base */
  y: number;
  ancho: number;
  tam: number;
  negrita: boolean;
  cursiva: boolean;
  mono: boolean;
  /** Familia de la fuente del PDF, limpia («Calibri», «Times New Roman»), si se conoce */
  fuente?: string;
}

export interface RecuadroImagen {
  /** Clave para detectar la misma imagen repetida en varias páginas */
  clave: string;
  /** Esquina inferior izquierda y medidas */
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface PaginaExtraida {
  indice: number;
  ancho: number;
  alto: number;
  /** Giro de la página (0, 90, 180, 270) */
  giro: number;
  /** Desplazamiento vertical del MediaBox (para convertir destinos de marcadores) */
  origenY: number;
  fragmentos: Fragmento[];
  imagenes: RecuadroImagen[];
  /** El texto de la página salió del OCR (no estaba en el PDF) */
  ocr?: boolean;
}

export interface Span {
  texto: string;
  negrita: boolean;
  cursiva: boolean;
  mono: boolean;
}

export interface Linea {
  x0: number;
  x1: number;
  y: number;
  tam: number;
  spans: Span[];
  texto: string;
  /** Todo el texto de la línea es negrita */
  negrita: boolean;
  /** Si la línea es en realidad una imagen en el flujo de lectura */
  imagen?: RecuadroImagen;
  /** Columna a la que pertenece: izquierda, derecha, a ancho completo o única */
  columna: 'I' | 'D' | 'C' | 'U';
}

export type Bloque =
  | { tipo: 'p'; spans: Span[]; pagina: number; y: number; tam: number; sangria: boolean; finLinea: string; col: Linea['columna']; continua: boolean; empiezaArriba: boolean }
  | { tipo: 'h'; nivel: 1 | 2 | 3; texto: string; pagina: number; y: number; tam: number }
  | { tipo: 'li'; ordenado: boolean; spans: Span[]; pagina: number; y: number; tam: number }
  | { tipo: 'img'; imagen: RecuadroImagen; pagina: number; y: number };

export interface EntradaIndice {
  titulo: string;
  /** Índice de página base 0 */
  pagina: number;
  /** Altura (y hacia arriba) del destino dentro de la página, si se conoce */
  y: number | null;
  nivel: number;
}

export interface Capitulo {
  titulo: string;
  bloques: Bloque[];
  /** Páginas del PDF que abarca (base 0, inclusive) */
  desde: number;
  hasta: number;
}

export type ModoEpub = 'adaptable' | 'fijo';
export type EstrategiaCapitulos = 'auto' | 'marcadores' | 'titulos' | 'paginas';

export interface OpcionesEpub {
  modo: ModoEpub;
  titulo: string;
  autor: string;
  /** Código de idioma (es, en…) o 'auto' */
  idioma: string;
  capitulos: EstrategiaCapitulos;
  paginasPorCapitulo: number;
  quitarCabeceras: boolean;
  incluirImagenes: boolean;
  portada: boolean;
  ocr: boolean;
  idiomaOcr: string;
}

export const OPCIONES_EPUB_POR_DEFECTO: OpcionesEpub = {
  modo: 'adaptable',
  titulo: '',
  autor: '',
  idioma: 'auto',
  capitulos: 'auto',
  paginasPorCapitulo: 15,
  quitarCabeceras: true,
  incluirImagenes: true,
  portada: true,
  ocr: false,
  idiomaOcr: 'spa+eng',
};

/** Servicios que dependen del entorno (navegador o node con canvas) y que el conversor necesita. */
export interface ProveedorRender {
  /** Dibuja una página completa a JPEG con el ancho de salida pedido (px) */
  paginaAJpeg(indice: number, anchoPx: number): Promise<{ datos: Uint8Array; ancho: number; alto: number }>;
  /** Recorta una región (en coordenadas visuales de la página) a JPEG o PNG, con el ancho de salida pedido */
  regionAImagen(indice: number, r: { x: number; y: number; ancho: number; alto: number }, anchoPx: number): Promise<{ datos: Uint8Array; tipo: 'jpeg' | 'png' }>;
  /** Reconoce el texto de una página mediante OCR y devuelve líneas con su recuadro (coordenadas visuales) */
  ocrPagina?(indice: number): Promise<Fragmento[]>;
  /** Como `paginaAJpeg` pero sin dibujar el texto: el fondo sobre el que se colocan los cuadros de texto editables */
  paginaSinTextoAJpeg?(indice: number, anchoPx: number): Promise<{ datos: Uint8Array; ancho: number; alto: number }>;
  /** Píxeles RGBA de la página (con o sin texto) para averiguar de qué color es cada texto */
  paginaRgba?(indice: number, anchoPx: number, sinTexto: boolean): Promise<{ ancho: number; alto: number; datos: Uint8ClampedArray }>;
  /** Libera recursos (el trabajador de OCR) al terminar */
  liberar?(): Promise<void>;
}

export interface Progreso {
  (fraccion: number, mensaje: string): void;
}
