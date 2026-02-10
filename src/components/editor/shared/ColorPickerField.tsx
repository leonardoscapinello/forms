import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Fallback color shown in the picker when value is empty */
  defaultColor?: string;
}

export default function ColorPickerField({ label, value, onChange, placeholder = 'Transparente', defaultColor = '#ffffff' }: Props) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || defaultColor}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-border cursor-pointer flex-shrink-0"
        />
        <Input
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 h-8 text-xs"
        />
      </div>
    </div>
  );
}
