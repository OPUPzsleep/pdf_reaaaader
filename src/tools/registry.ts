import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

import {
  ArrowDownUp,
  BookOpen,
  Braces,
  Code2,
  Crop,
  Eraser,
  FileCheck2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Hash,
  Image as ImageIcon,
  ImageDown,
  Maximize2,
  Merge,
  Minimize2,
  Presentation,
  RefreshCw,
  RotateCw,
  ScanLine,
  Scissors,
  Trash2,
  FileOutput,
  Ruler,
  type LucideIcon,
} from 'lucide-react';
import { categoriaPorId, type CategoriaId, type Familia } from './categorias';

export interface Herramienta {
  id: string;
  categoria: CategoriaId;
  nombre: string;
  descripcion: string;
  icono: LucideIcon;
  /** Vista de la herramienta (carga diferida). Si falta, se muestra "en construcción". */
  componente?: LazyExoticComponent<ComponentType>;
  /** Palabras extra para el buscador */
  claves?: string[];
}

export const HERRAMIENTAS: Herramienta[] = [
  // ───────── Ordenar PDF
  {
    id: 'unir',
    categoria: 'ordenar',
    nombre: 'Unir PDF',
    descripcion: 'Combina varios PDF en un solo archivo, en el orden que elijas.',
    icono: Merge,
    componente: lazy(() => import('./unir')),
    claves: ['combinar', 'juntar', 'merge'],
  },
  {
    id: 'dividir',
    categoria: 'ordenar',
    nombre: 'Dividir PDF',
    descripcion: 'Separa un PDF por rangos, cada N páginas o una página por archivo.',
    icono: Scissors,
    componente: lazy(() => import('./dividir')),
    claves: ['separar', 'split', 'cortar'],
  },
  {
    id: 'eliminar-paginas',
    categoria: 'ordenar',
    nombre: 'Eliminar páginas',
    descripcion: 'Quita las páginas que no necesitas con miniaturas o rangos.',
    icono: Trash2,
    componente: lazy(() => import('./eliminar-paginas')),
    claves: ['borrar', 'quitar'],
  },
  {
    id: 'extraer-paginas',
    categoria: 'ordenar',
    nombre: 'Extraer páginas',
    descripcion: 'Conserva solo las páginas elegidas en un PDF nuevo.',
    icono: FileOutput,
    componente: lazy(() => import('./extraer-paginas')),
    claves: ['sacar', 'seleccionar'],
  },
  {
    id: 'ordenar',
    categoria: 'ordenar',
    nombre: 'Ordenar PDF',
    descripcion: 'Reordena, gira o borra páginas arrastrando las miniaturas.',
    icono: ArrowDownUp,
    componente: lazy(() => import('./ordenar')),
    claves: ['organizar', 'reordenar', 'arrastrar'],
  },
  {
    id: 'escanear',
    categoria: 'ordenar',
    nombre: 'Escanea a PDF',
    descripcion: 'Captura documentos con la cámara o importa fotos y conviértelos en PDF.',
    icono: ScanLine,
    componente: lazy(() => import('./escanear')),
    claves: ['camara', 'webcam', 'escaner', 'foto'],
  },

  // ───────── Optimizar
  {
    id: 'comprimir-pdf',
    categoria: 'optimizar',
    nombre: 'Comprimir PDF',
    descripcion: 'Reduce el tamaño del PDF con perfiles de calidad baja, media o alta.',
    icono: Minimize2,
    componente: lazy(() => import('./comprimir-pdf')),
    claves: ['reducir', 'ghostscript', 'peso'],
  },
  {
    id: 'comprimir-imagen',
    categoria: 'optimizar',
    nombre: 'Comprimir IMAGEN',
    descripcion: 'Reduce el peso de JPG, PNG y WebP con calidad ajustable.',
    icono: ImageDown,
    componente: lazy(() => import('./comprimir-imagen')),
    claves: ['reducir', 'jpg', 'png', 'webp'],
  },
  {
    id: 'ampliar',
    categoria: 'optimizar',
    nombre: 'Ampliar',
    descripcion: 'Aumenta la resolución de una imagen x2, x3 o x4 con IA (Real-ESRGAN).',
    icono: Maximize2,
    componente: lazy(() => import('./ampliar')),
    claves: ['agrandar', 'upscale', 'ia', 'resolucion'],
  },
  {
    id: 'eliminar-fondo',
    categoria: 'optimizar',
    nombre: 'Eliminar fondo',
    descripcion: 'Quita el fondo de una imagen con IA y exporta PNG transparente.',
    icono: Eraser,
    componente: lazy(() => import('./eliminar-fondo')),
    claves: ['recortar fondo', 'transparente', 'ia'],
  },

  // ───────── Convertir a PDF
  {
    id: 'jpg-a-pdf',
    categoria: 'a-pdf',
    nombre: 'JPG a PDF',
    descripcion: 'Convierte imágenes a PDF con orientación, tamaño de página y márgenes.',
    icono: FileImage,
    componente: lazy(() => import('./jpg-a-pdf')),
    claves: ['imagen', 'png', 'foto'],
  },
  {
    id: 'word-a-pdf',
    categoria: 'a-pdf',
    nombre: 'Word a PDF',
    descripcion: 'Convierte documentos de Word (DOCX) a PDF, con sus estilos, listas, tablas e imágenes.',
    icono: FileText,
    componente: lazy(() => import('./word-a-pdf')),
    claves: ['doc', 'docx', 'documento'],
  },
  {
    id: 'powerpoint-a-pdf',
    categoria: 'a-pdf',
    nombre: 'PowerPoint a PDF',
    descripcion: 'Convierte presentaciones de PowerPoint (PPTX) a PDF, una página por diapositiva.',
    icono: Presentation,
    componente: lazy(() => import('./powerpoint-a-pdf')),
    claves: ['ppt', 'pptx', 'diapositivas'],
  },
  {
    id: 'excel-a-pdf',
    categoria: 'a-pdf',
    nombre: 'Excel a PDF',
    descripcion: 'Convierte hojas de cálculo de Excel (XLSX) y archivos CSV a PDF.',
    icono: FileSpreadsheet,
    componente: lazy(() => import('./excel-a-pdf')),
    claves: ['xls', 'xlsx', 'hoja', 'csv'],
  },
  {
    id: 'html-a-pdf',
    categoria: 'a-pdf',
    nombre: 'HTML a PDF',
    descripcion: 'Convierte una página web, un archivo .html o código pegado a PDF.',
    icono: Code2,
    componente: lazy(() => import('./html-a-pdf')),
    claves: ['web', 'url', 'pagina'],
  },

  // ───────── Convertir desde PDF
  {
    id: 'pdf-a-jpg',
    categoria: 'desde-pdf',
    nombre: 'PDF a JPG',
    descripcion: 'Convierte cada página del PDF en una imagen JPG con el DPI que elijas.',
    icono: ImageIcon,
    componente: lazy(() => import('./pdf-a-jpg')),
    claves: ['imagen', 'exportar paginas'],
  },
  {
    id: 'pdf-a-word',
    categoria: 'desde-pdf',
    nombre: 'PDF a Word',
    descripcion: 'Convierte un PDF en un documento Word editable (DOCX) con títulos, listas, tablas e imágenes.',
    icono: FileText,
    componente: lazy(() => import('./pdf-a-word')),
    claves: ['docx', 'editar', 'ocr'],
  },
  {
    id: 'pdf-a-powerpoint',
    categoria: 'desde-pdf',
    nombre: 'PDF a PowerPoint',
    descripcion: 'Convierte un PDF en una presentación PPTX con el texto editable sobre el fondo original.',
    icono: Presentation,
    componente: lazy(() => import('./pdf-a-powerpoint')),
    claves: ['pptx', 'diapositivas', 'editar'],
  },
  {
    id: 'pdf-a-excel',
    categoria: 'desde-pdf',
    nombre: 'PDF a Excel',
    descripcion: 'Extrae las tablas de un PDF y las guarda en una hoja de cálculo XLSX.',
    icono: FileSpreadsheet,
    componente: lazy(() => import('./pdf-a-excel')),
    claves: ['xlsx', 'tablas', 'hoja de calculo'],
  },
  {
    id: 'pdf-a-pdfa',
    categoria: 'desde-pdf',
    nombre: 'PDF a PDF/A',
    descripcion: 'Convierte un PDF al formato de archivo a largo plazo PDF/A-2.',
    icono: FileCheck2,
    componente: lazy(() => import('./pdf-a-pdfa')),
    claves: ['archivo', 'ghostscript', 'preservacion'],
  },
  {
    id: 'pdf-a-epub',
    categoria: 'desde-pdf',
    nombre: 'PDF a EPUB',
    descripcion: 'Convierte un PDF en un libro electrónico EPUB adaptable o de diseño fijo.',
    icono: BookOpen,
    componente: lazy(() => import('./pdf-a-epub')),
    claves: ['libro', 'ebook', 'kindle', 'lector', 'ocr'],
  },

  // ───────── Modificar PDF
  {
    id: 'rotar',
    categoria: 'modificar',
    nombre: 'Rotar PDF',
    descripcion: 'Gira todas las páginas de uno o varios PDF a la vez.',
    icono: RotateCw,
    componente: lazy(() => import('./rotar')),
    claves: ['girar', 'voltear'],
  },
  {
    id: 'numeros-de-pagina',
    categoria: 'modificar',
    nombre: 'Números de página',
    descripcion: 'Añade numeración con posición, formato, tamaño y rango a tu gusto.',
    icono: Hash,
    componente: lazy(() => import('./numeros-de-pagina')),
    claves: ['numerar', 'paginar', 'paginacion'],
  },

  // ───────── Imágenes · Modificar
  {
    id: 'redimensionar',
    categoria: 'img-modificar',
    nombre: 'Redimensionar imagen',
    descripcion: 'Cambia el ancho y el alto en píxeles o en porcentaje.',
    icono: Ruler,
    componente: lazy(() => import('./redimensionar')),
    claves: ['tamano', 'escalar', 'resize'],
  },
  {
    id: 'recortar',
    categoria: 'img-modificar',
    nombre: 'Recortar imagen',
    descripcion: 'Recorta una zona de la imagen con un selector visual.',
    icono: Crop,
    componente: lazy(() => import('./recortar')),
    claves: ['cortar', 'crop'],
  },
  {
    id: 'girar-imagen',
    categoria: 'img-modificar',
    nombre: 'Girar imagen',
    descripcion: 'Rota la imagen 90°, 180° o 270° y voltéala en horizontal o vertical.',
    icono: RefreshCw,
    componente: lazy(() => import('./girar-imagen')),
    claves: ['rotar', 'voltear', 'espejo'],
  },

  // ───────── Imágenes · Convertir
  {
    id: 'convertir-a-jpg',
    categoria: 'img-convertir',
    nombre: 'Convertir a JPG',
    descripcion: 'Convierte PNG, WebP, GIF, BMP, TIFF y SVG a JPG.',
    icono: ImageIcon,
    componente: lazy(() => import('./convertir-a-jpg')),
    claves: ['png', 'webp', 'gif', 'bmp', 'tiff', 'svg'],
  },
  {
    id: 'convertir-desde-jpg',
    categoria: 'img-convertir',
    nombre: 'Convertir desde JPG',
    descripcion: 'Convierte JPG a PNG, WebP o GIF.',
    icono: Braces,
    componente: lazy(() => import('./convertir-desde-jpg')),
    claves: ['png', 'webp', 'gif'],
  },
  {
    id: 'html-a-imagen',
    categoria: 'img-convertir',
    nombre: 'HTML a IMAGEN',
    descripcion: 'Captura una página web completa como imagen PNG o JPG.',
    icono: Code2,
    componente: lazy(() => import('./html-a-imagen')),
    claves: ['captura', 'pantallazo', 'screenshot', 'web'],
  },
];

export const herramientaPorId = (id: string) => HERRAMIENTAS.find((h) => h.id === id);
export const familiaDe = (h: Herramienta): Familia => categoriaPorId(h.categoria).familia;

export function buscar(texto: string): Herramienta[] {
  const q = normalizar(texto);
  if (!q) return HERRAMIENTAS;
  return HERRAMIENTAS.filter((h) => {
    const cat = categoriaPorId(h.categoria).nombre;
    return normalizar([h.nombre, h.descripcion, cat, ...(h.claves ?? [])].join(' ')).includes(q);
  });
}

export function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

