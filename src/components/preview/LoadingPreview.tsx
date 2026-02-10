import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface LoadingPreviewProps {
  style?: 'bar' | 'circular' | 'infinite';
  duration?: number; // seconds
  targetPercent?: number; // 0-100
  label?: string;
  color?: string;
  trackColor?: string;
  textColor?: string;
  size?: number; // for circular
  stroke?: number; // for circular
  onComplete?: () => void;
  interactive?: boolean; // true in FormPreview, false in editor
}

export default function LoadingPreview({
  style = 'bar',
  duration = 5,
  targetPercent = 100,
  label = 'Carregando...',
  color = '#6366f1',
  trackColor = '#e5e7eb',
  textColor = '#1a1a1a',
  size = 120,
  stroke = 10,
  onComplete,
  interactive = false,
}: LoadingPreviewProps) {
  const [percent, setPercent] = useState(0);
  const completedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!interactive) {
      // Static preview in editor — show at ~40%
      setPercent(style === 'infinite' ? 0 : 40);
      return;
    }

    completedRef.current = false;
    startTimeRef.current = null;
    setPercent(0);

    let animId: number;
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const progress = Math.min((elapsed / duration) * targetPercent, targetPercent);
      setPercent(progress);

      if (progress >= targetPercent && !completedRef.current) {
        completedRef.current = true;
        onComplete?.();
        return;
      }
      if (progress < targetPercent) {
        animId = requestAnimationFrame(animate);
      }
    };

    if (style !== 'infinite') {
      animId = requestAnimationFrame(animate);
    } else {
      // For infinite, trigger completion after duration seconds
      const timer = setTimeout(() => {
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }, duration * 1000);
      return () => clearTimeout(timer);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [interactive, duration, targetPercent, style, onComplete]);

  if (style === 'circular') {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={trackColor}
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={interactive ? offset : circumference * 0.6}
              style={{ transition: 'stroke-dashoffset 0.1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold" style={{ color: textColor }}>
              {Math.round(percent)}%
            </span>
          </div>
        </div>
        {label && (
          <span className="text-sm font-medium" style={{ color: textColor }}>{label}</span>
        )}
      </div>
    );
  }

  if (style === 'infinite') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
          <motion.div
            className="absolute h-full rounded-full"
            style={{ backgroundColor: color, width: '30%' }}
            animate={{ x: ['0%', '233%', '0%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
        {label && (
          <span className="text-sm font-medium" style={{ color: textColor }}>{label}</span>
        )}
      </div>
    );
  }

  // Bar style (default)
  return (
    <div className="flex flex-col gap-2 w-full">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: textColor }}>{label}</span>
          <span className="text-sm font-bold" style={{ color: textColor }}>{Math.round(percent)}%</span>
        </div>
      )}
      <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: trackColor }}>
        <motion.div
          className="h-full rounded-full"
          style={{
            backgroundColor: color,
            width: interactive ? `${percent}%` : '40%',
            transition: interactive ? 'width 0.1s linear' : undefined,
          }}
          {...(!interactive && {
            initial: { width: '0%' },
            animate: { width: '40%' },
            transition: { duration: 1 },
          })}
        />
      </div>
    </div>
  );
}
