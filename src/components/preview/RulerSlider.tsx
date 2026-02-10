import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

interface RulerSliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit: string;
  /** How many minor ticks between major labels */
  majorEvery?: number;
}

/**
 * A horizontal ruler-style slider with tick marks, a triangle pointer,
 * drag support for both touch and mouse.
 */
export default function RulerSlider({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  majorEvery = 10,
}: RulerSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) / step) * step;

  const getValueFromX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;
      const rect = track.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return clamp(min + ratio * (max - min));
    },
    [min, max, step, value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      onChange(getValueFromX(e.clientX));
    },
    [getValueFromX, onChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      onChange(getValueFromX(e.clientX));
    },
    [getValueFromX, onChange],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Visible window: show ±range around value
  const visibleRange = Math.min(30, Math.floor((max - min) / 2));
  const windowStart = Math.max(min, value - visibleRange);
  const windowEnd = Math.min(max, value + visibleRange);

  // Build tick data
  const ticks: { val: number; isMajor: boolean }[] = [];
  for (let v = windowStart; v <= windowEnd; v += step) {
    ticks.push({ val: v, isMajor: v % majorEvery === 0 });
  }

  // Position ratio within [windowStart..windowEnd]
  const pointerRatio = (value - windowStart) / (windowEnd - windowStart) || 0.5;

  return (
    <div className="flex flex-col items-center select-none w-full">
      {/* Ruler track */}
      <div
        ref={trackRef}
        className="relative w-full cursor-grab active:cursor-grabbing"
        style={{ height: 64 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Ticks */}
        <div className="absolute inset-x-0 top-0 flex items-start" style={{ height: 40 }}>
          {ticks.map((t) => {
            const ratio = (t.val - windowStart) / (windowEnd - windowStart);
            return (
              <div
                key={t.val}
                className="absolute flex flex-col items-center"
                style={{ left: `${ratio * 100}%`, transform: 'translateX(-50%)' }}
              >
                <div
                  className={`rounded-full ${
                    t.isMajor ? 'w-[2px] h-5 bg-foreground/40' : 'w-[1px] h-3 bg-foreground/20'
                  }`}
                />
                {t.isMajor && (
                  <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                    {t.val}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Center line / pointer */}
        <div
          className="absolute top-0 flex flex-col items-center z-10"
          style={{ left: `${pointerRatio * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="w-[3px] h-10 bg-foreground rounded-full" />
          {/* Triangle */}
          <div
            className="w-0 h-0 mt-0"
            style={{
              borderLeft: '8px solid transparent',
              borderRight: '8px solid transparent',
              borderTop: '10px solid hsl(var(--foreground))',
            }}
          />
        </div>
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground mt-1">Arraste para ajustar</p>
    </div>
  );
}
