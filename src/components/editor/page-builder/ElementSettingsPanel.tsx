import { PageElement, PAGE_ELEMENT_LABELS, SelectOption, NotificationItem, ArgumentItem, TestimonialItem, FAQItem, PricingPlan, PricingFeature, CarouselImage } from '@/types/pageElements';
import { FunnelPage } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { X, Plus, Trash2, Upload, Loader2, Star, Link, Unlink } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useState, useRef } from 'react';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onClose: () => void;
  pages?: FunnelPage[];
}

const isFormField = (type: string) => type.startsWith('input_');

export default function ElementSettingsPanel({ element, onChange, onClose, pages }: Props) {
  const [uploadingOptionId, setUploadingOptionId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [paddingLinked, setPaddingLinked] = useState(true);
  const [marginLinked, setMarginLinked] = useState(true);

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

          {/* ─── Date field settings ─── */}
          {element.type === 'input_date' && (
            <>
              <div className="space-y-2">
                <Label>Modo</Label>
                <Select
                  value={element.dateMode || 'date'}
                  onValueChange={v => onChange({ dateMode: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Apenas data</SelectItem>
                    <SelectItem value="time">Apenas hora</SelectItem>
                    <SelectItem value="datetime">Data e hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(element.dateMode || 'date') !== 'time' && (
                <div className="space-y-2">
                  <Label>Formato da data</Label>
                  <Select
                    value={element.dateFormat || 'dd/MM/yyyy'}
                    onValueChange={v => onChange({ dateFormat: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd/MM/yyyy">DD/MM/AAAA</SelectItem>
                      <SelectItem value="MM/dd/yyyy">MM/DD/AAAA</SelectItem>
                      <SelectItem value="yyyy-MM-dd">AAAA-MM-DD</SelectItem>
                      <SelectItem value="dd 'de' MMMM 'de' yyyy">Extenso (01 de Janeiro de 2025)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

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
                      <div className="space-y-1.5">
                        {opt.imageUrl && (
                          <img src={opt.imageUrl} alt={opt.label} className="w-full h-20 object-cover rounded" />
                        )}
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={opt.imageUrl || ''}
                            onChange={e => updateOptionField(opt.id, 'imageUrl', e.target.value)}
                            className="h-8 text-xs flex-1"
                            placeholder="URL da imagem..."
                          />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={el => { fileInputRefs.current[opt.id] = el; }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setUploadingOptionId(opt.id);
                              try {
                                const formData = new FormData();
                                formData.append('file', file);
                                const path = `quiz-images/${crypto.randomUUID()}-${file.name}`;
                                formData.append('path', path);
                                const { data, error } = await supabase.functions.invoke('minio-upload', {
                                  body: formData,
                                });
                                if (error) throw error;
                                if (data?.url) {
                                  updateOptionField(opt.id, 'imageUrl', data.url);
                                }
                              } catch (err) {
                                console.error('Upload failed:', err);
                              } finally {
                                setUploadingOptionId(null);
                                e.target.value = '';
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0"
                            disabled={uploadingOptionId === opt.id}
                            onClick={() => fileInputRefs.current[opt.id]?.click()}
                          >
                            {uploadingOptionId === opt.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
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
          {(element.type === 'heading' || element.type === 'text' || element.type === 'button' || element.type === 'alert') && (
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              {(element.type === 'text' || element.type === 'alert') ? (
                <Textarea
                  value={element.content || ''}
                  onChange={e => onChange({ content: e.target.value })}
                  rows={element.type === 'alert' ? 3 : 4}
                />
              ) : (
                <Input
                  value={element.content || ''}
                  onChange={e => onChange({ content: e.target.value })}
                />
              )}
            </div>
          )}

          {/* ─── Alert variant ─── */}
          {element.type === 'alert' && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={element.alertVariant || 'info'}
                onValueChange={v => onChange({ alertVariant: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Informação</SelectItem>
                  <SelectItem value="success">✅ Sucesso</SelectItem>
                  <SelectItem value="warning">⚠️ Aviso</SelectItem>
                  <SelectItem value="error">❌ Erro</SelectItem>
                </SelectContent>
              </Select>
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

          {/* Button action */}
          {element.type === 'button' && (
            <>
              <div className="space-y-2">
                <Label>Ação do botão</Label>
                <Select
                  value={element.buttonAction || 'none'}
                  onValueChange={v => onChange({ buttonAction: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="next">Próxima página</SelectItem>
                    <SelectItem value="previous">Página anterior</SelectItem>
                    <SelectItem value="specific">Página específica</SelectItem>
                    <SelectItem value="finish">Concluir / Enviar</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {element.buttonAction === 'specific' && pages && pages.length > 0 && (
                <div className="space-y-2">
                  <Label>Página destino</Label>
                  <Select
                    value={element.buttonTargetPageId || ''}
                    onValueChange={v => onChange({ buttonTargetPageId: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {pages.map((p, i) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title || `Página ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Link externo (opcional)</Label>
                <Input
                  value={element.href || ''}
                  onChange={e => onChange({ href: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </>
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

          {/* ─── Notification settings ─── */}
          {element.type === 'notification' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Posição</Label>
                <Select
                  value={element.notificationPosition || 'top'}
                  onValueChange={v => onChange({ notificationPosition: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="top">Topo</SelectItem>
                    <SelectItem value="bottom">Rodapé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modo de exibição</Label>
                <Select
                  value={element.notificationMode || 'sequential'}
                  onValueChange={v => onChange({ notificationMode: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequencial</SelectItem>
                    <SelectItem value="random">Aleatório</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tempo exibido ({element.notificationDuration || 3}s)</Label>
                <Slider
                  value={[element.notificationDuration || 3]}
                  onValueChange={([v]) => onChange({ notificationDuration: v })}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Intervalo entre ({element.notificationInterval || 2}s)</Label>
                <Slider
                  value={[element.notificationInterval || 2]}
                  onValueChange={([v]) => onChange({ notificationInterval: v })}
                  min={1}
                  max={15}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Notificações ({(element.notificationItems || []).length}/10)</Label>
                <div className="space-y-2">
                  {(element.notificationItems || []).map((item) => (
                    <div key={item.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={item.icon || ''}
                          onChange={e => {
                            const items = (element.notificationItems || []).map(n =>
                              n.id === item.id ? { ...n, icon: e.target.value } : n
                            );
                            onChange({ notificationItems: items });
                          }}
                          className="h-8 w-14 text-center text-lg"
                          placeholder="🔔"
                        />
                        <Input
                          value={item.title}
                          onChange={e => {
                            const items = (element.notificationItems || []).map(n =>
                              n.id === item.id ? { ...n, title: e.target.value } : n
                            );
                            onChange({ notificationItems: items });
                          }}
                          className="h-8 text-sm flex-1"
                          placeholder="Título"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            onChange({ notificationItems: (element.notificationItems || []).filter(n => n.id !== item.id) });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Input
                        value={item.text}
                        onChange={e => {
                          const items = (element.notificationItems || []).map(n =>
                            n.id === item.id ? { ...n, text: e.target.value } : n
                          );
                          onChange({ notificationItems: items });
                        }}
                        className="h-8 text-xs"
                        placeholder="Texto da notificação..."
                      />
                    </div>
                  ))}
                  {(element.notificationItems || []).length < 10 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => {
                        const items = [...(element.notificationItems || [])];
                        items.push({
                          id: crypto.randomUUID(),
                          title: `Notificação ${items.length + 1}`,
                          text: 'Texto da notificação',
                          icon: '🔔',
                        });
                        onChange({ notificationItems: items });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar notificação
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── Chart settings ─── */}
          {element.type === 'chart' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de gráfico</Label>
                <Select
                  value={element.chartType || 'column'}
                  onValueChange={v => onChange({ chartType: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="column">Colunas</SelectItem>
                    <SelectItem value="bar">Barras</SelectItem>
                    <SelectItem value="line">Linha</SelectItem>
                    <SelectItem value="pie">Pizza</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Grade</Label>
                  <Switch
                    checked={element.chartStyle?.showGrid !== false}
                    onCheckedChange={v => onChange({ chartStyle: { ...element.chartStyle, showGrid: v } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Labels</Label>
                  <Switch
                    checked={element.chartStyle?.showLabels !== false}
                    onCheckedChange={v => onChange({ chartStyle: { ...element.chartStyle, showLabels: v } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Legenda</Label>
                  <Switch
                    checked={element.chartStyle?.showLegend !== false}
                    onCheckedChange={v => onChange({ chartStyle: { ...element.chartStyle, showLegend: v } })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Valores</Label>
                  <Switch
                    checked={element.chartStyle?.showValues !== false}
                    onCheckedChange={v => onChange({ chartStyle: { ...element.chartStyle, showValues: v } })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dados ({(element.chartItems || []).length})</Label>
                {(element.chartItems || []).map((item) => (
                  <div key={item.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={item.color || '#6366f1'}
                        onChange={e => {
                          const items = (element.chartItems || []).map(d =>
                            d.id === item.id ? { ...d, color: e.target.value } : d
                          );
                          onChange({ chartItems: items });
                        }}
                        className="h-7 w-7 rounded border border-border cursor-pointer flex-shrink-0"
                      />
                      <Input
                        value={item.label}
                        onChange={e => {
                          const items = (element.chartItems || []).map(d =>
                            d.id === item.id ? { ...d, label: e.target.value } : d
                          );
                          onChange({ chartItems: items });
                        }}
                        className="h-8 text-sm flex-1"
                        placeholder="Label"
                      />
                      <Input
                        value={item.value}
                        onChange={e => {
                          const items = (element.chartItems || []).map(d =>
                            d.id === item.id ? { ...d, value: e.target.value } : d
                          );
                          onChange({ chartItems: items });
                        }}
                        className="h-8 text-sm w-16"
                        placeholder="0"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => onChange({ chartItems: (element.chartItems || []).filter(d => d.id !== item.id) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={item.tooltip || ''}
                      onChange={e => {
                        const items = (element.chartItems || []).map(d =>
                          d.id === item.id ? { ...d, tooltip: e.target.value } : d
                        );
                        onChange({ chartItems: items });
                      }}
                      className="h-7 text-xs"
                      placeholder="Texto da legenda (opcional)"
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    const items = [...(element.chartItems || [])];
                    const colors = ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#eab308', '#f97316', '#ef4444', '#ec4899'];
                    items.push({
                      id: crypto.randomUUID(),
                      label: `Item ${items.length + 1}`,
                      value: String(Math.floor(Math.random() * 80) + 20),
                      color: colors[items.length % colors.length],
                    });
                    onChange({ chartItems: items });
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar dado
                </Button>
              </div>
            </div>
          )}

          {/* ─── Arguments settings ─── */}
          {element.type === 'arguments' && (
            <div className="space-y-3">
              <Label>Argumentos ({(element.argumentItems || []).length})</Label>
              {(element.argumentItems || []).map((item) => (
                <div key={item.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Input value={item.emoji} onChange={e => { const items = (element.argumentItems || []).map(a => a.id === item.id ? { ...a, emoji: e.target.value } : a); onChange({ argumentItems: items }); }} className="h-8 w-14 text-center text-lg" placeholder="🎯" />
                    <Input value={item.title} onChange={e => { const items = (element.argumentItems || []).map(a => a.id === item.id ? { ...a, title: e.target.value } : a); onChange({ argumentItems: items }); }} className="h-8 text-sm flex-1" placeholder="Título" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onChange({ argumentItems: (element.argumentItems || []).filter(a => a.id !== item.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Textarea value={item.description} onChange={e => { const items = (element.argumentItems || []).map(a => a.id === item.id ? { ...a, description: e.target.value } : a); onChange({ argumentItems: items }); }} className="text-xs" rows={2} placeholder="Descrição..." />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                const items = [...(element.argumentItems || [])];
                items.push({ id: crypto.randomUUID(), emoji: '✨', title: `Benefício ${items.length + 1}`, description: '' });
                onChange({ argumentItems: items });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar argumento</Button>
            </div>
          )}

          {/* ─── Testimonials settings ─── */}
          {element.type === 'testimonials' && (
            <div className="space-y-3">
              <Label>Depoimentos ({(element.testimonialItems || []).length})</Label>
              {(element.testimonialItems || []).map((item) => (
                <div key={item.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Input value={item.name} onChange={e => { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, name: e.target.value } : t); onChange({ testimonialItems: items }); }} className="h-8 text-sm flex-1" placeholder="Nome" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onChange({ testimonialItems: (element.testimonialItems || []).filter(t => t.id !== item.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Input value={item.socialProfile || ''} onChange={e => { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, socialProfile: e.target.value } : t); onChange({ testimonialItems: items }); }} className="h-8 text-xs" placeholder="@perfil ou link (opcional)" />
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">Estrelas</Label>
                    <div className="flex gap-0.5 ml-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={(e) => { e.stopPropagation(); const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, rating: n } : t); onChange({ testimonialItems: items }); }} className="p-0">
                          <Star className={`h-4 w-4 ${n <= item.rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/20'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea value={item.text} onChange={e => { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, text: e.target.value } : t); onChange({ testimonialItems: items }); }} className="text-xs" rows={2} placeholder="Depoimento..." />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Verificado</Label>
                    <Switch checked={item.verified || false} onCheckedChange={v => { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, verified: v } : t); onChange({ testimonialItems: items }); }} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input value={item.photoUrl || ''} onChange={e => { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, photoUrl: e.target.value } : t); onChange({ testimonialItems: items }); }} className="h-8 text-xs flex-1" placeholder="URL da foto (opcional)" />
                    <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[`testimonial-${item.id}`] = el; }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingOptionId(`testimonial-${item.id}`);
                        try {
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('path', `testimonials/${crypto.randomUUID()}-${file.name}`);
                          const { data, error } = await supabase.functions.invoke('minio-upload', { body: formData });
                          if (error) throw error;
                          if (data?.url) { const items = (element.testimonialItems || []).map(t => t.id === item.id ? { ...t, photoUrl: data.url } : t); onChange({ testimonialItems: items }); }
                        } catch (err) { console.error('Upload failed:', err); }
                        finally { setUploadingOptionId(null); e.target.value = ''; }
                      }}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" disabled={uploadingOptionId === `testimonial-${item.id}`} onClick={() => fileInputRefs.current[`testimonial-${item.id}`]?.click()}>
                      {uploadingOptionId === `testimonial-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                const items = [...(element.testimonialItems || [])];
                items.push({ id: crypto.randomUUID(), name: '', rating: 5, text: '', photoUrl: '' });
                onChange({ testimonialItems: items });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar depoimento</Button>
            </div>
          )}

          {/* ─── FAQ settings ─── */}
          {element.type === 'faq' && (
            <div className="space-y-3">
              <Label>Perguntas ({(element.faqItems || []).length})</Label>
              {(element.faqItems || []).map((item) => (
                <div key={item.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Input value={item.question} onChange={e => { const items = (element.faqItems || []).map(f => f.id === item.id ? { ...f, question: e.target.value } : f); onChange({ faqItems: items }); }} className="h-8 text-sm flex-1" placeholder="Pergunta" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onChange({ faqItems: (element.faqItems || []).filter(f => f.id !== item.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Textarea value={item.answer} onChange={e => { const items = (element.faqItems || []).map(f => f.id === item.id ? { ...f, answer: e.target.value } : f); onChange({ faqItems: items }); }} className="text-xs" rows={2} placeholder="Resposta..." />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                const items = [...(element.faqItems || [])];
                items.push({ id: crypto.randomUUID(), question: '', answer: '' });
                onChange({ faqItems: items });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar pergunta</Button>
            </div>
          )}

          {/* ─── Pricing settings ─── */}
          {element.type === 'pricing' && (
            <div className="space-y-3">
              <Label>Planos ({(element.pricingPlans || []).length})</Label>
              {(element.pricingPlans || []).map((plan) => (
                <div key={plan.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                  <div className="flex items-center gap-1.5">
                    <Input value={plan.name} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, name: e.target.value } : p); onChange({ pricingPlans: plans }); }} className="h-8 text-sm flex-1" placeholder="Nome do plano" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onChange({ pricingPlans: (element.pricingPlans || []).filter(p => p.id !== plan.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="flex gap-1.5">
                    <Input value={plan.price} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, price: e.target.value } : p); onChange({ pricingPlans: plans }); }} className="h-8 text-sm flex-1" placeholder="R$ 99" />
                    <Input value={plan.period || ''} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, period: e.target.value } : p); onChange({ pricingPlans: plans }); }} className="h-8 text-xs w-20" placeholder="/mês" />
                  </div>
                  <Textarea value={plan.description || ''} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, description: e.target.value } : p); onChange({ pricingPlans: plans }); }} className="text-xs" rows={1} placeholder="Descrição (opcional)" />
                  <Input value={plan.ctaLabel} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, ctaLabel: e.target.value } : p); onChange({ pricingPlans: plans }); }} className="h-8 text-xs" placeholder="Texto do botão" />
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Destaque</Label>
                    <Switch checked={plan.highlighted || false} onCheckedChange={v => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, highlighted: v } : p); onChange({ pricingPlans: plans }); }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Recursos</Label>
                    {plan.features.map(f => (
                      <div key={f.id} className="flex items-center gap-1">
                        <Switch checked={f.included} onCheckedChange={v => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, features: p.features.map(ff => ff.id === f.id ? { ...ff, included: v } : ff) } : p); onChange({ pricingPlans: plans }); }} />
                        <Input value={f.text} onChange={e => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, features: p.features.map(ff => ff.id === f.id ? { ...ff, text: e.target.value } : ff) } : p); onChange({ pricingPlans: plans }); }} className="h-7 text-xs flex-1" />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, features: p.features.filter(ff => ff.id !== f.id) } : p); onChange({ pricingPlans: plans }); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => { const plans = (element.pricingPlans || []).map(p => p.id === plan.id ? { ...p, features: [...p.features, { id: crypto.randomUUID(), text: 'Novo recurso', included: true }] } : p); onChange({ pricingPlans: plans }); }}><Plus className="h-3 w-3 mr-1" /> Recurso</Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                const plans = [...(element.pricingPlans || [])];
                plans.push({ id: crypto.randomUUID(), name: `Plano ${plans.length + 1}`, price: 'R$ 0', features: [], ctaLabel: 'Escolher' });
                onChange({ pricingPlans: plans });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar plano</Button>
            </div>
          )}

          {/* ─── Columns settings ─── */}
          {element.type === 'columns' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Número de colunas</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => {
                        const current = element.columnData || [];
                        let updated = [...current];
                        while (updated.length < n) {
                          updated.push({ id: crypto.randomUUID(), elements: [] });
                        }
                        onChange({ columnCount: n, columnData: updated });
                      }}
                      className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        (element.columnCount || 2) === n
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Arraste elementos da barra lateral para dentro de cada coluna, ou use o botão "Adicionar" dentro de cada coluna.
              </p>
            </div>
          )}

          {/* ─── Before/After settings ─── */}
          {element.type === 'before_after' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Modo</Label>
                <Select value={element.beforeAfterMode || 'slider'} onValueChange={v => onChange({ beforeAfterMode: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slider">Slider deslizante</SelectItem>
                    <SelectItem value="side_by_side">Lado a lado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(['before', 'after'] as const).map(side => {
                const key = side === 'before' ? 'beforeImage' : 'afterImage';
                const label = side === 'before' ? 'Antes' : 'Depois';
                const val = side === 'before' ? element.beforeImage : element.afterImage;
                return (
                  <div key={side} className="space-y-1.5">
                    <Label>{label}</Label>
                    {val && <img src={val} alt={label} className="w-full h-20 object-cover rounded" />}
                    <div className="flex items-center gap-1.5">
                      <Input value={val || ''} onChange={e => onChange({ [key]: e.target.value })} className="h-8 text-xs flex-1" placeholder="URL da imagem..." />
                      <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[`ba-${side}`] = el; }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingOptionId(`ba-${side}`);
                          try {
                            const formData = new FormData();
                            formData.append('file', file);
                            formData.append('path', `before-after/${crypto.randomUUID()}-${file.name}`);
                            const { data, error } = await supabase.functions.invoke('minio-upload', { body: formData });
                            if (error) throw error;
                            if (data?.url) onChange({ [key]: data.url });
                          } catch (err) { console.error('Upload failed:', err); }
                          finally { setUploadingOptionId(null); e.target.value = ''; }
                        }}
                      />
                      <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" disabled={uploadingOptionId === `ba-${side}`} onClick={() => fileInputRefs.current[`ba-${side}`]?.click()}>
                        {uploadingOptionId === `ba-${side}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Carousel settings ─── */}
          {element.type === 'carousel' && (
            <div className="space-y-3">
              <Label>Imagens ({(element.carouselImages || []).length})</Label>
              {(element.carouselImages || []).map((img) => (
                <div key={img.id} className="space-y-1.5 p-2 rounded-lg border border-border">
                  {img.src && <img src={img.src} alt={img.alt || ''} className="w-full h-16 object-cover rounded" />}
                  <div className="flex items-center gap-1.5">
                    <Input value={img.src} onChange={e => { const images = (element.carouselImages || []).map(i => i.id === img.id ? { ...i, src: e.target.value } : i); onChange({ carouselImages: images }); }} className="h-8 text-xs flex-1" placeholder="URL da imagem..." />
                    <input type="file" accept="image/*" className="hidden" ref={el => { fileInputRefs.current[`carousel-${img.id}`] = el; }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingOptionId(`carousel-${img.id}`);
                        try {
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('path', `carousel/${crypto.randomUUID()}-${file.name}`);
                          const { data, error } = await supabase.functions.invoke('minio-upload', { body: formData });
                          if (error) throw error;
                          if (data?.url) { const images = (element.carouselImages || []).map(i => i.id === img.id ? { ...i, src: data.url } : i); onChange({ carouselImages: images }); }
                        } catch (err) { console.error('Upload failed:', err); }
                        finally { setUploadingOptionId(null); e.target.value = ''; }
                      }}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" disabled={uploadingOptionId === `carousel-${img.id}`} onClick={() => fileInputRefs.current[`carousel-${img.id}`]?.click()}>
                      {uploadingOptionId === `carousel-${img.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onChange({ carouselImages: (element.carouselImages || []).filter(i => i.id !== img.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  <Input value={img.alt || ''} onChange={e => { const images = (element.carouselImages || []).map(i => i.id === img.id ? { ...i, alt: e.target.value } : i); onChange({ carouselImages: images }); }} className="h-7 text-xs" placeholder="Alt text (opcional)" />
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => {
                const images = [...(element.carouselImages || [])];
                images.push({ id: crypto.randomUUID(), src: '' });
                onChange({ carouselImages: images });
              }}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar imagem</Button>
            </div>
          )}

          {/* ═══════ UNIVERSAL STYLE SECTION ═══════ */}
          <div className="border-t border-border pt-4 mt-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Estilo</h4>

            {/* Text Align */}
            {!['divider', 'spacer', 'columns'].includes(element.type) && (
              <div className="space-y-2 mb-4">
                <Label className="text-xs">Alinhamento</Label>
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

            {/* Background Color */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Cor do fundo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.style?.backgroundColor || '#ffffff'}
                  onChange={e => updateStyle({ backgroundColor: e.target.value })}
                  className="h-8 w-8 rounded border border-border cursor-pointer flex-shrink-0"
                />
                <Input
                  value={element.style?.backgroundColor || ''}
                  onChange={e => updateStyle({ backgroundColor: e.target.value || undefined })}
                  placeholder="Transparente"
                  className="flex-1 h-8 text-xs"
                />
              </div>
            </div>

            {/* Text Color */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Cor do texto</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.style?.color || '#000000'}
                  onChange={e => updateStyle({ color: e.target.value })}
                  className="h-8 w-8 rounded border border-border cursor-pointer flex-shrink-0"
                />
                <Input
                  value={element.style?.color || ''}
                  onChange={e => updateStyle({ color: e.target.value || undefined })}
                  placeholder="Padrão"
                  className="flex-1 h-8 text-xs"
                />
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Tipografia</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={element.style?.fontFamily || ''}
                  onValueChange={v => updateStyle({ fontFamily: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Fonte" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Inter">Inter</SelectItem>
                    <SelectItem value="Arial">Arial</SelectItem>
                    <SelectItem value="Georgia">Georgia</SelectItem>
                    <SelectItem value="Helvetica">Helvetica</SelectItem>
                    <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                    <SelectItem value="Courier New">Courier New</SelectItem>
                    <SelectItem value="Verdana">Verdana</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={element.style?.fontWeight || ''}
                  onValueChange={v => updateStyle({ fontWeight: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Peso" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="500">Médio</SelectItem>
                    <SelectItem value="600">Semibold</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                    <SelectItem value="800">Extra Bold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Border */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Bordas</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Largura</span>
                  <Input
                    type="number"
                    value={element.style?.borderWidth ?? ''}
                    onChange={e => updateStyle({ borderWidth: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="0"
                    className="h-8 text-xs"
                    min={0}
                    max={20}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Estilo</span>
                  <Select
                    value={element.style?.borderStyle || 'solid'}
                    onValueChange={v => updateStyle({ borderStyle: v as any })}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solid">Sólida</SelectItem>
                      <SelectItem value="dashed">Tracejada</SelectItem>
                      <SelectItem value="dotted">Pontilhada</SelectItem>
                      <SelectItem value="none">Nenhuma</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.style?.borderColor || '#e5e7eb'}
                  onChange={e => updateStyle({ borderColor: e.target.value })}
                  className="h-8 w-8 rounded border border-border cursor-pointer flex-shrink-0"
                />
                <Input
                  value={element.style?.borderColor || ''}
                  onChange={e => updateStyle({ borderColor: e.target.value || undefined })}
                  placeholder="Cor da borda"
                  className="flex-1 h-8 text-xs"
                />
              </div>
            </div>

            {/* Border Radius */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Arredondamento ({element.style?.borderRadius ?? 0}px)</Label>
              <Slider
                value={[element.style?.borderRadius ?? 0]}
                onValueChange={([v]) => updateStyle({ borderRadius: v })}
                min={0}
                max={50}
                step={1}
              />
            </div>

            {/* Shadow */}
            <div className="space-y-2 mb-4">
              <Label className="text-xs">Sombra</Label>
              <Select
                value={element.style?.boxShadow || 'none'}
                onValueChange={v => updateStyle({ boxShadow: v === 'none' ? undefined : v })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sem sombra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  <SelectItem value="0 1px 3px rgba(0,0,0,0.08)">Leve</SelectItem>
                  <SelectItem value="0 4px 12px rgba(0,0,0,0.1)">Média</SelectItem>
                  <SelectItem value="0 8px 24px rgba(0,0,0,0.15)">Forte</SelectItem>
                  <SelectItem value="0 12px 40px rgba(0,0,0,0.2)">Extra forte</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Padding</Label>
                <button
                  type="button"
                  onClick={() => setPaddingLinked(!paddingLinked)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={paddingLinked ? 'Editar lados individualmente' : 'Editar todos juntos'}
                >
                  {paddingLinked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                </button>
              </div>
              {paddingLinked ? (
                <Slider
                  value={[element.style?.padding ?? 0]}
                  onValueChange={([v]) => updateStyle({ padding: v, paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined })}
                  min={0}
                  max={80}
                  step={2}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {([['paddingTop', 'Cima'], ['paddingRight', 'Direita'], ['paddingBottom', 'Baixo'], ['paddingLeft', 'Esquerda']] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <Input
                        type="number"
                        value={element.style?.[key] ?? element.style?.padding ?? 0}
                        onChange={e => updateStyle({ padding: undefined, [key]: e.target.value ? Number(e.target.value) : 0 })}
                        className="h-8 text-xs"
                        min={0}
                        max={80}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Margin */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Margem</Label>
                <button
                  type="button"
                  onClick={() => setMarginLinked(!marginLinked)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={marginLinked ? 'Editar lados individualmente' : 'Editar todos juntos'}
                >
                  {marginLinked ? <Link className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
                </button>
              </div>
              {marginLinked ? (
                <Slider
                  value={[element.style?.margin ?? 0]}
                  onValueChange={([v]) => updateStyle({ margin: v, marginTop: undefined, marginRight: undefined, marginBottom: undefined, marginLeft: undefined })}
                  min={0}
                  max={80}
                  step={2}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {([['marginTop', 'Cima'], ['marginRight', 'Direita'], ['marginBottom', 'Baixo'], ['marginLeft', 'Esquerda']] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <Input
                        type="number"
                        value={element.style?.[key] ?? element.style?.margin ?? 0}
                        onChange={e => updateStyle({ margin: undefined, [key]: e.target.value ? Number(e.target.value) : 0 })}
                        className="h-8 text-xs"
                        min={0}
                        max={80}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Width */}
            {['button', 'image', 'divider'].includes(element.type) && (
              <div className="space-y-2 mb-4">
                <Label className="text-xs">Largura</Label>
                <Select
                  value={element.style?.width || 'auto'}
                  onValueChange={v => updateStyle({ width: v === 'auto' ? undefined : v })}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    <SelectItem value="100%">100%</SelectItem>
                    <SelectItem value="75%">75%</SelectItem>
                    <SelectItem value="50%">50%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
