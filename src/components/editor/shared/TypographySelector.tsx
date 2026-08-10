import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_FONT_FAMILY, normalizeFontFamilyName } from '@/lib/fontUtils';

const FONT_OPTIONS = [
  { value: DEFAULT_FONT_FAMILY, label: DEFAULT_FONT_FAMILY },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Source Sans 3', label: 'Source Sans 3' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
];

const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: 'normal', label: 'Normal' },
  { value: '500', label: 'Médio' },
  { value: '600', label: 'Semibold' },
  { value: 'bold', label: 'Bold' },
  { value: '800', label: 'Extra Bold' },
  { value: '900', label: 'Black' },
];

interface Props {
  fontFamily?: string;
  fontWeight?: string;
  onFontFamilyChange: (value: string | undefined) => void;
  onFontWeightChange: (value: string | undefined) => void;
  label?: string;
}

export default function TypographySelector({ fontFamily, fontWeight, onFontFamilyChange, onFontWeightChange, label = 'Tipografia' }: Props) {
  const selectedFontFamily = normalizeFontFamilyName(fontFamily);

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={selectedFontFamily}
          onValueChange={v => onFontFamilyChange(v || DEFAULT_FONT_FAMILY)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Fonte" /></SelectTrigger>
          <SelectContent>
            {FONT_OPTIONS.map(f => (
              <SelectItem key={f.value} value={f.value}>
                <span style={{ fontFamily: f.value }}>{f.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={fontWeight || ''}
          onValueChange={v => onFontWeightChange(v || undefined)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Peso" /></SelectTrigger>
          <SelectContent>
            {WEIGHT_OPTIONS.map(w => (
              <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export { FONT_OPTIONS, WEIGHT_OPTIONS };
