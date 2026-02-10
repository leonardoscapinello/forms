import { PageElement, PAGE_ELEMENT_LABELS, SelectOption } from '@/types/pageElements';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { X, Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onClose: () => void;
}

const isFormField = (type: string) => type.startsWith('input_');

export default function ElementSettingsPanel({ element, onChange, onClose }: Props) {
  const updateStyle = (patch: Record<string, any>) => {
    onChange({ style: { ...element.style, ...patch } });
  };

  const addOption = () => {
    const opts = [...(element.options || [])];
    const isIcon = element.type === 'input_quiz_icon';
    const isImage = element.type === 'input_quiz_image';
    opts.push({
      id: crypto.randomUUID(),
      label: `Opção ${opts.length + 1}`,
      ...(isIcon ? { emoji: '⭐' } : {}),
      ...(isImage ? { imageUrl: '' } : {}),
    });
    onChange({ options: opts });
  };

  const updateOption = (id: string, label: string) => {
    const opts = (element.options || []).map(o => o.id === id ? { ...o, label } : o);
    onChange({ options: opts });
  };

  const updateOptionField = (id: string, field: string, value: string) => {
    const parsed = field === 'score' ? (value === '' ? undefined : Number(value)) : value;
    const opts = (element.options || []).map(o => o.id === id ? { ...o, [field]: parsed } : o);
    onChange({ options: opts });
  };

  const removeOption = (id: string) => {
    onChange({ options: (element.options || []).filter(o => o.id !== id) });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold">{PAGE_ELEMENT_LABELS[element.type]}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* ─── Form field: label (enunciado) ─── */}
          {isFormField(element.type) && (
            <div className="space-y-2">
              <Label>Enunciado</Label>
              <Input
                value={element.label || ''}
                onChange={e => onChange({ label: e.target.value })}
                placeholder="Pergunta ou instrução"
              />
            </div>
          )}

          {/* ─── Form field: description ─── */}
          {isFormField(element.type) && (
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={element.description || ''}
                onChange={e => onChange({ description: e.target.value })}
                placeholder="Texto de apoio..."
                rows={2}
              />
            </div>
          )}

          {/* ─── Form field: placeholder ─── */}
          {['input_text', 'input_email', 'input_phone', 'input_address', 'input_select', 'input_number', 'input_textarea', 'input_date', 'input_height', 'input_weight'].includes(element.type) && (
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <Input
                value={element.placeholder || ''}
                onChange={e => onChange({ placeholder: e.target.value })}
              />
            </div>
          )}

          {/* ─── Form field: required ─── */}
          {isFormField(element.type) && (
            <div className="flex items-center justify-between">
              <Label>Obrigatório</Label>
              <Switch
                checked={element.required || false}
                onCheckedChange={v => onChange({ required: v })}
              />
            </div>
          )}

          {/* ─── Form field: default value ─── */}
          {isFormField(element.type) && !['input_height', 'input_weight', 'input_checkbox', 'input_rating'].includes(element.type) && (
            <div className="space-y-2">
              <Label>Valor pré-definido</Label>
              <Input
                value={element.defaultValue ?? ''}
                onChange={e => onChange({ defaultValue: e.target.value || undefined })}
                placeholder="Deixe vazio para não preencher"
              />
              <p className="text-xs text-muted-foreground">
                Valor que aparecerá preenchido ao abrir o formulário
              </p>
            </div>
          )}
          {element.type === 'input_checkbox' && (
            <div className="flex items-center justify-between">
              <Label>Pré-marcado</Label>
              <Switch
                checked={element.defaultValue === true}
                onCheckedChange={v => onChange({ defaultValue: v || undefined })}
              />
            </div>
          )}
          {element.type === 'input_rating' && (
            <div className="space-y-2">
              <Label>Avaliação pré-definida</Label>
              <Input
                type="number"
                value={element.defaultValue ?? ''}
                onChange={e => onChange({ defaultValue: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="0"
                min={0}
                max={element.maxRating || 5}
              />
            </div>
          )}

          {element.type === 'input_email' && (
            <div className="flex items-center justify-between">
              <div>
                <Label>Validação inteligente</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verifica em tempo real se o e-mail é válido e pode receber mensagens
                </p>
              </div>
              <Switch
                checked={element.smartValidation || false}
                onCheckedChange={v => onChange({ smartValidation: v, ...(v ? { required: true } : {}) })}
              />
            </div>
          )}

          {/* ─── Phone: default DDI ─── */}
          {element.type === 'input_phone' && (
            <div className="space-y-2">
              <Label>DDI padrão</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                País pré-selecionado ao abrir o campo
              </p>
              <Select
                value={element.defaultCountryCode || 'BR'}
                onValueChange={v => onChange({ defaultCountryCode: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BR">🇧🇷 Brasil (+55)</SelectItem>
                  <SelectItem value="US">🇺🇸 Estados Unidos (+1)</SelectItem>
                  <SelectItem value="PT">🇵🇹 Portugal (+351)</SelectItem>
                  <SelectItem value="AR">🇦🇷 Argentina (+54)</SelectItem>
                  <SelectItem value="CL">🇨🇱 Chile (+56)</SelectItem>
                  <SelectItem value="CO">🇨🇴 Colômbia (+57)</SelectItem>
                  <SelectItem value="MX">🇲🇽 México (+52)</SelectItem>
                  <SelectItem value="UY">🇺🇾 Uruguai (+598)</SelectItem>
                  <SelectItem value="PY">🇵🇾 Paraguai (+595)</SelectItem>
                  <SelectItem value="PE">🇵🇪 Peru (+51)</SelectItem>
                  <SelectItem value="GB">🇬🇧 Reino Unido (+44)</SelectItem>
                  <SelectItem value="DE">🇩🇪 Alemanha (+49)</SelectItem>
                  <SelectItem value="FR">🇫🇷 França (+33)</SelectItem>
                  <SelectItem value="ES">🇪🇸 Espanha (+34)</SelectItem>
                  <SelectItem value="IT">🇮🇹 Itália (+39)</SelectItem>
                  <SelectItem value="JP">🇯🇵 Japão (+81)</SelectItem>
                  <SelectItem value="CN">🇨🇳 China (+86)</SelectItem>
                  <SelectItem value="IN">🇮🇳 Índia (+91)</SelectItem>
                  <SelectItem value="AU">🇦🇺 Austrália (+61)</SelectItem>
                  <SelectItem value="CA">🇨🇦 Canadá (+1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ─── Height/Weight settings ─── */}
          {(element.type === 'input_height' || element.type === 'input_weight') && (
            <>
              <div className="space-y-2">
                <Label>Unidade padrão</Label>
                <Select
                  value={element.unit || (element.type === 'input_height' ? 'cm' : 'kg')}
                  onValueChange={v => onChange({ unit: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {element.type === 'input_height' ? (
                      <>
                        <SelectItem value="cm">Centímetros (cm)</SelectItem>
                        <SelectItem value="pol">Polegadas (pol)</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="kg">Quilogramas (kg)</SelectItem>
                        <SelectItem value="lb">Libras (lb)</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Permitir trocar unidade</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {element.type === 'input_height' ? 'Usuário pode alternar entre cm e pol' : 'Usuário pode alternar entre kg e lb'}
                  </p>
                </div>
                <Switch
                  checked={element.allowUnitToggle !== false}
                  onCheckedChange={v => onChange({ allowUnitToggle: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>Valor padrão</Label>
                <Input
                  type="number"
                  value={element.defaultValue ?? ''}
                  onChange={e => onChange({ defaultValue: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder={element.type === 'input_height' ? '170' : '70'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Mínimo</Label>
                  <Input
                    type="number"
                    value={element.min ?? ''}
                    onChange={e => onChange({ min: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder={element.type === 'input_height' ? '100' : '20'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Máximo</Label>
                  <Input
                    type="number"
                    value={element.max ?? ''}
                    onChange={e => onChange({ max: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder={element.type === 'input_height' ? '250' : '250'}
                  />
                </div>
              </div>
            </>
          )}

          {/* ─── Options (select, radio, multi_select, quiz_icon, quiz_image) ─── */}
          {(['input_select', 'input_radio', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'] as string[]).includes(element.type) && (
            <div className="space-y-2">
              <Label>Opções</Label>
              <div className="space-y-2">
                {(element.options || []).map((opt) => (
                  <div key={opt.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                    <div className="flex items-center gap-1.5">
                      {element.type === 'input_quiz_icon' && (
                        <Input
                          value={opt.emoji || ''}
                          onChange={e => updateOptionField(opt.id, 'emoji', e.target.value)}
                          className="h-8 w-14 text-center text-lg"
                          placeholder="🎯"
                        />
                      )}
                      <Input
                        value={opt.label}
                        onChange={e => updateOption(opt.id, e.target.value)}
                        className="h-8 text-sm flex-1"
                        placeholder="Texto da opção"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeOption(opt.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {element.type === 'input_quiz_image' && (
                      <Input
                        value={opt.imageUrl || ''}
                        onChange={e => updateOptionField(opt.id, 'imageUrl', e.target.value)}
                        className="h-8 text-xs"
                        placeholder="URL da imagem..."
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Pontos</Label>
                      <Input
                        type="number"
                        value={opt.score ?? ''}
                        onChange={e => updateOptionField(opt.id, 'score', e.target.value ? String(Number(e.target.value)) : '')}
                        className="h-7 text-xs w-20"
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar opção
                </Button>
              </div>
            </div>
          )}

          {/* ─── Yes/No score ─── */}
          {element.type === 'input_yes_no' && (
            <div className="space-y-2">
              <Label>Pontuação</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Sim</Label>
                  <Input
                    type="number"
                    value={element.yesScore ?? ''}
                    onChange={e => onChange({ yesScore: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Não</Label>
                  <Input
                    type="number"
                    value={element.noScore ?? ''}
                    onChange={e => onChange({ noScore: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── Rating count ─── */}
          {element.type === 'input_rating' && (
            <div className="space-y-2">
              <Label>Estrelas ({element.maxRating || 5})</Label>
              <Slider
                value={[element.maxRating || 5]}
                onValueChange={([v]) => onChange({ maxRating: v })}
                min={3}
                max={10}
                step={1}
              />
            </div>
          )}

          {/* ─── Visual element: content ─── */}
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

          {/* ─── Style Section ─── */}
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
                <Label>Borda ({element.style?.borderRadius || 8}px)</Label>
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
