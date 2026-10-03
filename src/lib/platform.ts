import type { ResultadoGuardar } from '../types/api';

/** Guarda bytes: diálogo nativo en Electron; descarga del navegador en modo web (pruebas). */
export async function guardarBytes(nombre: string, datos: Uint8Array, mime: string): Promise<ResultadoGuardar> {
  if (window.api) {
    return window.api.guardarArchivo({ nombrePorDefecto: nombre, datos });
  }
  const url = URL.createObjectURL(new Blob([datos.slice().buffer], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { guardado: true };
}

export const MIME = {
  pdf: 'application/pdf',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  epub: 'application/epub+zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export async function leerArchivo(f: File): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}
