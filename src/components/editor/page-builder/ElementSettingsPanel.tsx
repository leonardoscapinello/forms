import { PageElement, PAGE_ELEMENT_LABELS } from '@/types/pageElements';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onClose: () => void;
}

export default function ElementSettingsPanel({ element, onChange, onClose }: Props) {
  const updateStyle = (patch: Record<string, any>) => {
    onChange({ style: { ...element.style, ...patch } });
  };

  return (
    <div className="w-72 border-l border-border bg-card flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold">{PAGE_ELEMENT_LABELS[element.type]}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Content */}
          {(element.type === 'heading' || element.type === 'text' || element.type === 'button') && (
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              {element.type === 'text' ? (
                <Textarea
                  value={element.content || ''}
                  onChange={e => onChange({ content: e.target.value })}
                  rows={4}
                />
              ) : (
                <Input
                  value={element.content || ''}
                  onChange={e => onChange({ content: e.target.value })}
                />
              )}
            </div>
          )}

          {/* Heading level */}
          {element.type === 'heading' && (
            <div className="space-y-2">
              <Label>Nível</Label>
              <Select
                value={String(element.level || 2)}
                onValueChange={v => onChange({ level: Number(v) as 1 | 2 | 3 | 4 })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">H1 — Grande</SelectItem>
                  <SelectItem value="2">H2 — Médio</SelectItem>
                  <SelectItem value="3">H3 — Pequeno</SelectItem>
                  <SelectItem value="4">H4 — Muito pequeno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Image / Video URL */}
          {(element.type === 'image' || element.type === 'video') && (
            <div className="space-y-2">
              <Label>{element.type === 'image' ? 'URL da imagem' : 'URL do vídeo'}</Label>
              <Input
                value={element.src || ''}
                onChange={e => onChange({ src: e.target.value })}
                placeholder={element.type === 'image' ? 'https://...' : 'https://youtube.com/...'}
              />
            </div>
          )}

          {/* Image alt */}
          {element.type === 'image' && (
            <div className="space-y-2">
              <Label>Texto alternativo</Label>
              <Input
                value={element.alt || ''}
                onChange={e => onChange({ alt: e.target.value })}
                placeholder="Descrição da imagem"
              />
            </div>
          )}

          {/* Button link */}
          {element.type === 'button' && (
            <div className="space-y-2">
              <Label>Link (opcional)</Label>
              <Input
                value={element.href || ''}
                onChange={e => onChange({ href: e.target.value })}
                placeholder="https://..."
              />
            </div>
          )}

          {/* Spacer height */}
          {element.type === 'spacer' && (
            <div className="space-y-2">
              <Label>Altura ({element.height || 40}px)</Label>
              <Slider
                value={[element.height || 40]}
                onValueChange={([v]) => onChange({ height: v })}
                min={8}
                max={200}
                step={4}
              />
            </div>
          )}

          {/* Divider thickness */}
          {element.type === 'divider' && (
            <div className="space-y-2">
              <Label>Espessura ({element.height || 1}px)</Label>
              <Slider
                value={[element.height || 1]}
                onValueChange={([v]) => onChange({ height: v })}
                min={1}
                max={8}
                step={1}
              />
            </div>
          )}

          {/* --- Style Section --- */}
          <div className="pt-3 border-t border-border space-y-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estilo</h4>

            {/* Text align */}
            {['heading', 'text', 'button'].includes(element.type) && (
              <div className="space-y-2">
                <Label>Alinhamento</Label>
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map(a => (
                    <Button
                      key={a}
                      variant={element.style?.textAlign === a ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => updateStyle({ textAlign: a })}
                    >
                      {a === 'left' ? '◀' : a === 'center' ? '◆' : '▶'}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Background color for button */}
            {element.type === 'button' && (
              <div className="space-y-2">
                <Label>Cor do botão</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={element.style?.backgroundColor || '#6366f1'}
                    onChange={e => updateStyle({ backgroundColor: e.target.value })}
                    className="h-8 w-8 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={element.style?.backgroundColor || ''}
                    onChange={e => updateStyle({ backgroundColor: e.target.value })}
                    placeholder="#6366f1"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {/* Border radius */}
            {['image', 'button'].includes(element.type) && (
              <div className="space-y-2">
                <Label>Borda arredondada ({element.style?.borderRadius || 8}px)</Label>
                <Slider
                  value={[element.style?.borderRadius || 8]}
                  onValueChange={([v]) => updateStyle({ borderRadius: v })}
                  min={0}
                  max={32}
                  step={2}
                />
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
