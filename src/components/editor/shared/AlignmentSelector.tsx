import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type Align = 'left' | 'center' | 'right';

interface Props {
  value?: Align;
  onChange: (value: Align) => void;
  label?: string;
}

const ALIGN_OPTIONS: { value: Align; icon: string }[] = [
  { value: 'left', icon: '◀' },
  { value: 'center', icon: '◆' },
  { value: 'right', icon: '▶' },
];

export default function AlignmentSelector({ value, onChange, label = 'Alinhamento' }: Props) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1">
        {ALIGN_OPTIONS.map(a => (
          <Button
            key={a.value}
            variant={value === a.value ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => onChange(a.value)}
          >
            {a.icon}
          </Button>
        ))}
      </div>
    </div>
  );
}
