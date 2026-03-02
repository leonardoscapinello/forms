import { useCallback } from 'react';
import type { FormStyle } from '@/types/form';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Hash, AlignLeft, TextCursorInput, MousePointerClick } from 'lucide-react';
import ColorPickerField from '@/components/editor/shared/ColorPickerField';

interface Props {
  style: FormStyle;
  onChange: (patch: Partial<FormStyle>) => void;
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

export default function QuestionFieldStyleEditor({ style, onChange }: Props) {
  return (
    <div className="space-y-6">

      {/* ─── Número da Pergunta ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Número da pergunta</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Estilo</Label>
            <Select value={style.questionNumberStyle || 'decimal'} onValueChange={v => onChange({ questionNumberStyle: v as any })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="decimal" className="text-xs">Número (1, 2, 3...)</SelectItem>
                <SelectItem value="circle" className="text-xs">Círculo (①, ②, ③...)</SelectItem>
                <SelectItem value="none" className="text-xs">Ocultar número</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(style.questionNumberStyle || 'decimal') !== 'none' && (
            <>
              <ColorPickerField
                label="Cor"
                value={style.questionNumberColor || style.textColor || '#203300'}
                onChange={v => onChange({ questionNumberColor: v })}
                defaultColor={style.textColor || '#203300'}
                allowTransparent
              />
              <SliderRow
                label="Tamanho"
                value={style.questionNumberSize || 14}
                onChange={v => onChange({ questionNumberSize: v })}
                min={10} max={28}
              />
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Peso</Label>
                <Select value={style.questionNumberWeight || 'bold'} onValueChange={v => onChange({ questionNumberWeight: v })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                    <SelectItem value="500" className="text-xs">Médio</SelectItem>
                    <SelectItem value="600" className="text-xs">Semi-negrito</SelectItem>
                    <SelectItem value="bold" className="text-xs">Negrito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ─── Título da Pergunta ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Título da pergunta</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <ColorPickerField
            label="Cor"
            value={style.questionTitleColor || style.textColor || '#203300'}
            onChange={v => onChange({ questionTitleColor: v })}
            defaultColor={style.textColor || '#203300'}
            allowTransparent
          />
          <SliderRow
            label="Tamanho"
            value={style.questionTitleSize || 18}
            onChange={v => onChange({ questionTitleSize: v })}
            min={12} max={36}
          />
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Peso</Label>
            <Select value={style.questionTitleWeight || '600'} onValueChange={v => onChange({ questionTitleWeight: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                <SelectItem value="500" className="text-xs">Médio</SelectItem>
                <SelectItem value="600" className="text-xs">Semi-negrito</SelectItem>
                <SelectItem value="bold" className="text-xs">Negrito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ─── Descrição da Pergunta ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Descrição da pergunta</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <ColorPickerField
            label="Cor"
            value={style.questionDescColor || '#888888'}
            onChange={v => onChange({ questionDescColor: v })}
            defaultColor="#888888"
            allowTransparent
          />
          <SliderRow
            label="Tamanho"
            value={style.questionDescSize || 14}
            onChange={v => onChange({ questionDescSize: v })}
            min={10} max={24}
          />
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Peso</Label>
            <Select value={style.questionDescWeight || 'normal'} onValueChange={v => onChange({ questionDescWeight: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                <SelectItem value="500" className="text-xs">Médio</SelectItem>
                <SelectItem value="600" className="text-xs">Semi-negrito</SelectItem>
                <SelectItem value="bold" className="text-xs">Negrito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ─── Campos / Inputs ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TextCursorInput className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Campos de entrada</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <ColorPickerField
            label="Cor de fundo"
            value={style.fieldBgColor || '#ffffff'}
            onChange={v => onChange({ fieldBgColor: v })}
            defaultColor="#ffffff"
            allowTransparent
          />
          <ColorPickerField
            label="Cor do texto"
            value={style.fieldTextColor || '#203300'}
            onChange={v => onChange({ fieldTextColor: v })}
            defaultColor="#203300"
          />
          <ColorPickerField
            label="Cor do placeholder"
            value={style.fieldPlaceholderColor || '#999999'}
            onChange={v => onChange({ fieldPlaceholderColor: v })}
            defaultColor="#999999"
          />
          <ColorPickerField
            label="Cor da borda"
            value={style.fieldBorderColor || '#cccccc'}
            onChange={v => onChange({ fieldBorderColor: v })}
            defaultColor="#cccccc"
          />
          <ColorPickerField
            label="Borda ao focar"
            value={style.fieldFocusBorderColor || style.primaryColor || '#B3AB86'}
            onChange={v => onChange({ fieldFocusBorderColor: v })}
            defaultColor={style.primaryColor || '#B3AB86'}
          />
          <SliderRow
            label="Espessura da borda"
            value={style.fieldBorderWidth ?? 1}
            onChange={v => onChange({ fieldBorderWidth: v })}
            min={0} max={4}
          />
          <SliderRow
            label="Arredondamento"
            value={style.fieldBorderRadius ?? 8}
            onChange={v => onChange({ fieldBorderRadius: v })}
            min={0} max={24}
          />
          <SliderRow
            label="Altura do campo"
            value={style.fieldHeight ?? 44}
            onChange={v => onChange({ fieldHeight: v })}
            min={32} max={64}
          />

        </div>
      </div>



      {/* ─── Botão de Avançar ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Botão de avançar</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <ColorPickerField
            label="Cor de fundo"
            value={style.buttonBgColor || style.primaryColor || '#B3AB86'}
            onChange={v => onChange({ buttonBgColor: v })}
            defaultColor={style.primaryColor || '#B3AB86'}
          />
          <ColorPickerField
            label="Cor do texto"
            value={style.buttonTextColor || '#ffffff'}
            onChange={v => onChange({ buttonTextColor: v })}
            defaultColor="#ffffff"
          />
          <SliderRow
            label="Arredondamento"
            value={style.buttonBorderRadius ?? 8}
            onChange={v => onChange({ buttonBorderRadius: v })}
            min={0} max={32}
          />
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Tamanho</Label>
            <Select value={style.buttonSize || 'md'} onValueChange={v => onChange({ buttonSize: v as any })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sm" className="text-xs">Pequeno</SelectItem>
                <SelectItem value="md" className="text-xs">Médio</SelectItem>
                <SelectItem value="lg" className="text-xs">Grande</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ─── Botão de Retornar ─── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Botão de retornar</h3>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <ColorPickerField
            label="Cor de fundo"
            value={style.backButtonBgColor || 'transparent'}
            onChange={v => onChange({ backButtonBgColor: v })}
            defaultColor="transparent"
            allowTransparent
          />
          <ColorPickerField
            label="Cor do texto"
            value={style.backButtonTextColor || '#888888'}
            onChange={v => onChange({ backButtonTextColor: v })}
            defaultColor="#888888"
          />
          <ColorPickerField
            label="Cor da borda"
            value={style.backButtonBorderColor || 'transparent'}
            onChange={v => onChange({ backButtonBorderColor: v })}
            defaultColor="transparent"
            allowTransparent
          />
          <SliderRow
            label="Espessura da borda"
            value={style.backButtonBorderWidth ?? 0}
            onChange={v => onChange({ backButtonBorderWidth: v })}
            min={0} max={4}
          />
          <SliderRow
            label="Arredondamento"
            value={style.backButtonBorderRadius ?? 9999}
            onChange={v => onChange({ backButtonBorderRadius: v })}
            min={0} max={32}
          />
        </div>
      </div>
    </div>
  );
}
