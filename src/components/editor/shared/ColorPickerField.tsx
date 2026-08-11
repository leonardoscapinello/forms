import { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

/** Product color palette. */
const BRAND_PALETTE: { hex: string; name: string; group: string }[] = [
  // NEUTRAL
  { hex: '#FAFAFA', name: 'Neutral 01', group: 'Neutral' },
  { hex: '#F4F4F5', name: 'Neutral 02', group: 'Neutral' },
  { hex: '#E4E4E7', name: 'Neutral 03', group: 'Neutral' },
  { hex: '#D4D4D8', name: 'Neutral 04', group: 'Neutral' },
  { hex: '#A1A1AA', name: 'Neutral 05', group: 'Neutral' },
  { hex: '#71717A', name: 'Neutral 06', group: 'Neutral' },
  { hex: '#52525B', name: 'Neutral 07', group: 'Neutral' },
  { hex: '#3F3F46', name: 'Neutral 08', group: 'Neutral' },
  { hex: '#27272A', name: 'Neutral 09', group: 'Neutral' },
  { hex: '#18181B', name: 'Neutral 10', group: 'Neutral' },
  { hex: '#09090B', name: 'Neutral 11', group: 'Neutral' },
  // INDIGO
  { hex: '#ECF1FF', name: 'Indigo 01', group: 'Indigo' },
  { hex: '#DDE6FF', name: 'Indigo 02', group: 'Indigo' },
  { hex: '#C2D1FF', name: 'Indigo 03', group: 'Indigo' },
  { hex: '#9DB1FF', name: 'Indigo 04', group: 'Indigo' },
  { hex: '#7686FF', name: 'Indigo 05', group: 'Indigo' },
  { hex: '#676EFE', name: 'Indigo 06', group: 'Indigo' },
  { hex: '#3D38F3', name: 'Indigo 07', group: 'Indigo' },
  { hex: '#342BD7', name: 'Indigo 08', group: 'Indigo' },
  { hex: '#2B26AD', name: 'Indigo 09', group: 'Indigo' },
  { hex: '#282689', name: 'Indigo 10', group: 'Indigo' },
  { hex: '#19174F', name: 'Indigo 11', group: 'Indigo' },
  // VIOLET
  { hex: '#FCF4FF', name: 'Violet 01', group: 'Violet' },
  { hex: '#F9E7FF', name: 'Violet 02', group: 'Violet' },
  { hex: '#F2CEFF', name: 'Violet 03', group: 'Violet' },
  { hex: '#EBA8FF', name: 'Violet 04', group: 'Violet' },
  { hex: '#DD67FE', name: 'Violet 05', group: 'Violet' },
  { hex: '#CE3FF6', name: 'Violet 06', group: 'Violet' },
  { hex: '#B51FDA', name: 'Violet 07', group: 'Violet' },
  { hex: '#9916B5', name: 'Violet 08', group: 'Violet' },
  { hex: '#7F1494', name: 'Violet 09', group: 'Violet' },
  { hex: '#6B1679', name: 'Violet 10', group: 'Violet' },
  { hex: '#460151', name: 'Violet 11', group: 'Violet' },
  // GRAYSCALE
  { hex: '#F8FAFC', name: 'Gr.Scale 01', group: 'Gr.Scale' },
  { hex: '#F1F5F9', name: 'Gr.Scale 02', group: 'Gr.Scale' },
  { hex: '#E2E8F0', name: 'Gr.Scale 03', group: 'Gr.Scale' },
  { hex: '#CBD5E1', name: 'Gr.Scale 04', group: 'Gr.Scale' },
  { hex: '#94A3B8', name: 'Gr.Scale 05', group: 'Gr.Scale' },
  { hex: '#64748B', name: 'Gr.Scale 06', group: 'Gr.Scale' },
  { hex: '#475569', name: 'Gr.Scale 07', group: 'Gr.Scale' },
  { hex: '#334155', name: 'Gr.Scale 08', group: 'Gr.Scale' },
  { hex: '#1E293B', name: 'Gr.Scale 09', group: 'Gr.Scale' },
  { hex: '#0F172A', name: 'Gr.Scale 10', group: 'Gr.Scale' },
  { hex: '#020617', name: 'Gr.Scale 11', group: 'Gr.Scale' },
  // BLOOD
  { hex: '#FFF3F6', name: 'Blood 01', group: 'Blood' },
  { hex: '#FFDFE5', name: 'Blood 02', group: 'Blood' },
  { hex: '#FFCBD5', name: 'Blood 03', group: 'Blood' },
  { hex: '#FFB0C3', name: 'Blood 04', group: 'Blood' },
  { hex: '#FF7C9B', name: 'Blood 05', group: 'Blood' },
  { hex: '#F3456E', name: 'Blood 06', group: 'Blood' },
  { hex: '#E32552', name: 'Blood 07', group: 'Blood' },
  { hex: '#B31037', name: 'Blood 08', group: 'Blood' },
  { hex: '#8D0C2B', name: 'Blood 09', group: 'Blood' },
  { hex: '#6B0921', name: 'Blood 10', group: 'Blood' },
  { hex: '#4E0819', name: 'Blood 11', group: 'Blood' },
  // Extras (black/white)
  { hex: '#FFFFFF', name: 'Branco', group: 'Base' },
  { hex: '#000000', name: 'Preto', group: 'Base' },
  { hex: '#0C0E17', name: 'Dark BG', group: 'Base' },
];

// Build lookup for getColorName
const COLOR_NAME_MAP = new Map<string, string>();
BRAND_PALETTE.forEach(c => COLOR_NAME_MAP.set(c.hex.toLowerCase(), c.name));

// Group colors for display
const GROUPS = ['Paper', 'Indigo', 'Violet', 'Gr.Scale', 'Blood', 'Base'] as const;

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

  const displayName = value ? getColorName(value) : placeholder;

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full h-8 px-2 rounded-md border border-input bg-background hover:bg-muted transition-colors cursor-pointer"
            title={isTransparent ? placeholder : `${value} — ${displayName}`}
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
              {isTransparent ? placeholder : displayName}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[300px] p-3 space-y-3 max-h-[420px] overflow-y-auto" align="start" side="left">
          {/* Brand palette by group */}
          {GROUPS.map(group => {
            const colors = BRAND_PALETTE.filter(c => c.group === group);
            if (!colors.length) return null;
            return (
              <div key={group}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{group}</p>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${colors.length}, 24px)` }}>
                  {colors.map(c => {
                    const isSelected = value?.toLowerCase() === c.hex.toLowerCase();
                    const isLight = isLightColor(c.hex);
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => onChange(c.hex.toLowerCase())}
                        className={`flex flex-col items-center group relative ${isSelected ? 'ring-1 ring-primary rounded-md' : ''}`}
                        title={`${c.hex} — ${c.name}`}
                      >
                        <div
                          className={`h-5 w-full rounded-[4px] border transition-all hover:scale-110 ${
                            isSelected
                              ? 'border-primary shadow-sm'
                              : 'border-border/40 hover:border-border'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className={`text-[6px] mt-0.5 leading-tight text-center truncate w-full ${
                          isSelected ? 'text-foreground font-semibold' : 'text-muted-foreground'
                        }`}>
                          {c.hex}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Hex input */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-border">
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
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
              {!isTransparent ? displayName : ''}
            </span>
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

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

/** Map hex colors to friendly brand names */
function getColorName(hex: string): string {
  if (!hex) return 'Sem cor';
  return COLOR_NAME_MAP.get(hex.toLowerCase()) || hex;
}
