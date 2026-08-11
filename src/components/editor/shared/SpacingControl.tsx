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
  const hasIndividualSides = Object.values(sides || {}).some(side => side !== undefined);
  const [linkedOverride, setLinkedOverride] = useState<boolean | null>(null);
  const linked = linkedOverride ?? !hasIndividualSides;

  const prefix = property;
  const topKey = `${prefix}Top`;
  const rightKey = `${prefix}Right`;
  const bottomKey = `${prefix}Bottom`;
  const leftKey = `${prefix}Left`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">{label}</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {property === 'padding'
              ? 'Espaço entre o conteúdo e a borda do bloco.'
              : 'Espaço entre este bloco e os elementos ao redor.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLinkedOverride(!linked)}
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={linked ? 'Editar lados individualmente' : 'Editar todos juntos'}
          aria-label={linked ? 'Separar os quatro lados' : 'Vincular os quatro lados'}
        >
          {linked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
        </button>
      </div>
      {linked ? (
        <div className="grid grid-cols-[1fr_58px] items-center gap-3">
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
            aria-label={`${label} em todos os lados`}
          />
          <div className="flex h-8 items-center justify-center rounded-md border border-input bg-background text-xs tabular-nums text-foreground">
            {value ?? 0}px
          </div>
        </div>
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
                  aria-label={`${label}: ${sideLabel.toLowerCase()}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
