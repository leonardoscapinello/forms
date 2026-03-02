import { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const COLOR_PRESETS = [
  '#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#fca5a5', '#fed7aa',
  '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#14b8a6', '#0ea5e9', '#7c3aed', '#c084fc',
];

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultColor?: string;
  allowTransparent?: boolean;
}

export default function ColorPickerField({
  label,
  value,
  onChange,
  placeholder = 'Sem cor',
  defaultColor = '#ffffff',
  allowTransparent = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isTransparent = !value || value === 'transparent';

  // Sync hex input when value changes externally
  useEffect(() => {
    if (!open) return;
    setHexInput(isTransparent ? '' : value.replace('#', ''));
  }, [value, open, isTransparent]);

  const commitHex = () => {
    const cleaned = hexInput.replace(/[^0-9a-fA-F]/g, '');
    if (cleaned.length === 3 || cleaned.length === 6) {
      const full = cleaned.length === 3
        ? cleaned.split('').map(c => c + c).join('')
        : cleaned;
      onChange('#' + full.toLowerCase());
    }
  };

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full h-8 px-2 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors cursor-pointer"
            title={isTransparent ? placeholder : value}
          >
            <div
              className="h-4 w-4 rounded border border-border flex-shrink-0 relative overflow-hidden"
              style={{ backgroundColor: isTransparent ? 'transparent' : value }}
            >
              {isTransparent && (
                <div className="absolute inset-0">
                  <svg width="16" height="16" viewBox="0 0 16 16" className="w-full h-full">
                    <rect width="8" height="8" fill="#e5e7eb" />
                    <rect x="8" y="8" width="8" height="8" fill="#e5e7eb" />
                    <rect x="8" width="8" height="8" fill="#fff" />
                    <rect y="8" width="8" height="8" fill="#fff" />
                  </svg>
                </div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground truncate flex-1 text-left">
              {isTransparent ? placeholder : ''}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-3 space-y-3" align="start" side="left">
          {/* Presets grid */}
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_PRESETS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => onChange(color)}
                className={`h-6 w-full rounded-md border transition-all hover:scale-110 ${
                  value === color
                    ? 'border-primary ring-1 ring-primary shadow-sm'
                    : 'border-border/50 hover:border-border'
                }`}
                style={{ backgroundColor: color }}
                title={getColorName(color)}
              />
            ))}
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-1.5">
            <div
              className="h-7 w-7 rounded-md border border-border flex-shrink-0"
              style={{ backgroundColor: isTransparent ? 'transparent' : value }}
            />
            <div className="flex items-center flex-1 h-7 rounded-md border border-input bg-background px-2">
              <span className="text-[11px] text-muted-foreground select-none">#</span>
              <input
                ref={inputRef}
                type="text"
                value={hexInput}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  setHexInput(v);
                }}
                onBlur={commitHex}
                onKeyDown={e => { if (e.key === 'Enter') commitHex(); }}
                placeholder="000000"
                className="flex-1 bg-transparent text-[11px] text-foreground outline-none w-0 font-mono"
                maxLength={6}
              />
            </div>
          </div>

          {/* Transparent / Remove */}
          {allowTransparent && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 gap-1.5"
              onClick={() => onChange('')}
            >
              <X className="h-3 w-3" />
              Remover cor
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Map hex colors to friendly Portuguese names */
function getColorName(hex: string): string {
  if (!hex) return 'Sem cor';
  const map: Record<string, string> = {
    '#000000': 'Preto',
    '#333333': 'Cinza escuro',
    '#666666': 'Cinza',
    '#999999': 'Cinza médio',
    '#cccccc': 'Cinza claro',
    '#ffffff': 'Branco',
    '#ef4444': 'Vermelho',
    '#f97316': 'Laranja',
    '#f59e0b': 'Âmbar',
    '#eab308': 'Amarelo',
    '#fca5a5': 'Rosa claro',
    '#fed7aa': 'Pêssego',
    '#22c55e': 'Verde',
    '#06b6d4': 'Ciano',
    '#3b82f6': 'Azul',
    '#6366f1': 'Índigo',
    '#8b5cf6': 'Violeta',
    '#a855f7': 'Roxo',
    '#ec4899': 'Pink',
    '#f43f5e': 'Rosa',
    '#14b8a6': 'Turquesa',
    '#0ea5e9': 'Azul celeste',
    '#7c3aed': 'Violeta escuro',
    '#c084fc': 'Lilás',
    '#fafaf6': 'Creme',
    '#FAFAF6': 'Creme',
    '#203300': 'Verde escuro',
  };
  return map[hex.toLowerCase()] || map[hex] || hex;
}
