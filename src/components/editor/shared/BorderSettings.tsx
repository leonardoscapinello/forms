import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ColorPickerField from './ColorPickerField';

interface Props {
  borderWidth?: number;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: number;
  onChange: (patch: Record<string, any>) => void;
}

export default function BorderSettings({ borderWidth, borderStyle, borderColor, borderRadius, onChange }: Props) {
  return (
    <>
      <div className="space-y-2 mb-4">
        <Label className="text-xs">Bordas</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Largura</span>
            <Input
              type="number"
              value={borderWidth ?? ''}
              onChange={e => onChange({ borderWidth: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="0"
              className="h-8 text-xs"
              min={0}
              max={20}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Estilo</span>
            <Select
              value={borderStyle || 'solid'}
              onValueChange={v => onChange({ borderStyle: v as any })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Sólida</SelectItem>
                <SelectItem value="dashed">Tracejada</SelectItem>
                <SelectItem value="dotted">Pontilhada</SelectItem>
                <SelectItem value="none">Nenhuma</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ColorPickerField
          label="Cor da borda"
          value={borderColor || ''}
          onChange={v => onChange({ borderColor: v || undefined })}
          placeholder="Padrão"
          defaultColor="#e5e7eb"
        />
      </div>

      <div className="space-y-2 mb-4">
        <Label className="text-xs">Arredondamento ({borderRadius ?? 0}px)</Label>
        <Slider
          value={[borderRadius ?? 0]}
          onValueChange={([v]) => onChange({ borderRadius: v })}
          min={0}
          max={50}
          step={1}
        />
      </div>
    </>
  );
}
