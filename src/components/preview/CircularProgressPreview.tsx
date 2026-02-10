import { useEffect, useState } from 'react';

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
  const [animatedValue, setAnimatedValue] = useState(0);
  const clampedValue = Math.min(100, Math.max(0, value));

  useEffect(() => {
    // Animate from 0 to target
    setAnimatedValue(0);
    const timeout = setTimeout(() => setAnimatedValue(clampedValue), 50);
    return () => clearTimeout(timeout);
  }, [clampedValue]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedValue / 100) * circumference;

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
          <span className="font-bold" style={{ fontSize: size * 0.22 }}>
            {Math.round(animatedValue)}%
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
