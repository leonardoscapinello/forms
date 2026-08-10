import { useRef, useCallback, useEffect, useState } from 'react';

interface RulerSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  majorEvery?: number;
}

const PX_PER_UNIT = 8; // pixels per 1 unit of value

export default function RulerSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  majorEvery = 10,
}: RulerSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startValue = useRef(value);

  const clamp = useCallback(
    (v: number) => Math.round(Math.min(max, Math.max(min, v)) / step) * step,
    [min, max, step],
  );

  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startValue.current = value;
      pointerIdRef.current = e.pointerId;
      containerRef.current?.setPointerCapture(e.pointerId);
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - startX.current;
      const dv = -dx / PX_PER_UNIT;
      onChange(clamp(startValue.current + dv));
    },
    [onChange, clamp],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (pointerIdRef.current !== null) {
      try { containerRef.current?.releasePointerCapture(pointerIdRef.current); } catch {
        // Capture may already have been released by the browser.
      }
      pointerIdRef.current = null;
    }
  }, []);

  // Mouse wheel support
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      onChange(clamp(value + Math.sign(delta) * step));
    },
    [value, onChange, clamp, step],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Build visible ticks around the current value
  const containerWidth = containerRef.current?.clientWidth || 320;
  const halfVisible = Math.ceil(containerWidth / 2 / PX_PER_UNIT) + 5;
  const tickStart = Math.max(min, Math.floor((value - halfVisible) / step) * step);
  const tickEnd = Math.min(max, Math.ceil((value + halfVisible) / step) * step);

  const ticks: { val: number; isMajor: boolean }[] = [];
  for (let v = tickStart; v <= tickEnd; v += step) {
    ticks.push({ val: v, isMajor: v % majorEvery === 0 });
  }

  // Offset so that `value` is at center (0px)
  const offsetPx = 0; // center is always at 50%

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ height: 72 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Ticks layer — translated so `value` is at center */}
      <div
        className="absolute top-0 h-full pointer-events-none"
        style={{
          left: '50%',
        }}
      >
        {ticks.map((t) => {
          const x = (t.val - value) * PX_PER_UNIT;
          return (
            <div
              key={t.val}
              className="absolute flex flex-col items-center"
              style={{ left: x, transform: 'translateX(-50%)', top: 0 }}
            >
              <div
                className={`rounded-full ${
                  t.isMajor ? 'w-[2px] h-6 bg-foreground/35' : 'w-[1px] h-4 bg-foreground/15'
                }`}
              />
              {t.isMajor && (
                <span className="text-[11px] text-muted-foreground mt-1 whitespace-nowrap tabular-nums">
                  {t.val}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed center pointer */}
      <div
        className="absolute z-10 flex flex-col items-center pointer-events-none"
        style={{ left: '50%', top: 0, transform: 'translateX(-50%)' }}
      >
        <div className="w-[3px] h-[28px] bg-foreground rounded-full" />
        <div
          className="w-0 h-0"
          style={{
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '9px solid hsl(var(--foreground))',
          }}
        />
      </div>

      {/* Hint at bottom */}
      <p className="absolute bottom-0 left-0 right-0 text-center text-[11px] text-muted-foreground">
        Arraste para ajustar
      </p>
    </div>
  );
}
