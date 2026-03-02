import { useState, useCallback, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import ColorPickerField from './ColorPickerField';

export interface GradientStop {
  color: string;
  position: number; // 0-100
  opacity: number;  // 0-100
}

export interface GradientConfig {
  type: 'linear' | 'radial' | 'conic';
  angle: number;       // 0-360 for linear/conic
  radialShape: 'circle' | 'ellipse';
  radialSize: string;  // closest-side, farthest-corner, etc.
  stops: GradientStop[];
}

const GRADIENT_PRESETS = [
  { label: 'Azul suave', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { label: 'Rosa quente', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { label: 'Verde menta', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { label: 'Pôr-do-sol', value: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { label: 'Escuro', value: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)' },
  { label: 'Neutro', value: 'linear-gradient(180deg, #fdfcfb 0%, #e2d1c3 100%)' },
  { label: 'Oceano', value: 'linear-gradient(135deg, #0093E9 0%, #80D0C7 100%)' },
  { label: 'Lavanda', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' },
  { label: 'Fogo', value: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
];

const DEFAULT_CONFIG: GradientConfig = {
  type: 'linear',
  angle: 135,
  radialShape: 'circle',
  radialSize: 'farthest-corner',
  stops: [
    { color: '#667eea', position: 0, opacity: 100 },
    { color: '#764ba2', position: 100, opacity: 100 },
  ],
};

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

function configToCss(config: GradientConfig): string {
  const stopsStr = [...config.stops]
    .sort((a, b) => a.position - b.position)
    .map(s => `${hexToRgba(s.color, s.opacity)} ${s.position}%`)
    .join(', ');

  switch (config.type) {
    case 'radial':
      return `radial-gradient(${config.radialShape} ${config.radialSize}, ${stopsStr})`;
    case 'conic':
      return `conic-gradient(from ${config.angle}deg, ${stopsStr})`;
    default:
      return `linear-gradient(${config.angle}deg, ${stopsStr})`;
  }
}

interface Props {
  value: string;
  onChange: (css: string) => void;
}

export default function GradientEditor({ value, onChange }: Props) {
  const [config, setConfig] = useState<GradientConfig>(DEFAULT_CONFIG);
  const [mode, setMode] = useState<'presets' | 'custom'>(value ? 'custom' : 'presets');

  const updateConfig = useCallback((patch: Partial<GradientConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const updateStop = useCallback((index: number, patch: Partial<GradientStop>) => {
    setConfig(prev => {
      const stops = prev.stops.map((s, i) => i === index ? { ...s, ...patch } : s);
      const next = { ...prev, stops };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const addStop = useCallback(() => {
    setConfig(prev => {
      const sorted = [...prev.stops].sort((a, b) => a.position - b.position);
      // Find midpoint of largest gap
      let maxGap = 0, insertPos = 50;
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].position - sorted[i].position;
        if (gap > maxGap) {
          maxGap = gap;
          insertPos = Math.round(sorted[i].position + gap / 2);
        }
      }
      const stops = [...prev.stops, { color: '#888888', position: insertPos, opacity: 100 }];
      const next = { ...prev, stops };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const removeStop = useCallback((index: number) => {
    setConfig(prev => {
      if (prev.stops.length <= 2) return prev;
      const stops = prev.stops.filter((_, i) => i !== index);
      const next = { ...prev, stops };
      onChange(configToCss(next));
      return next;
    });
  }, [onChange]);

  const cssPreview = useMemo(() => configToCss(config), [config]);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <Button
          variant={mode === 'presets' ? 'default' : 'outline'}
          size="sm" className="flex-1 text-xs h-7"
          onClick={() => setMode('presets')}
        >Predefinidos</Button>
        <Button
          variant={mode === 'custom' ? 'default' : 'outline'}
          size="sm" className="flex-1 text-xs h-7"
          onClick={() => setMode('custom')}
        >Personalizado</Button>
      </div>

      {/* Presets */}
      {mode === 'presets' && (
        <div className="grid grid-cols-3 gap-1.5">
          {GRADIENT_PRESETS.map(preset => (
            <button
              key={preset.label}
              className={`h-8 rounded-md border-2 transition-all ${
                value === preset.value ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-muted-foreground'
              }`}
              style={{ background: preset.value }}
              onClick={() => onChange(preset.value)}
              title={preset.label}
            />
          ))}
        </div>
      )}

      {/* Custom editor */}
      {mode === 'custom' && (
        <div className="space-y-3">
          {/* Gradient type */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tipo</Label>
              <Select value={config.type} onValueChange={v => updateConfig({ type: v as GradientConfig['type'] })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="linear" className="text-xs">Linear</SelectItem>
                  <SelectItem value="radial" className="text-xs">Radial</SelectItem>
                  <SelectItem value="conic" className="text-xs">Cônico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Angle for linear/conic */}
            {(config.type === 'linear' || config.type === 'conic') && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {config.type === 'linear' ? 'Rotação' : 'Início'}
                  </Label>
                  <span className="text-[10px] text-muted-foreground font-mono">{config.angle}°</span>
                </div>
                <Slider
                  value={[config.angle]}
                  onValueChange={([v]) => updateConfig({ angle: v })}
                  min={0} max={360} step={1}
                  className="mt-1.5"
                />
              </div>
            )}

            {/* Radial options */}
            {config.type === 'radial' && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Forma</Label>
                <Select value={config.radialShape} onValueChange={v => updateConfig({ radialShape: v as 'circle' | 'ellipse' })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle" className="text-xs">Círculo</SelectItem>
                    <SelectItem value="ellipse" className="text-xs">Elipse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Radial size */}
          {config.type === 'radial' && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Abertura</Label>
              <Select value={config.radialSize} onValueChange={v => updateConfig({ radialSize: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closest-side" className="text-xs">Lado mais próximo</SelectItem>
                  <SelectItem value="closest-corner" className="text-xs">Canto mais próximo</SelectItem>
                  <SelectItem value="farthest-side" className="text-xs">Lado mais distante</SelectItem>
                  <SelectItem value="farthest-corner" className="text-xs">Canto mais distante</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Color stops */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Cores</Label>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-[10px]" onClick={addStop}>
                <Plus className="h-3 w-3 mr-0.5" />Adicionar
              </Button>
            </div>

            {/* Visual stop bar */}
            <div
              className="h-5 rounded-md border border-border relative cursor-pointer"
              style={{ background: cssPreview }}
            >
              {config.stops.map((stop, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-background shadow-sm cursor-grab"
                  style={{
                    left: `calc(${stop.position}% - 6px)`,
                    backgroundColor: stop.color,
                  }}
                  title={`${stop.position}%`}
                />
              ))}
            </div>

            {/* Stop list */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {config.stops.map((stop, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 p-1.5">
                  {/* Color swatch + picker */}
                  <ColorPickerField
                    value={stop.color}
                    onChange={v => updateStop(i, { color: v || '#000000' })}
                    defaultColor="#000000"
                    allowTransparent={false}
                  />

                  {/* Position */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground">Pos</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{stop.position}%</span>
                    </div>
                    <Slider
                      value={[stop.position]}
                      onValueChange={([v]) => updateStop(i, { position: v })}
                      min={0} max={100} step={1}
                    />
                  </div>

                  {/* Opacity */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted-foreground">Op</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{stop.opacity}%</span>
                    </div>
                    <Slider
                      value={[stop.opacity]}
                      onValueChange={([v]) => updateStop(i, { opacity: v })}
                      min={0} max={100} step={1}
                    />
                  </div>

                  {/* Remove */}
                  <Button
                    variant="ghost" size="sm"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    disabled={config.stops.length <= 2}
                    onClick={() => removeStop(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="h-14 rounded-lg border border-border" style={{ background: cssPreview }} />
        </div>
      )}
    </div>
  );
}
