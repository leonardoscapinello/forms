import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import RulerSlider from './RulerSlider';

interface HeightWeightFieldProps {
  type: 'height' | 'weight';
  value: number | undefined;
  onChange: (v: number) => void;
  defaultUnit?: string;
}

const CONFIG = {
  height: {
    units: [
      { key: 'cm', label: 'cm', min: 100, max: 250, default: 170, majorEvery: 10 },
      { key: 'pol', label: 'pol', min: 39, max: 98, default: 67, majorEvery: 10 },
    ],
  },
  weight: {
    units: [
      { key: 'kg', label: 'kg', min: 20, max: 250, default: 70, majorEvery: 10 },
      { key: 'lb', label: 'lb', min: 44, max: 550, default: 154, majorEvery: 10 },
    ],
  },
};

export default function HeightWeightField({ type, value, onChange, defaultUnit }: HeightWeightFieldProps) {
  const config = CONFIG[type];
  const [unitIndex, setUnitIndex] = useState(() => {
    if (defaultUnit) {
      const idx = config.units.findIndex(u => u.key === defaultUnit);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  const unit = config.units[unitIndex];
  const currentValue = value ?? unit.default;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Unit toggle */}
      <div className="inline-flex rounded-full bg-secondary p-1 gap-0">
        {config.units.map((u, i) => (
          <button
            key={u.key}
            onClick={() => {
              if (i !== unitIndex) {
                setUnitIndex(i);
                // Convert value between units
                const from = config.units[unitIndex];
                const to = config.units[i];
                const ratio = (currentValue - from.min) / (from.max - from.min);
                const converted = Math.round(to.min + ratio * (to.max - to.min));
                onChange(converted);
              }
            }}
            className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all ${
              i === unitIndex
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      {/* Large value display */}
      <div className="text-center">
        <span className="text-5xl md:text-6xl font-bold text-foreground tabular-nums">
          {currentValue}
        </span>
        <span className="text-xl md:text-2xl font-medium text-muted-foreground ml-1">
          {unit.label}
        </span>
      </div>

      {/* Ruler slider */}
      <div className="w-full max-w-md">
        <RulerSlider
          value={currentValue}
          onChange={onChange}
          min={unit.min}
          max={unit.max}
          step={1}
          unit={unit.label}
          majorEvery={unit.majorEvery}
        />
      </div>
    </div>
  );
}
