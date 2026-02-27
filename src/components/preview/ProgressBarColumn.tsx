import { useEffect, useState, useRef } from 'react';
import { ProgressBarItem } from '@/types/pageElements';

interface Props {
  bar: ProgressBarItem;
  disposition: string;
  colBorderWidth?: number;
  colBorderStyle?: string;
  colBorderColor?: string;
  colBorderRadius?: number;
}

function useAnimatedNumber(target: number, duration = 1000) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>();
  const startRef = useRef(0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const from = 0;
    setDisplay(0);

    const timer = setTimeout(() => {
      startRef.current = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startRef.current;
        const progress = Math.min(1, elapsed / duration);
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const val = Math.round(from + (target - from) * eased);
        setDisplay(val);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 80);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return display;
}

export default function ProgressBarColumn({
  bar,
  disposition,
  colBorderWidth,
  colBorderStyle,
  colBorderColor,
  colBorderRadius,
}: Props) {
  const target = Math.min(100, Math.max(0, bar.value));
  const animatedNum = useAnimatedNumber(target, 1000);
  const [barHeight, setBarHeight] = useState(0);

  useEffect(() => {
    setBarHeight(0);
    const t = setTimeout(() => setBarHeight(target), 80);
    return () => clearTimeout(t);
  }, [target]);

  const barBg = bar.barBackground || 'rgba(0,0,0,0.08)';
  const valColor = bar.valueColor || bar.color;
  const lblColor = bar.labelColor || 'hsl(var(--foreground))';

  const bw = colBorderWidth ?? 1;
  const colStyle: React.CSSProperties = {
    borderWidth: bw,
    borderStyle: bw > 0 ? (colBorderStyle || 'solid') : 'none',
    borderColor: bw > 0 ? (colBorderColor || 'rgba(0,0,0,0.12)') : undefined,
    borderRadius: colBorderRadius ?? 8,
  };

  const barContent = (
    <div className="w-full max-w-[120px] h-48 rounded-xl overflow-hidden relative" style={{ backgroundColor: barBg }}>
      <div
        className="absolute bottom-0 left-0 right-0 rounded-xl"
        style={{
          height: `${barHeight}%`,
          backgroundColor: bar.color,
          transition: 'height 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      <div className="absolute inset-0 flex items-start justify-center pt-3">
        <span className="text-base font-extrabold drop-shadow-sm tabular-nums" style={{ color: valColor }}>
          {animatedNum}%
        </span>
      </div>
    </div>
  );

  const labelContent = (
    <p className="text-sm font-semibold text-center leading-snug" style={{ color: lblColor }}>
      {bar.label}
    </p>
  );

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={colStyle}>
      {disposition === 'chart_legend' ? <>{barContent}{labelContent}</> : <>{labelContent}{barContent}</>}
    </div>
  );
}
