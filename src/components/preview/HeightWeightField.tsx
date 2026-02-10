import { useState, useCallback } from 'react';
import RulerSlider from './RulerSlider';

export interface HeightWeightValue {
  value: number;
  unit: string;
}

interface HeightWeightFieldProps {
  type: 'height' | 'weight';
  value: HeightWeightValue | undefined;
  onChange: (v: HeightWeightValue) => void;
  /** Default unit from element config */
  defaultUnit?: string;
  /** Whether the user can toggle units */
  allowUnitToggle?: boolean;
  /** Min value (in default unit) */
  min?: number;
  /** Max value (in default unit) */
  max?: number;
  /** Default starting value */
  defaultValue?: number;
}

const UNIT_CONFIG: Record<string, { min: number; max: number; default: number; majorEvery: number }> = {
  kg: { min: 20, max: 250, default: 70, majorEvery: 10 },
  lb: { min: 44, max: 550, default: 154, majorEvery: 10 },
  cm: { min: 100, max: 250, default: 170, majorEvery: 10 },
  pol: { min: 39, max: 98, default: 67, majorEvery: 10 },
};

const UNIT_PAIRS: Record<string, string[]> = {
  height: ['cm', 'pol'],
  weight: ['kg', 'lb'],
};

export default function HeightWeightField({
  type,
  value,
  onChange,
  defaultUnit,
  allowUnitToggle = true,
  min,
  max,
  defaultValue,
}: HeightWeightFieldProps) {
  const units = UNIT_PAIRS[type];
  const initialUnit = defaultUnit && units.includes(defaultUnit) ? defaultUnit : units[0];

  const [activeUnit, setActiveUnit] = useState(value?.unit || initialUnit);

  const unitCfg = UNIT_CONFIG[activeUnit] || UNIT_CONFIG[units[0]];
  const effectiveMin = activeUnit === initialUnit && min != null ? min : unitCfg.min;
  const effectiveMax = activeUnit === initialUnit && max != null ? max : unitCfg.max;
  const effectiveDefault = activeUnit === initialUnit && defaultValue != null ? defaultValue : unitCfg.default;

  const currentValue = value?.value ?? effectiveDefault;

  const handleChange = useCallback(
    (v: number) => {
      onChange({ value: v, unit: activeUnit });
    },
    [onChange, activeUnit],
  );

  const handleUnitSwitch = useCallback(
    (newUnit: string) => {
      if (newUnit === activeUnit) return;
      // Convert proportionally
      const oldCfg = UNIT_CONFIG[activeUnit];
      const newCfg = UNIT_CONFIG[newUnit];
      const ratio = (currentValue - oldCfg.min) / (oldCfg.max - oldCfg.min);
      const converted = Math.round(newCfg.min + ratio * (newCfg.max - newCfg.min));
      setActiveUnit(newUnit);
      onChange({ value: converted, unit: newUnit });
    },
    [activeUnit, currentValue, onChange],
  );

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Unit toggle */}
      {allowUnitToggle && (
        <div className="inline-flex rounded-full bg-secondary p-1 gap-0">
          {units.map((u) => (
            <button
              key={u}
              onClick={() => handleUnitSwitch(u)}
              className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                u === activeUnit
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {/* Large value display */}
      <div className="text-center">
        <span className="text-5xl md:text-6xl font-bold text-foreground tabular-nums">
          {currentValue}
        </span>
        <span className="text-xl md:text-2xl font-medium text-muted-foreground ml-1">
          {activeUnit}
        </span>
      </div>

      {/* Ruler slider */}
      <div className="w-full max-w-md">
        <RulerSlider
          value={currentValue}
          onChange={handleChange}
          min={effectiveMin}
          max={effectiveMax}
          step={1}
          unit={activeUnit}
          majorEvery={unitCfg.majorEvery}
        />
      </div>
    </div>
  );
}
