export type CategoriaId =
  | 'ordenar'
  | 'optimizar'
  | 'a-pdf'
  | 'desde-pdf'
  | 'modificar'
  | 'seguridad'
  | 'img-modificar'
  | 'img-convertir';

/** Familias de color: naranja = Ordenar, verde = Optimizar, amarillo = Convertir, azul = Imágenes, morado = Modificar, verde azulado = Seguridad. */
export type Familia = 'ordenar' | 'optimizar' | 'convertir' | 'imagenes' | 'modificar' | 'seguridad';

export interface Categoria {
  id: CategoriaId;
  nombre: string;
  familia: Familia;
}

export const CATEGORIAS: Categoria[] = [
  { id: 'ordenar', nombre: 'Ordenar PDF', familia: 'ordenar' },
  { id: 'optimizar', nombre: 'Optimizar', familia: 'optimizar' },
  { id: 'a-pdf', nombre: 'Convertir a PDF', familia: 'convertir' },
  { id: 'desde-pdf', nombre: 'Convertir desde PDF', familia: 'convertir' },
  { id: 'modificar', nombre: 'Modificar PDF', familia: 'modificar' },
  { id: 'seguridad', nombre: 'Seguridad de PDF', familia: 'seguridad' },
  { id: 'img-modificar', nombre: 'Imágenes · Modificar', familia: 'imagenes' },
  { id: 'img-convertir', nombre: 'Imágenes · Convertir', familia: 'imagenes' },
];

export const categoriaPorId = (id: CategoriaId) => CATEGORIAS.find((c) => c.id === id)!;
