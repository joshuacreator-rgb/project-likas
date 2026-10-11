import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const WHEEL_STEP = 0.25;

type Offset = { x: number; y: number };

/**
 * In-app photo viewer.
 *
 * Report evidence and other photos open here instead of a new browser tab, so
 * the user stays in Project Likas. Supports wheel/pinch zoom, drag-to-pan once
 * zoomed, double-click to toggle zoom, the zoom buttons, and Esc to close.
 */
export default function ImageLightbox({
  open,
  src,
  fileName,
  onClose,
}: {
  open: boolean;
  src: string | null;
  fileName: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ active: boolean; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, src, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "+" || event.key === "=") setScale(s => clamp(s + WHEEL_STEP));
      else if (event.key === "-" || event.key === "_") setScale(s => clamp(s - WHEEL_STEP));
      else if (event.key === "0") reset();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, reset]);

  useEffect(() => {
    const node = imgRef.current;
    if (!open || !node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale(s => clamp(s - Math.sign(event.deltaY) * WHEEL_STEP));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [open, src]);

  if (!open || !src) return null;

  function applyScale(next: number, origin?: Offset) {
    const value = clamp(next);
    if (value === MIN_SCALE) setOffset({ x: 0, y: 0 });
    else if (origin) setOffset(current => ({ x: current.x - origin.x, y: current.y - origin.y }));
    setScale(value);
  }

  function onPointerDown(event: React.PointerEvent<HTMLImageElement>) {
    if (scale <= MIN_SCALE) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { active: true, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
  }
  function onPointerMove(event: React.PointerEvent<HTMLImageElement>) {
    if (!drag.current?.active) return;
    setOffset({
      x: drag.current.originX + (event.clientX - drag.current.startX),
      y: drag.current.originY + (event.clientY - drag.current.startY),
    });
  }
  function onPointerUp(event: React.PointerEvent<HTMLImageElement>) {
    if (drag.current?.active) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      drag.current.active = false;
    }
  }

  return (
    <div className="img-lightbox" role="dialog" aria-modal="true" aria-label={`Photo: ${fileName}`} onClick={onClose}>
      <div className="img-lightbox-bar" onClick={event => event.stopPropagation()}>
        <span className="img-lightbox-title" title={fileName}>{fileName}</span>
        <div className="img-lightbox-tools">
          <button type="button" aria-label="Zoom out" disabled={scale <= MIN_SCALE} onClick={() => applyScale(scale - WHEEL_STEP)}>
            <Minus size={17} />
          </button>
          <span className="img-lightbox-zoom">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="Zoom in" disabled={scale >= MAX_SCALE} onClick={() => applyScale(scale + WHEEL_STEP)}>
            <Plus size={17} />
          </button>
          <button type="button" aria-label="Reset zoom" disabled={scale === MIN_SCALE} onClick={reset}>
            <RotateCcw size={16} />
          </button>
          <button type="button" className="img-lightbox-close" aria-label="Close photo" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="img-lightbox-stage">
        <img
          ref={imgRef}
          src={src}
          alt={fileName}
          draggable={false}
          className={scale > MIN_SCALE ? "zoomed" : undefined}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          onClick={event => event.stopPropagation()}
          onDoubleClick={event => {
            event.stopPropagation();
            scale > MIN_SCALE ? reset() : applyScale(2);
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
      <p className="img-lightbox-hint" onClick={event => event.stopPropagation()}>
        Scroll or pinch to zoom · drag to pan · double-click to toggle · Esc to close
      </p>
    </div>
  );
}

function clamp(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));
}
