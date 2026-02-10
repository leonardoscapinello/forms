import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const COLOR_PRESETS = [
  // Row 1 - Basics
  '#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
  // Row 2 - Warm
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#fca5a5', '#fed7aa',
  // Row 3 - Cool
  '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  // Row 4 - Accent
  '#ec4899', '#f43f5e', '#14b8a6', '#0ea5e9', '#7c3aed', '#c084fc',
];

interface Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Fallback color shown in the swatch when value is empty */
  defaultColor?: string;
  /** Whether to show the transparent/remove option */
  allowTransparent?: boolean;
}

export default function ColorPickerField({
  label,
  value,
  onChange,
  placeholder = 'Transparente',
  defaultColor = '#ffffff',
  allowTransparent = true,
}: Props) {
  const [hexInput, setHexInput] = useState(value || '');
  const [open, setOpen] = useState(false);

  // Sync external value changes
  useEffect(() => {
    setHexInput(value || '');
  }, [value]);

  const handleHexChange = (hex: string) => {
    setHexInput(hex);
    // Auto-apply if it looks like a valid hex
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      onChange(hex);
    }
  };

  const handleHexBlur = () => {
    if (hexInput && !/^#/.test(hexInput)) {
      const withHash = `#${hexInput}`;
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) {
        setHexInput(withHash);
        onChange(withHash);
      }
    }
  };

  const isTransparent = !value || value === 'transparent';

  return (
    <div className="space-y-2">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full h-9 px-2 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors cursor-pointer"
          >
            {/* Color swatch */}
            <div
              className="h-5 w-5 rounded-md border border-border flex-shrink-0 relative overflow-hidden"
              style={{
                backgroundColor: isTransparent ? 'transparent' : value,
              }}
            >
              {isTransparent && (
                <div className="absolute inset-0">
                  {/* Checkerboard pattern for transparent */}
                  <svg width="20" height="20" viewBox="0 0 20 20" className="w-full h-full">
                    <rect width="10" height="10" fill="#e5e7eb" />
                    <rect x="10" y="10" width="10" height="10" fill="#e5e7eb" />
                    <rect x="10" width="10" height="10" fill="#fff" />
                    <rect y="10" width="10" height="10" fill="#fff" />
                  </svg>
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate flex-1 text-left">
              {isTransparent ? placeholder : value}
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
                onClick={() => {
                  onChange(color);
                  setHexInput(color);
                }}
                className={`h-6 w-full rounded-md border transition-all hover:scale-110 ${
                  value === color
                    ? 'border-primary ring-1 ring-primary shadow-sm'
                    : 'border-border/50 hover:border-border'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-md border border-border flex-shrink-0"
              style={{ backgroundColor: isTransparent ? 'transparent' : value }}
            />
            <Input
              value={hexInput}
              onChange={e => handleHexChange(e.target.value)}
              onBlur={handleHexBlur}
              placeholder="#000000"
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Transparent / Remove */}
          {allowTransparent && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 gap-1.5"
              onClick={() => {
                onChange('');
                setHexInput('');
              }}
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
