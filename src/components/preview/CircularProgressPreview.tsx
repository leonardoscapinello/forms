import { useEffect, useState, useRef } from 'react';

interface Props {
  value: number; // 0-100
  labelBefore?: string;
  labelAfter?: string;
  color?: string;
  trackColor?: string;
  textColor?: string;
  labelColor?: string;
  size?: number;
  strokeWidth?: number;
}

function useAnimatedCounter(target: number, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setDisplay(0);

    const timer = setTimeout(() => {
      startRef.current = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startRef.current;
        const progress = Math.min(1, elapsed / duration);
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        setDisplay(Math.round(eased * target));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 50);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

export default function CircularProgressPreview({
  value = 0,
  labelBefore,
  labelAfter,
  color = '#22c55e',
  trackColor = '#e5e7eb',
  textColor = '#1a1a1a',
  labelColor = '#6b7280',
  size = 160,
  strokeWidth = 14,
}: Props) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const displayNum = useAnimatedCounter(clampedValue, 1200);

  const [dashTarget, setDashTarget] = useState(0);
  useEffect(() => {
    setDashTarget(0);
    const t = setTimeout(() => setDashTarget(clampedValue), 50);
    return () => clearTimeout(t);
  }, [clampedValue]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (dashTarget / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      {labelBefore && (
        <p className="text-sm font-medium text-center" style={{ color: labelColor }}>
          {labelBefore}
        </p>
      )}

      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>

        {/* Center percentage */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: textColor }}
        >
          <span className="font-bold tabular-nums" style={{ fontSize: size * 0.22 }}>
            {displayNum}%
          </span>
        </div>
      </div>

      {labelAfter && (
        <p className="text-sm font-medium text-center" style={{ color: labelColor }}>
          {labelAfter}
        </p>
      )}
    </div>
  );
}
