import type { Fragmento } from './tipos';

export interface RutasOcr {
  /** Carpeta o URL con worker.min.js */
  workerPath: string;
  /** Carpeta o URL con tesseract-core*-lstm.wasm.js */
  corePath: string;
  /** Carpeta o URL con <idioma>.traineddata.gz */
  langPath: string;
}

type TesseractWorker = import('tesseract.js').Worker;
type Linea = import('tesseract.js').Line;

/** Convierte las líneas reconocidas por Tesseract en fragmentos de texto en coordenadas de página (PDF). */
export function fragmentosDeLineas(lineas: Linea[], escala: number, altoPagina: number): Fragmento[] {
  const salida: Fragmento[] = [];
  for (const l of lineas) {
    const texto = l.text.replace(/\s+/g, ' ').trim();
    if (!texto || l.confidence < 25) continue;
    const alto = (l.bbox.y1 - l.bbox.y0) / escala;
    const base = l.baseline ? (l.baseline.y0 + l.baseline.y1) / 2 : l.bbox.y1 - (l.bbox.y1 - l.bbox.y0) * 0.2;
    // Tesseract mide la línea con ascendentes y descendentes: el cuerpo de letra es algo menor
    const tam = Math.max(4, alto * 0.78);
    salida.push({
      texto,
      x: l.bbox.x0 / escala,
      y: altoPagina - base / escala,
      ancho: (l.bbox.x1 - l.bbox.x0) / escala,
      tam,
      negrita: false,
      cursiva: false,
      mono: false,
    });
  }
  return salida;
}

export class MotorOcr {
  private constructor(private worker: TesseractWorker) {}

  /** Para pruebas o entornos con un trabajador ya creado. */
  static envolver(worker: TesseractWorker): MotorOcr {
    return new MotorOcr(worker);
  }

  /** `idioma` en formato Tesseract: «spa», «eng» o «spa+eng». */
  static async crear(idioma: string, rutas: RutasOcr): Promise<MotorOcr> {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(idioma, 1, {
      workerPath: rutas.workerPath,
      corePath: rutas.corePath,
      langPath: rutas.langPath,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
    });
    return new MotorOcr(worker);
  }

  async reconocer(imagen: Parameters<TesseractWorker['recognize']>[0], escala: number, altoPagina: number): Promise<Fragmento[]> {
    const r = await this.worker.recognize(imagen, {}, { blocks: true });
    const lineas = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
    return fragmentosDeLineas(lineas, escala, altoPagina);
  }

  async terminar() {
    await this.worker.terminate();
  }
}
