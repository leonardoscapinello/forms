import { FunnelPageStyle } from '@/types/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Palette, AlignVerticalSpaceAround, Move } from 'lucide-react';
import { TypographySelector } from '@/components/editor/shared';
import { FONT_OPTIONS } from '@/components/editor/shared/TypographySelector';

interface Props {
  pageStyle: FunnelPageStyle;
  onChange: (patch: Partial<FunnelPageStyle>) => void;
}

// FONT_OPTIONS now imported from shared TypographySelector

const BG_PRESETS = [
  { value: '', label: 'Padrão' },
  { value: '#FFFFFF', label: 'Branco' },
  { value: '#FAFAF8', label: 'Warm White' },
  { value: '#F5F5F4', label: 'Stone 100' },
  { value: '#F0EDE8', label: 'Bege' },
  { value: '#1A1A2E', label: 'Dark Navy' },
  { value: '#0F172A', label: 'Slate 900' },
  { value: '#18181B', label: 'Zinc 900' },
];

export default function PageGeneralSettings({ pageStyle, onChange }: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold">Estilo Global</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Background Color */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Palette className="h-4 w-4 text-muted-foreground" />
              Cor de fundo
            </div>
            <div className="grid grid-cols-4 gap-2">
              {BG_PRESETS.map(preset => (
                <button
                  key={preset.value || 'default'}
                  onClick={() => onChange({ backgroundColor: preset.value })}
                  className={`group relative h-10 rounded-lg border-2 transition-all ${
                    (pageStyle.backgroundColor || '') === preset.value
                      ? 'border-primary shadow-sm'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                  style={{
                    backgroundColor: preset.value || 'hsl(var(--background))',
                  }}
                  title={preset.label}
                >
                  {(pageStyle.backgroundColor || '') === preset.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-md border border-border flex-shrink-0"
                style={{ backgroundColor: pageStyle.backgroundColor || 'hsl(var(--background))' }}
              />
              <Input
                value={pageStyle.backgroundColor || ''}
                onChange={e => onChange({ backgroundColor: e.target.value })}
                placeholder="Cor personalizada (#hex)"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-3">
            <TypographySelector
              label="Tipografia"
              fontFamily={pageStyle.fontFamily || 'Inter'}
              onFontFamilyChange={v => onChange({ fontFamily: v || 'Inter' })}
              fontWeight={undefined}
              onFontWeightChange={() => {}}
            />
            <p className="text-xs text-muted-foreground">
              Fonte aplicada a todas as páginas do formulário
            </p>
          </div>

          {/* Gap between elements */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlignVerticalSpaceAround className="h-4 w-4 text-muted-foreground" />
                Espaçamento entre elementos
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {pageStyle.gap ?? 32}px
              </span>
            </div>
            <Slider
              value={[pageStyle.gap ?? 32]}
              onValueChange={([v]) => onChange({ gap: v })}
              min={0}
              max={80}
              step={4}
            />
          </div>

          {/* Padding */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Move className="h-4 w-4 text-muted-foreground" />
              Espaçamento interno
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Horizontal</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {pageStyle.paddingX ?? 24}px
                </span>
              </div>
              <Slider
                value={[pageStyle.paddingX ?? 24]}
                onValueChange={([v]) => onChange({ paddingX: v })}
                min={0}
                max={80}
                step={4}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Vertical</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {pageStyle.paddingY ?? 32}px
                </span>
              </div>
              <Slider
                value={[pageStyle.paddingY ?? 32]}
                onValueChange={([v]) => onChange({ paddingY: v })}
                min={0}
                max={80}
                step={4}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
