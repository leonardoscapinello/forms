import { ChartType, GraphicDataItem, ChartStyle } from '@/types/form';
import { motion } from 'framer-motion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

const COLOR_SCHEMES: { name: string; label: string; colors: string[] }[] = [
  { name: 'vivid', label: 'Vívido', colors: ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'] },
  { name: 'pastel', label: 'Pastel', colors: ['#c4b5fd', '#93c5fd', '#67e8f9', '#6ee7b7', '#fde68a', '#fca5a5'] },
  { name: 'warm', label: 'Quente', colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e'] },
  { name: 'cool', label: 'Frio', colors: ['#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'] },
  { name: 'earth', label: 'Terra', colors: ['#92400e', '#b45309', '#a16207', '#4d7c0f', '#166534', '#1e3a5f'] },
  { name: 'mono', label: 'Monocromático', colors: ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0'] },
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
              className={`flex flex-col gap-1.5 p-2.5 rounded-xl border-2 transition-colors ${
                style.colorScheme === scheme.name
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex gap-0.5">
                {scheme.colors.slice(0, 6).map((c, i) => (
                  <div key={i} className="flex-1 h-4 rounded-sm first:rounded-l-md last:rounded-r-md" style={{ backgroundColor: c }} />
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

        {!isGauge && (
          <div className="flex items-center justify-between">
            <Label className="text-xs">Grade</Label>
            <Switch
              checked={style.showGrid !== false}
              onCheckedChange={v => onChange({ ...style, showGrid: v })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-xs">Labels</Label>
          <Switch
            checked={style.showLabels !== false}
            onCheckedChange={v => onChange({ ...style, showLabels: v })}
          />
        </div>

        {!isGauge && (
          <div className="flex items-center justify-between">
            <Label className="text-xs">Legenda</Label>
            <Switch
              checked={style.showLegend === true}
              onCheckedChange={v => onChange({ ...style, showLegend: v })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <Label className="text-xs">Valores</Label>
          <Switch
            checked={style.showValues !== false}
            onCheckedChange={v => onChange({ ...style, showValues: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Animação</Label>
          <Switch
            checked={style.animated !== false}
            onCheckedChange={v => onChange({ ...style, animated: v })}
          />
        </div>
      </div>

      {/* Donut inner radius */}
      {isPie && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground font-medium">Raio interno (donut)</Label>
            <span className="text-[10px] text-muted-foreground font-mono">{style.innerRadius ?? 45}%</span>
          </div>
          <Slider
            value={[style.innerRadius ?? 45]}
            onValueChange={([v]) => onChange({ ...style, innerRadius: v })}
            min={0}
            max={80}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>Pizza</span>
            <span>Donut</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { COLOR_SCHEMES };
