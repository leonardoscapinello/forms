import { ChartType, GraphicDataItem, ChartStyle, ChartBoxStyle } from '@/types/form';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

const COLOR_SCHEMES: { name: string; label: string; colors: string[] }[] = [
  { name: 'vivid', label: 'Vívido', colors: ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'] },
  { name: 'pastel', label: 'Pastel', colors: ['#c4b5fd', '#93c5fd', '#67e8f9', '#6ee7b7', '#fde68a', '#fca5a5'] },
  { name: 'warm', label: 'Quente', colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e'] },
  { name: 'cool', label: 'Frio', colors: ['#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'] },
  { name: 'earth', label: 'Terra', colors: ['#92400e', '#b45309', '#a16207', '#4d7c0f', '#166534', '#1e3a5f'] },
  { name: 'mono', label: 'Monocromático', colors: ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'] },
  { name: 'neon', label: 'Neon', colors: ['#f43f5e', '#a855f7', '#06b6d4', '#22c55e', '#facc15', '#fb923c'] },
  { name: 'ocean', label: 'Oceano', colors: ['#0c4a6e', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'] },
];

interface Props {
  style: ChartStyle;
  chartType: ChartType;
  items: GraphicDataItem[];
  onChange: (style: ChartStyle) => void;
  onItemsChange: (items: GraphicDataItem[]) => void;
}

export default function ChartStylePanel({ style, chartType, items, onChange, onItemsChange }: Props) {
  const isPie = chartType === 'pie';
  const isGauge = chartType === 'thermometer' || chartType === 'speedometer';
  const hasGrid = !isGauge && chartType !== 'treemap' && chartType !== 'funnel' && chartType !== 'radialBar';

  const box = style.box || {};
  const updateBox = (patch: Partial<ChartBoxStyle>) => {
    onChange({ ...style, box: { ...box, ...patch } });
  };

  const applyScheme = (scheme: typeof COLOR_SCHEMES[0]) => {
    const updated = items.map((item, i) => ({
      ...item,
      color: scheme.colors[i % scheme.colors.length],
    }));
    onItemsChange(updated);
    onChange({ ...style, colorScheme: scheme.name });
  };

  return (
    <div className="space-y-5">
      {/* Color Schemes */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground font-medium">Paleta de cores</Label>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_SCHEMES.map(scheme => (
            <motion.button
              key={scheme.name}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => applyScheme(scheme)}
              className={`flex flex-col gap-1.5 p-2.5 rounded-xl border-2 transition-all ${
                style.colorScheme === scheme.name
                  ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex gap-0.5 h-3.5">
                {scheme.colors.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex-1 rounded-sm first:rounded-l-md last:rounded-r-md" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-[10px] font-medium text-foreground">{scheme.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Toggle options */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground font-medium">Aparência</Label>

        {hasGrid && (
          <ToggleRow label="Grade" checked={style.showGrid !== false} onChange={v => onChange({ ...style, showGrid: v })} />
        )}
        <ToggleRow label="Labels" checked={style.showLabels !== false} onChange={v => onChange({ ...style, showLabels: v })} />
        {!isGauge && chartType !== 'treemap' && (
          <ToggleRow label="Legenda" checked={style.showLegend === true} onChange={v => onChange({ ...style, showLegend: v })} />
        )}
        <ToggleRow label="Valores" checked={style.showValues !== false} onChange={v => onChange({ ...style, showValues: v })} />
        <ToggleRow label="Animação" checked={style.animated !== false} onChange={v => onChange({ ...style, animated: v })} />
      </div>

      {/* Donut inner radius */}
      {isPie && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground font-medium">Raio interno (donut)</Label>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
              {style.innerRadius ?? 45}%
            </span>
          </div>
          <Slider
            value={[style.innerRadius ?? 45]}
            onValueChange={([v]) => onChange({ ...style, innerRadius: v })}
            min={0} max={80} step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Pizza</span>
            <span>Donut</span>
          </div>
        </div>
      )}

      {/* Box / Container */}
      <div className="space-y-3">
        <Label className="text-xs text-muted-foreground font-medium">Container (Box)</Label>

        <SliderRow label="Padding" value={box.padding ?? 24} min={0} max={64} step={4} suffix="px"
          onChange={v => updateBox({ padding: v })} />
        <SliderRow label="Margem" value={box.margin ?? 0} min={0} max={48} step={4} suffix="px"
          onChange={v => updateBox({ margin: v })} />
        <SliderRow label="Borda" value={box.borderWidth ?? 1} min={0} max={6} step={1} suffix="px"
          onChange={v => updateBox({ borderWidth: v })} />
        <SliderRow label="Arredondamento" value={box.borderRadius ?? 16} min={0} max={32} step={2} suffix="px"
          onChange={v => updateBox({ borderRadius: v })} />

        <div className="flex items-center justify-between">
          <Label className="text-xs">Cor da borda</Label>
          <input type="color" value={box.borderColor || '#e2e8f0'}
            onChange={e => updateBox({ borderColor: e.target.value })}
            className="h-7 w-10 rounded border border-border cursor-pointer" />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Fundo</Label>
          <input type="color" value={box.backgroundColor || '#ffffff'}
            onChange={e => updateBox({ backgroundColor: e.target.value })}
            className="h-7 w-10 rounded border border-border cursor-pointer" />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
          {value}{suffix}
        </span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} className="w-full" />
    </div>
  );
}

export { COLOR_SCHEMES };
