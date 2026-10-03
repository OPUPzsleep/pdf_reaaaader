// Genera build/icon.png (512 px) y build/icon.ico (16–256 px) a partir del logotipo en SVG.
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#e5322d"/>
<path d="M18 12h20l10 10v30a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2z" fill="#fff"/>
<path d="M38 12v10h10z" fill="#f3b3b1"/>
<text x="32" y="46" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="14" text-anchor="middle" fill="#e5322d">PDF</text>
</svg>`;

mkdirSync('build', { recursive: true });
const png = (n) => sharp(Buffer.from(svg), { density: 512 }).resize(n, n).png().toBuffer();

writeFileSync('build/icon.png', await png(512));

const tamanos = [16, 24, 32, 48, 64, 128, 256];
const imagenes = await Promise.all(tamanos.map(png));
const cabecera = Buffer.alloc(6);
cabecera.writeUInt16LE(0, 0); // reservado
cabecera.writeUInt16LE(1, 2); // tipo: icono
cabecera.writeUInt16LE(tamanos.length, 4);
let desplazamiento = 6 + 16 * tamanos.length;
const entradas = tamanos.map((t, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(t === 256 ? 0 : t, 0);
  e.writeUInt8(t === 256 ? 0 : t, 1);
  e.writeUInt16LE(1, 4); // planos
  e.writeUInt16LE(32, 6); // bits por píxel
  e.writeUInt32LE(imagenes[i].length, 8);
  e.writeUInt32LE(desplazamiento, 12);
  desplazamiento += imagenes[i].length;
  return e;
});
writeFileSync('build/icon.ico', Buffer.concat([cabecera, ...entradas, ...imagenes]));
console.log('Iconos generados en build/');
