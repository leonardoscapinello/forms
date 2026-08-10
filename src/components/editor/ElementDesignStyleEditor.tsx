import { useState } from 'react';
import type { PageElement, PageElementStyle } from '@/types/pageElements';
import { PAGE_ELEMENT_LABELS } from '@/types/pageElements';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Paintbrush, ChevronDown, Image, Square, Type, Move, Eclipse, RotateCcw } from 'lucide-react';
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-medium tabular-nums text-foreground/70">{value}{suffix}</span>
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

/** Collapsible section with icon + title + badge for modified state */
function Section({ icon: Icon, title, children, defaultOpen = false, badge }: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-foreground flex-1">{title}</span>
        {badge && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}

export default function ElementDesignStyleEditor({ element, onChange, onDeselect }: Props) {
  const s = element.style || {};

  const updateStyle = (patch: Partial<PageElementStyle>) => {
    onChange({ style: { ...s, ...patch } });
  };

  const elementLabel = PAGE_ELEMENT_LABELS[element.type] || element.type;

  // Detect which sections have modifications
  const hasBg = !!(s.backgroundColor || (s.backgroundOpacity != null && s.backgroundOpacity < 100) || s.backdropBlur);
  const hasBorder = !!(s.borderColor || s.borderWidth || s.borderRadius || (s.borderOpacity != null && s.borderOpacity < 100));
  const hasText = !!(s.color || s.fontSize || s.fontWeight || s.textAlign);
  const hasSpacing = !!(s.padding || s.margin);
  const hasShadow = !!s.boxShadow;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/60">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Paintbrush className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-foreground truncate">{elementLabel}</h3>
          <p className="text-[10px] text-muted-foreground">Estilo individual</p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onDeselect}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Live preview — compact */}
      <div className="flex items-center justify-center p-3 rounded-lg bg-muted/20 border border-border/40 min-h-[56px]">
        <div
          className="px-3 py-2 text-xs transition-all max-w-full truncate"
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
          }}
        >
          {elementLabel}
        </div>
      </div>

      {/* ─── Fundo ─── */}
      <Section icon={Image} title="Fundo" defaultOpen={hasBg} badge={hasBg}>
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
      </Section>

      {/* ─── Borda ─── */}
      <Section icon={Square} title="Borda" badge={hasBorder}>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <ColorPickerField
              label="Cor"
              value={s.borderColor || ''}
              onChange={v => updateStyle({ borderColor: v })}
              defaultColor="#cccccc"
              allowTransparent
            />
          </div>
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
        </div>
        <SliderRow
          label="Arredondamento"
          value={s.borderRadius ?? 0}
          onChange={v => updateStyle({ borderRadius: v })}
          min={0} max={32}
        />
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Estilo</span>
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
      </Section>

      {/* ─── Texto ─── */}
      <Section icon={Type} title="Texto" badge={hasText}>
        <ColorPickerField
          label="Cor"
          value={s.color || ''}
          onChange={v => updateStyle({ color: v })}
          defaultColor="#0A0A0A"
          allowTransparent
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Tamanho</span>
            <Select value={s.fontSize || 'inherit'} onValueChange={v => updateStyle({ fontSize: v === 'inherit' ? undefined : v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit" className="text-xs">Padrão</SelectItem>
                <SelectItem value="12px" className="text-xs">Pequeno</SelectItem>
                <SelectItem value="14px" className="text-xs">Normal</SelectItem>
                <SelectItem value="16px" className="text-xs">Médio</SelectItem>
                <SelectItem value="18px" className="text-xs">Grande</SelectItem>
                <SelectItem value="24px" className="text-xs">Extra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground">Peso</span>
            <Select value={s.fontWeight || 'inherit'} onValueChange={v => updateStyle({ fontWeight: v === 'inherit' ? undefined : v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inherit" className="text-xs">Padrão</SelectItem>
                <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                <SelectItem value="500" className="text-xs">Médio</SelectItem>
                <SelectItem value="600" className="text-xs">Semi</SelectItem>
                <SelectItem value="bold" className="text-xs">Negrito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground">Alinhamento</span>
          <Select value={s.textAlign || 'left'} onValueChange={v => updateStyle({ textAlign: v as any })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">Esquerda</SelectItem>
              <SelectItem value="center" className="text-xs">Centro</SelectItem>
              <SelectItem value="right" className="text-xs">Direita</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      {/* ─── Espaçamento ─── */}
      <Section icon={Move} title="Espaçamento" badge={hasSpacing}>
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
      </Section>

      {/* ─── Sombra ─── */}
      <Section icon={Eclipse} title="Sombra" badge={hasShadow}>
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
      </Section>

      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-[10px] gap-1 text-muted-foreground hover:text-destructive h-7"
        onClick={() => onChange({ style: {} })}
      >
        <RotateCcw className="h-3 w-3" />
        Resetar estilos
      </Button>
    </div>
  );
}
