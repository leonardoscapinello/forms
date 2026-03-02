import type { PageElement, PageElementStyle } from '@/types/pageElements';
import { PAGE_ELEMENT_LABELS } from '@/types/pageElements';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Paintbrush } from 'lucide-react';
import ColorPickerField from '@/components/editor/shared/ColorPickerField';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onDeselect: () => void;
}

function SliderRow({ label, value, onChange, min, max, step = 1, suffix = 'px' }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{value}{suffix}</span>
      </div>
      <Slider value={[value]} onValueChange={([v]) => onChange(v)} min={min} max={max} step={step} />
    </div>
  );
}

function hexToRgba(hex: string, opacity: number): string {
  if (!hex || !hex.startsWith('#')) return hex || 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

export default function ElementDesignStyleEditor({ element, onChange, onDeselect }: Props) {
  const s = element.style || {};

  const updateStyle = (patch: Partial<PageElementStyle>) => {
    onChange({ style: { ...s, ...patch } });
  };

  const elementLabel = PAGE_ELEMENT_LABELS[element.type] || element.type;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paintbrush className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Estilo do elemento</h3>
            <p className="text-[10px] text-muted-foreground">{elementLabel}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDeselect}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ─── Fundo ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold text-foreground">Fundo</Label>
        <ColorPickerField
          label="Cor"
          value={s.backgroundColor || ''}
          onChange={v => updateStyle({ backgroundColor: v })}
          defaultColor="#ffffff"
          allowTransparent
        />
        <SliderRow
          label="Opacidade"
          value={s.backgroundOpacity ?? 100}
          onChange={v => updateStyle({ backgroundOpacity: v })}
          min={0} max={100} suffix="%"
        />
        <SliderRow
          label="Desfoque (blur)"
          value={s.backdropBlur ?? 0}
          onChange={v => updateStyle({ backdropBlur: v })}
          min={0} max={40}
        />
      </div>

      {/* ─── Borda ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold text-foreground">Borda</Label>
        <ColorPickerField
          label="Cor"
          value={s.borderColor || ''}
          onChange={v => updateStyle({ borderColor: v })}
          defaultColor="#cccccc"
          allowTransparent
        />
        <SliderRow
          label="Opacidade"
          value={s.borderOpacity ?? 100}
          onChange={v => updateStyle({ borderOpacity: v })}
          min={0} max={100} suffix="%"
        />
        <SliderRow
          label="Espessura"
          value={s.borderWidth ?? 0}
          onChange={v => updateStyle({ borderWidth: v })}
          min={0} max={6}
        />
        <SliderRow
          label="Arredondamento"
          value={s.borderRadius ?? 0}
          onChange={v => updateStyle({ borderRadius: v })}
          min={0} max={32}
        />
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Estilo</Label>
          <Select value={s.borderStyle || 'solid'} onValueChange={v => updateStyle({ borderStyle: v as any })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="solid" className="text-xs">Sólida</SelectItem>
              <SelectItem value="dashed" className="text-xs">Tracejada</SelectItem>
              <SelectItem value="dotted" className="text-xs">Pontilhada</SelectItem>
              <SelectItem value="none" className="text-xs">Sem borda</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Texto ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold text-foreground">Texto</Label>
        <ColorPickerField
          label="Cor"
          value={s.color || ''}
          onChange={v => updateStyle({ color: v })}
          defaultColor="#203300"
          allowTransparent
        />
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tamanho</Label>
          <Select value={s.fontSize || 'inherit'} onValueChange={v => updateStyle({ fontSize: v === 'inherit' ? undefined : v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit" className="text-xs">Padrão</SelectItem>
              <SelectItem value="12px" className="text-xs">Pequeno</SelectItem>
              <SelectItem value="14px" className="text-xs">Normal</SelectItem>
              <SelectItem value="16px" className="text-xs">Médio</SelectItem>
              <SelectItem value="18px" className="text-xs">Grande</SelectItem>
              <SelectItem value="24px" className="text-xs">Extra grande</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Peso</Label>
          <Select value={s.fontWeight || 'inherit'} onValueChange={v => updateStyle({ fontWeight: v === 'inherit' ? undefined : v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit" className="text-xs">Padrão</SelectItem>
              <SelectItem value="normal" className="text-xs">Normal</SelectItem>
              <SelectItem value="500" className="text-xs">Médio</SelectItem>
              <SelectItem value="600" className="text-xs">Semi-negrito</SelectItem>
              <SelectItem value="bold" className="text-xs">Negrito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Alinhamento</Label>
          <Select value={s.textAlign || 'left'} onValueChange={v => updateStyle({ textAlign: v as any })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">Esquerda</SelectItem>
              <SelectItem value="center" className="text-xs">Centro</SelectItem>
              <SelectItem value="right" className="text-xs">Direita</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Espaçamento ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold text-foreground">Espaçamento</Label>
        <SliderRow
          label="Padding"
          value={s.padding ?? 0}
          onChange={v => updateStyle({ padding: v })}
          min={0} max={64}
        />
        <SliderRow
          label="Margem"
          value={s.margin ?? 0}
          onChange={v => updateStyle({ margin: v })}
          min={0} max={64}
        />
      </div>

      {/* ─── Sombra ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <Label className="text-xs font-semibold text-foreground">Sombra</Label>
        <Select value={s.boxShadow || 'none'} onValueChange={v => updateStyle({ boxShadow: v === 'none' ? undefined : v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-xs">Nenhuma</SelectItem>
            <SelectItem value="0 1px 3px rgba(0,0,0,0.1)" className="text-xs">Sutil</SelectItem>
            <SelectItem value="0 4px 12px rgba(0,0,0,0.1)" className="text-xs">Média</SelectItem>
            <SelectItem value="0 8px 24px rgba(0,0,0,0.15)" className="text-xs">Grande</SelectItem>
            <SelectItem value="0 16px 48px rgba(0,0,0,0.2)" className="text-xs">Extra grande</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Preview ─── */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <Label className="text-xs font-semibold text-foreground">Preview</Label>
        <div className="flex items-center justify-center p-4 rounded-lg bg-muted/30 border border-border min-h-[80px]">
          <div
            className="px-4 py-3 text-sm transition-all"
            style={{
              backgroundColor: s.backgroundColor
                ? hexToRgba(s.backgroundColor, s.backgroundOpacity ?? 100)
                : undefined,
              borderWidth: s.borderWidth ?? 0,
              borderColor: s.borderColor
                ? hexToRgba(s.borderColor, s.borderOpacity ?? 100)
                : undefined,
              borderStyle: s.borderStyle || 'solid',
              borderRadius: s.borderRadius ?? 0,
              color: s.color || undefined,
              fontSize: s.fontSize || undefined,
              fontWeight: s.fontWeight || undefined,
              textAlign: s.textAlign || undefined,
              backdropFilter: s.backdropBlur ? `blur(${s.backdropBlur}px)` : undefined,
              WebkitBackdropFilter: s.backdropBlur ? `blur(${s.backdropBlur}px)` : undefined,
              boxShadow: s.boxShadow || undefined,
              padding: s.padding ?? undefined,
              margin: s.margin ?? undefined,
            }}
          >
            {elementLabel}
          </div>
        </div>
      </div>

      {/* Reset */}
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs gap-1.5"
        onClick={() => onChange({ style: {} })}
      >
        <X className="h-3 w-3" />
        Resetar estilos do elemento
      </Button>
    </div>
  );
}
