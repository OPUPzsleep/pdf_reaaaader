// Empaqueta el proceso principal y el preload con esbuild (salida CommonJS).
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const comun = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // Módulos nativos o que deben cargarse desde node_modules (asarUnpack).
  external: ['electron', 'sharp', 'onnxruntime-node'],
};

const entradas = [
  { entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' },
  { entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' },
];

if (watch) {
  for (const e of entradas) {
    const ctx = await context({ ...comun, ...e });
    await ctx.watch();
  }
} else {
  await Promise.all(entradas.map((e) => build({ ...comun, ...e })));
}
