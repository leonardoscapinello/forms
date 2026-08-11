import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';

type Align = 'left' | 'center' | 'right';

interface Props {
  value?: Align;
  onChange: (value: Align) => void;
  label?: string;
  helpText?: string;
}

const ALIGN_OPTIONS: { value: Align; label: string; icon: React.ElementType }[] = [
  { value: 'left', label: 'Esquerda', icon: AlignLeft },
  { value: 'center', label: 'Centro', icon: AlignCenter },
  { value: 'right', label: 'Direita', icon: AlignRight },
];

export default function AlignmentSelector({
  value,
  onChange,
  label = 'Alinhamento do conteúdo',
  helpText = 'Define como o texto e o conteúdo deste elemento se posicionam dentro do próprio bloco.',
}: Props) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs">{label}</Label>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{helpText}</p>
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={label}>
        {ALIGN_OPTIONS.map(a => {
          const Icon = a.icon;
          const selected = (value || 'left') === a.value;
          return (
            <Button
              key={a.value}
              type="button"
              variant={selected ? 'default' : 'outline'}
              size="sm"
              className="h-9 gap-1.5 px-2 text-[11px]"
              onClick={() => onChange(a.value)}
              aria-pressed={selected}
              title={`Alinhar à ${a.label.toLowerCase()}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden min-[360px]:inline">{a.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
