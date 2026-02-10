import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const WIDTH_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  { value: '100%', label: '100%' },
  { value: '75%', label: '75%' },
  { value: '50%', label: '50%' },
];

interface Props {
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
}

export default function WidthSelector({ value, onChange, label = 'Largura' }: Props) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value || 'auto'}
        onValueChange={v => onChange(v === 'auto' ? undefined : v)}
      >
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {WIDTH_OPTIONS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
