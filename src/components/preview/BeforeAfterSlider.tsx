import { useState, useRef, useCallback } from 'react';
import { ImageIcon } from 'lucide-react';

interface Props {
  beforeImage: string;
  afterImage: string;
  mode: 'slider' | 'side_by_side';
}

/**
 * Interactive before/after image comparison.
 * - slider: drag handle to reveal before/after
 * - side_by_side: two images next to each other
 */
export default function BeforeAfterSlider({ beforeImage, afterImage, mode }: Props) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const hasBefore = !!beforeImage;
  const hasAfter = !!afterImage;

  if (mode === 'side_by_side') {
    return (
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Antes</span>
          {hasBefore ? (
            <img src={beforeImage} alt="Antes" className="w-full rounded-lg object-cover" style={{ maxHeight: 300 }} />
          ) : (
            <div className="h-48 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Depois</span>
          {hasAfter ? (
            <img src={afterImage} alt="Depois" className="w-full rounded-lg object-cover" style={{ maxHeight: 300 }} />
          ) : (
            <div className="h-48 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Slider mode
  if (!hasBefore || !hasAfter) {
    return (
      <div className="h-48 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground gap-3">
        <ImageIcon className="h-6 w-6" />
        <span className="text-sm">Adicione as imagens de antes e depois</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl overflow-hidden select-none cursor-col-resize"
      style={{ aspectRatio: '16/10' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* After image (full background) */}
      <img
        src={afterImage}
        alt="Depois"
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${position}%` }}
      >
        <img
          src={beforeImage}
          alt="Antes"
          className="absolute inset-0 h-full object-cover"
          style={{ width: containerRef.current ? `${containerRef.current.offsetWidth}px` : '100vw', maxWidth: 'none' }}
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-lg"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      />

      {/* Handle */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white shadow-xl flex items-center justify-center z-10 border-2 border-white/80"
        style={{ left: `${position}%`, transform: 'translate(-50%, -50%)' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-muted-foreground">
          <path d="M5 3L2 8L5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M11 3L14 8L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Labels */}
      <span className="absolute left-3 bottom-3 text-xs font-semibold text-white bg-black/50 px-2.5 py-1 rounded-lg backdrop-blur-sm">
        Antes
      </span>
      <span className="absolute right-3 bottom-3 text-xs font-semibold text-white bg-black/50 px-2.5 py-1 rounded-lg backdrop-blur-sm">
        Depois
      </span>
    </div>
  );
}
