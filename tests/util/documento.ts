// PDF de prueba con estructura (título, párrafos con negrita, listas, tabla, imagen) hecho con pdf-lib, sin LibreOffice.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

export const PARRAFO_1 = [
  'Este informe resume los resultados del trimestre y las previsiones para el periodo',
  'siguiente. Los datos proceden de las ventas registradas en todas las tiendas y se',
  'han revisado dos veces antes de su publicación definitiva en el informe anual.',
];

export interface OpcionesDocumentoPrueba {
  conImagen?: boolean;
  conTabla?: boolean;
}

export async function crearDocumentoPdf(op: OpcionesDocumentoPrueba = {}): Promise<Uint8Array> {
  const { conImagen = true, conTabla = true } = op;
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursiva = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const p = doc.addPage([595, 842]);
  const X = 56;
  let y = 770;
  const texto = (t: string, o: { x?: number; size?: number; font?: typeof normal } = {}) => p.drawText(t, { x: o.x ?? X, y, size: o.size ?? 11, font: o.font ?? normal, color: rgb(0, 0, 0) });

  texto('Informe de resultados', { size: 24, font: negrita });
  y -= 40;
  texto('1. Resumen', { size: 15, font: negrita });
  y -= 24;
  for (const l of PARRAFO_1) {
    texto(l);
    y -= 15;
  }
  // Línea con negrita, cursiva y código
  texto('Aquí hay ');
  texto('texto importante', { x: X + normal.widthOfTextAtSize('Aquí hay ', 11), font: negrita });
  texto(' y ', { x: X + normal.widthOfTextAtSize('Aquí hay ', 11) + negrita.widthOfTextAtSize('texto importante', 11) });
  texto('énfasis', { x: X + normal.widthOfTextAtSize('Aquí hay ', 11) + negrita.widthOfTextAtSize('texto importante', 11) + normal.widthOfTextAtSize(' y ', 11), font: cursiva });
  y -= 30;
  texto('2. Listas', { size: 15, font: negrita });
  y -= 22;
  for (const t of ['Primer punto de la lista', 'Segundo punto de la lista']) {
    texto('•', { x: X + 8 });
    texto(t, { x: X + 24 });
    y -= 16;
  }
  y -= 8;
  for (const [i, t] of ['Preparar los datos', 'Revisar las cifras', 'Enviar el informe'].entries()) {
    texto(`${i + 1}.`, { x: X + 8 });
    texto(t, { x: X + 28 });
    y -= 16;
  }
  y -= 14;
  if (conTabla) {
    texto('3. Tabla de ventas', { size: 15, font: negrita });
    y -= 26;
    const cols = [X, 230, 330, 430];
    ['Producto', 'Unidades', 'Precio', 'Total'].forEach((t, i) => texto(t, { x: cols[i], font: negrita }));
    y -= 18;
    for (const fila of [['Manzanas', '120', '1,50', '180,00'], ['Peras', '80', '2,25', '180,00'], ['Uvas', '45', '3,10', '139,50']]) {
      fila.forEach((t, i) => texto(t, { x: cols[i] }));
      y -= 18;
    }
    y -= 14;
  }
  texto('Código de ejemplo: ', { font: normal });
  texto('npm run build', { x: X + normal.widthOfTextAtSize('Código de ejemplo: ', 11), font: mono });
  y -= 24;
  if (conImagen) {
    const w = 300;
    const h = 200;
    const raw = Buffer.alloc(w * h * 3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) raw.set([Math.round((i / w) * 255), 80, Math.round((j / h) * 255)], (j * w + i) * 3);
    const png = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
    const img = await doc.embedPng(png);
    p.drawImage(img, { x: X, y: y - 140, width: 210, height: 140 });
    y -= 160;
    texto('Figura 1: degradado de prueba', { font: cursiva, size: 9 });
  }
  return doc.save();
}

/** PDF tipo presentación: fondo de color, título grande, viñetas y texto en blanco sobre una banda oscura. */
export async function crearPresentacionPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const W = 960;
  const H = 540;
  // Diapositiva 1: fondo azul oscuro con título en blanco y subtítulo
  const p1 = doc.addPage([W, H]);
  p1.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(0.08, 0.16, 0.35) });
  p1.drawText('Plan de lanzamiento', { x: 80, y: 330, size: 54, font: negrita, color: rgb(1, 1, 1) });
  p1.drawText('Producto nuevo - Otoño 2024', { x: 84, y: 280, size: 26, font: normal, color: rgb(0.8, 0.85, 1) });
  // Diapositiva 2: fondo blanco, título rojo, viñetas en dos líneas y un texto centrado
  const p2 = doc.addPage([W, H]);
  p2.drawRectangle({ x: 0, y: H - 20, width: W, height: 20, color: rgb(0.8, 0.1, 0.1) });
  p2.drawText('Objetivos', { x: 60, y: 440, size: 40, font: negrita, color: rgb(0.75, 0.05, 0.05) });
  const puntos = ['Aumentar las ventas un 20 %', 'Reforzar la marca en redes sociales', 'Abrir tres mercados nuevos'];
  puntos.forEach((t, i) => {
    p2.drawText('•', { x: 70, y: 360 - i * 46, size: 26, font: normal });
    p2.drawText(t, { x: 100, y: 360 - i * 46, size: 26, font: normal });
  });
  const centro = 'Gracias por su atención';
  p2.drawText(centro, { x: (W - serif.widthOfTextAtSize(centro, 30)) / 2, y: 120, size: 30, font: serif, color: rgb(0.1, 0.4, 0.1) });
  return doc.save();
}
