import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SHADOW_OPTIONS = [
  { value: 'none', label: 'Nenhuma' },
  { value: '0 1px 3px rgba(0,0,0,0.08)', label: 'Leve' },
  { value: '0 4px 12px rgba(0,0,0,0.1)', label: 'Média' },
  { value: '0 8px 24px rgba(0,0,0,0.15)', label: 'Forte' },
  { value: '0 12px 40px rgba(0,0,0,0.2)', label: 'Extra forte' },
];

interface Props {
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
}

export default function ShadowSelector({ value, onChange, label = 'Sombra' }: Props) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value || 'none'}
        onValueChange={v => onChange(v === 'none' ? undefined : v)}
      >
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem sombra" /></SelectTrigger>
        <SelectContent>
          {SHADOW_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
