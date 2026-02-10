import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Link, Unlink } from 'lucide-react';

type Side = 'Top' | 'Right' | 'Bottom' | 'Left';
const SIDES: { key: Side; label: string }[] = [
  { key: 'Top', label: 'Cima' },
  { key: 'Right', label: 'Direita' },
  { key: 'Bottom', label: 'Baixo' },
  { key: 'Left', label: 'Esquerda' },
];

interface Props {
  /** 'padding' or 'margin' */
  property: 'padding' | 'margin';
  label: string;
  /** The unified value (e.g. style.padding) */
  value?: number;
  /** Individual side values */
  sides?: { top?: number; right?: number; bottom?: number; left?: number };
  onChange: (patch: Record<string, any>) => void;
  max?: number;
  step?: number;
}

export default function SpacingControl({ property, label, value, sides, onChange, max = 80, step = 2 }: Props) {
  const [linked, setLinked] = useState(true);

  const prefix = property;
  const topKey = `${prefix}Top`;
  const rightKey = `${prefix}Right`;
  const bottomKey = `${prefix}Bottom`;
  const leftKey = `${prefix}Left`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <button
          type="button"
          onClick={() => setLinked(!linked)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={linked ? 'Editar lados individualmente' : 'Editar todos juntos'}
        >
          {linked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
        </button>
      </div>
      {linked ? (
        <Slider
          value={[value ?? 0]}
          onValueChange={([v]) => onChange({
            [prefix]: v,
            [topKey]: undefined,
            [rightKey]: undefined,
            [bottomKey]: undefined,
            [leftKey]: undefined,
          })}
          min={0}
          max={max}
          step={step}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {SIDES.map(({ key, label: sideLabel }) => {
            const sideKey = `${prefix}${key}`;
            const sideValue = sides?.[key.toLowerCase() as keyof typeof sides] ?? value ?? 0;
            return (
              <div key={key} className="space-y-1">
                <span className="text-[10px] text-muted-foreground">{sideLabel}</span>
                <Input
                  type="number"
                  value={sideValue}
                  onChange={e => onChange({ [prefix]: undefined, [sideKey]: e.target.value ? Number(e.target.value) : 0 })}
                  className="h-8 text-xs"
                  min={0}
                  max={max}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
