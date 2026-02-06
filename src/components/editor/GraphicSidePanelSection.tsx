import { useCallback } from 'react';
import { Question, GraphicVariant, ChartType, GraphicDataItem } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const VARIANT_OPTIONS: { value: GraphicVariant; label: string; emoji: string }[] = [
  { value: 'kpis', label: 'Estatísticas / KPIs', emoji: '📊' },
  { value: 'chart', label: 'Gráfico', emoji: '📈' },
  { value: 'timeline', label: 'Timeline', emoji: '📅' },
  { value: 'steps', label: 'Progresso / Steps', emoji: '🔢' },
];

const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Barras' },
  { value: 'pie', label: 'Pizza' },
  { value: 'line', label: 'Linha' },
];

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
}

export default function GraphicSidePanelSection({ question, onChange }: Props) {
  const variant = question.graphicVariant || 'kpis';
  const chartType = question.graphicChartType || 'bar';
  const items = question.graphicData || [];

  const addItem = useCallback(() => {
    const newItem: GraphicDataItem = {
      id: crypto.randomUUID(),
      label: `Item ${items.length + 1}`,
      value: variant === 'timeline' ? '2024-01-01' : '0',
      description: '',
      icon: variant === 'steps' ? '✅' : undefined,
      suffix: variant === 'kpis' ? '' : undefined,
    };
    onChange({ graphicData: [...items, newItem] });
  }, [items, variant, onChange]);

  const updateItem = useCallback((id: string, patch: Partial<GraphicDataItem>) => {
    onChange({
      graphicData: items.map(i => i.id === id ? { ...i, ...patch } : i),
    });
  }, [items, onChange]);

  const removeItem = useCallback((id: string) => {
    onChange({ graphicData: items.filter(i => i.id !== id) });
  }, [items, onChange]);

  const showDescription = variant === 'timeline' || variant === 'steps';
  const showIcon = variant === 'steps' || variant === 'kpis';
  const showSuffix = variant === 'kpis' || variant === 'chart';
  const showColor = variant === 'chart';
  const valueLabel = variant === 'timeline' ? 'Data' : 'Valor';

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tipo de visualização</Label>
        <Select value={variant} onValueChange={(v: GraphicVariant) => onChange({ graphicVariant: v })}>
          <SelectTrigger className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[200] bg-popover">
            {VARIANT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.emoji} {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart type (only for chart variant) */}
      {variant === 'chart' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo de gráfico</Label>
          <div className="flex gap-1.5">
            {CHART_TYPE_OPTIONS.map(ct => (
              <Button
                key={ct.value}
                variant={chartType === ct.value ? 'default' : 'outline'}
                size="sm"
                className="flex-1 text-[11px] h-7"
                onClick={() => onChange({ graphicChartType: ct.value })}
              >
                {ct.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Descrição</Label>
        <Textarea
          value={question.description || ''}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Texto descritivo opcional..."
          className="text-xs"
          rows={2}
        />
      </div>

      {/* Data items */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Dados ({items.length})</Label>

        {items.map((item, idx) => (
          <div key={item.id} className="rounded-lg border border-border p-2.5 space-y-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/60 w-4 text-right">{idx + 1}</span>
              <Input
                value={item.label}
                onChange={e => updateItem(item.id, { label: e.target.value })}
                placeholder="Label"
                className="text-xs flex-1"
              />
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground/70">{valueLabel}</Label>
                <Input
                  value={item.value}
                  onChange={e => updateItem(item.id, { value: e.target.value })}
                  placeholder={variant === 'timeline' ? '2024-01-01' : '0'}
                  className="text-xs"
                />
              </div>

              {showSuffix && (
                <div>
                  <Label className="text-[10px] text-muted-foreground/70">Sufixo</Label>
                  <Input
                    value={item.suffix || ''}
                    onChange={e => updateItem(item.id, { suffix: e.target.value })}
                    placeholder="%, pts..."
                    className="text-xs"
                  />
                </div>
              )}

              {showIcon && (
                <div>
                  <Label className="text-[10px] text-muted-foreground/70">Ícone</Label>
                  <Input
                    value={item.icon || ''}
                    onChange={e => updateItem(item.id, { icon: e.target.value })}
                    placeholder="📊"
                    className="text-xs w-16"
                    maxLength={4}
                  />
                </div>
              )}
            </div>

            {showDescription && (
              <div>
                <Label className="text-[10px] text-muted-foreground/70">Descrição</Label>
                <Input
                  value={item.description || ''}
                  onChange={e => updateItem(item.id, { description: e.target.value })}
                  placeholder="Detalhe..."
                  className="text-xs"
                />
              </div>
            )}

            {showColor && (
              <div className="flex items-center gap-2">
                <Label className="text-[10px] text-muted-foreground/70">Cor</Label>
                <input
                  type="color"
                  value={item.color || '#6366f1'}
                  onChange={e => updateItem(item.id, { color: e.target.value })}
                  className="h-6 w-8 rounded border border-border cursor-pointer"
                />
              </div>
            )}
          </div>
        ))}

        <Button variant="outline" size="sm" className="w-full text-xs border-dashed" onClick={addItem}>
          <Plus className="mr-1 h-3 w-3" />
          Adicionar item
        </Button>
      </div>
    </div>
  );
}
