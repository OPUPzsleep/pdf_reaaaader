import { useEffect, useRef, useState } from 'react';
import { dibujarPagina, type PDFDocumentProxy } from '../lib/pdfjs';

interface Props {
  doc: PDFDocumentProxy;
  /** 1 = primera página */
  numero: number;
  /** Ancho de la miniatura en píxeles CSS */
  ancho?: number;
  /** Giro extra en grados (múltiplo de 90) */
  rotacion?: number;
}

/** Miniatura de una página que solo se dibuja cuando entra en pantalla. */
export function MiniaturaPagina({ doc, numero, ancho = 140, rotacion = 0 }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [proporcion, setProporcion] = useState(0.707);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let vivo = true;
    let cancelar: (() => void) | undefined;
    (async () => {
      try {
        const pagina = await doc.getPage(numero);
        const base = pagina.getViewport({ scale: 1, rotation: (pagina.rotate + rotacion) % 360 });
        if (!vivo || !canvas.current) return;
        setProporcion(base.width / base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const r = await dibujarPagina(pagina, canvas.current, (ancho * dpr) / base.width, { fondo: '#ffffff', rotacion });
        cancelar = r.cancelar;
        pagina.cleanup();
      } catch {
        /* cancelado o página no disponible */
      }
    })();
    return () => {
      vivo = false;
      cancelar?.();
    };
  }, [visible, doc, numero, ancho, rotacion]);

  return (
    <div ref={caja} className="miniatura" style={{ width: ancho, aspectRatio: String(proporcion) }}>
      <canvas ref={canvas} />
    </div>
  );
}
