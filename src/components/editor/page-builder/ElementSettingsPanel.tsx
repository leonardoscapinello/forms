import React from 'react';
import { PageElement, PAGE_ELEMENT_LABELS, SelectOption, NotificationItem, ArgumentItem, TestimonialItem, FAQItem, PricingPlan, PricingFeature, CarouselImage, ProgressBarItem, ComparativeDataset, ComparativeDataPoint, ComparativeChartMode, ListItem, ListStyleType } from '@/types/pageElements';
import { FunnelPage, FormVariable } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { X, Plus, Trash2, Upload, Loader2, Star } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useState, useRef } from 'react';
import {
  ColorPickerField,
  TypographySelector,
  AlignmentSelector,
  BorderSettings,
  SpacingControl,
  ShadowSelector,
  WidthSelector,
  VariableInput,
} from '@/components/editor/shared';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onClose: () => void;
  pages?: FunnelPage[];
  variables?: FormVariable[];
}

const isFormField = (type: string) => type.startsWith('input_');

export default function ElementSettingsPanel({ element, onChange, onClose, pages, variables = [] }: Props) {
  const [uploadingOptionId, setUploadingOptionId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeTab, setActiveTab] = useState<'definitions' | 'appearance' | 'exterior'>('definitions');

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

  const TAB_OPTIONS = [
    { key: 'definitions' as const, label: 'Definições' },
    { key: 'appearance' as const, label: 'Aparência' },
    { key: 'exterior' as const, label: 'Exterior' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold">{PAGE_ELEMENT_LABELS[element.type]}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TAB_OPTIONS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">

          {activeTab === 'definitions' && (<>
          {/* ─── Form field: label (enunciado) ─── */}
          {isFormField(element.type) && (
            <div className="space-y-2">
              <Label>Enunciado</Label>
              <VariableInput
                value={element.label || ''}
                onChange={v => onChange({ label: v })}
                placeholder="Pergunta ou instrução"
                variables={variables}
              />
            </div>
          )}

          {/* ─── Form field: description ─── */}
          {isFormField(element.type) && (
            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <VariableInput
                as="textarea"
                value={element.description || ''}
                onChange={v => onChange({ description: v })}
                placeholder="Texto de apoio..."
                rows={2}
                variables={variables}
              />
            </div>
          )}

          {/* ─── Form field: placeholder ─── */}
          {['input_text', 'input_email', 'input_phone', 'input_address', 'input_select', 'input_number', 'input_textarea', 'input_date', 'input_height', 'input_weight'].includes(element.type) && (
            <div className="space-y-2">
              <Label>Placeholder</Label>
              <VariableInput
                value={element.placeholder || ''}
                onChange={v => onChange({ placeholder: v })}
                variables={variables}
                placeholder="Texto de exemplo..."
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

          {/* ─── Form field: fieldName (ID para webhooks) ─── */}
          {isFormField(element.type) && (
            <div className="space-y-2">
              <Label>
                Nome do campo{' '}
                <span className="text-muted-foreground font-normal">(ID)</span>
              </Label>
              <Input
                value={element.fieldName || ''}
                onChange={e => onChange({ fieldName: e.target.value.replace(/\s+/g, '_').toLowerCase() || undefined })}
                placeholder={element.id.slice(0, 8) + '…'}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Chave usada nos webhooks e integrações. Use letras, números e <code className="bg-muted px-0.5 rounded">_</code>. Ex: <code className="bg-muted px-0.5 rounded">email_principal</code>
              </p>
            </div>
          )}

          {/* ─── Form field: variable binding ─── */}
          {isFormField(element.type) && variables.length > 0 && (
            <div className="space-y-2">
              <Label>Salvar em variável</Label>
              <Select
                value={element.variableId || '_none_'}
                onValueChange={v => onChange({ variableId: v === '_none_' ? undefined : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">Nenhuma</SelectItem>
                  {variables.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                A resposta deste campo será armazenada na variável selecionada
              </p>
            </div>
          )}

          {/* ─── Form field: default value ─── */}
          {isFormField(element.type) && !['input_height', 'input_weight', 'input_checkbox', 'input_rating', 'input_nps'].includes(element.type) && (
            <div className="space-y-2">
              <Label>Valor pré-definido</Label>
              <VariableInput
                value={String(element.defaultValue ?? '')}
                onChange={v => onChange({ defaultValue: v || undefined })}
                placeholder="Deixe vazio para não preencher"
                variables={variables}
              />
              <p className="text-xs text-muted-foreground">
                Valor que aparecerá preenchido ao abrir o formulário. Use <code className="bg-muted px-0.5 rounded font-mono text-[10px]">{`{{variavel}}`}</code> para preencher dinamicamente.
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
          {(element.type === 'input_rating' || element.type === 'input_nps') && (
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

          {/* ─── Rating style & count ─── */}
          {element.type === 'input_rating' && (
            <>
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Select value={element.ratingStyle || 'star'} onValueChange={v => onChange({ ratingStyle: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="star">⭐ Estrelas</SelectItem>
                    <SelectItem value="heart">❤️ Corações</SelectItem>
                    <SelectItem value="thumbsUp">👍 Curtidas</SelectItem>
                    <SelectItem value="emoji">😀 Emoji personalizado</SelectItem>
                    <SelectItem value="numeric">🔢 Numérico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {element.ratingStyle === 'emoji' && (
                <div className="space-y-2">
                  <Label>Emoji</Label>
                  <Input value={element.ratingEmoji || '⭐'} onChange={e => onChange({ ratingEmoji: e.target.value })} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Quantidade ({element.maxRating || 5})</Label>
                <Slider
                  value={[element.maxRating || 5]}
                  onValueChange={([v]) => onChange({ maxRating: v })}
                  min={3}
                  max={10}
                  step={1}
                />
              </div>
            </>
          )}
          {element.type === 'input_nps' && (
            <>
              <div className="space-y-2">
                <Label>Escala máxima ({element.maxRating || 10})</Label>
                <Select value={String(element.maxRating || 10)} onValueChange={v => onChange({ maxRating: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">0 – 5</SelectItem>
                    <SelectItem value="7">0 – 7</SelectItem>
                    <SelectItem value="10">0 – 10</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rótulo inferior</Label>
                <Input value={element.npsLowLabel || ''} onChange={e => onChange({ npsLowLabel: e.target.value })} placeholder="Nada provável" />
              </div>
              <div className="space-y-2">
                <Label>Rótulo superior</Label>
                <Input value={element.npsHighLabel || ''} onChange={e => onChange({ npsHighLabel: e.target.value })} placeholder="Muito provável" />
              </div>
            </>
          )}

          {/* ─── Loading element ─── */}
          {element.type === 'loading' && (
            <>
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Select value={element.loadingStyle || 'bar'} onValueChange={v => onChange({ loadingStyle: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Barra de progresso</SelectItem>
                    <SelectItem value="circular">Circular</SelectItem>
                    <SelectItem value="infinite">Infinito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duração ({element.loadingDuration || 5}s)</Label>
                <Slider
                  value={[element.loadingDuration || 5]}
                  onValueChange={([v]) => onChange({ loadingDuration: v })}
                  min={1}
                  max={30}
                  step={1}
                />
              </div>
              {element.loadingStyle !== 'infinite' && (
                <div className="space-y-2">
                  <Label>Meta ({element.loadingTargetPercent || 100}%)</Label>
                  <Slider
                    value={[element.loadingTargetPercent || 100]}
                    onValueChange={([v]) => onChange({ loadingTargetPercent: v })}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Texto</Label>
                <Input value={element.loadingLabel || ''} onChange={e => onChange({ loadingLabel: e.target.value })} placeholder="Carregando..." />
              </div>
              <div className="space-y-2">
                <Label>Ação ao completar</Label>
                <Select value={element.loadingAction || 'none'} onValueChange={v => onChange({ loadingAction: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    <SelectItem value="next">Próxima página</SelectItem>
                    <SelectItem value="specific">Página específica</SelectItem>
                    <SelectItem value="finish">Concluir / Enviar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {element.loadingAction === 'specific' && pages && pages.length > 0 && (
                <div className="space-y-2">
                  <Label>Página destino</Label>
                  <Select value={element.loadingTargetPageId || ''} onValueChange={v => onChange({ loadingTargetPageId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {pages.map((p, i) => (
                        <SelectItem key={p.id} value={p.id}>{p.title || `Página ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {element.loadingStyle === 'circular' && (
                <>
                  <div className="space-y-2">
                    <Label>Tamanho ({element.loadingSize || 120}px)</Label>
                    <Slider value={[element.loadingSize || 120]} onValueChange={([v]) => onChange({ loadingSize: v })} min={60} max={200} step={4} />
                  </div>
                  <div className="space-y-2">
                    <Label>Espessura ({element.loadingStroke || 10}px)</Label>
                    <Slider value={[element.loadingStroke || 10]} onValueChange={([v]) => onChange({ loadingStroke: v })} min={4} max={20} step={1} />
                  </div>
                </>
              )}
            </>
          )}

          {/* ─── Visual element: content ─── */}
          {(element.type === 'heading' || element.type === 'text' || element.type === 'button' || element.type === 'alert') && (
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              {(element.type === 'text' || element.type === 'alert') ? (
                <VariableInput
                  as="textarea"
                  value={element.content || ''}
                  onChange={v => onChange({ content: v })}
                  rows={element.type === 'alert' ? 3 : 4}
                  variables={variables}
                />
              ) : (
                <VariableInput
                  value={element.content || ''}
                  onChange={v => onChange({ content: v })}
                  variables={variables}
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

          {/* Image settings */}
          {element.type === 'image' && (
            <>
              {/* Upload */}
              <div className="space-y-2">
                <Label>Imagem</Label>
                {element.src ? (
                  <div className="space-y-2">
                    <div className="relative group rounded-lg overflow-hidden border border-border" style={{ maxHeight: 200 }}>
                      <img src={element.src} alt={element.alt || ''} className="w-full object-cover" style={{ maxHeight: 200 }} />
                      <button
                        className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onChange({ src: '' })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('path', `images/${crypto.randomUUID()}-${file.name}`);
                        try {
                          const { data, error } = await supabase.functions.invoke('minio-upload', { body: formData });
                          if (error) throw error;
                          if (data?.url) onChange({ src: data.url });
                        } catch (err) {
                          console.error('Upload failed:', err);
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload
                  </Button>
                </div>
                <Input
                  value={element.src || ''}
                  onChange={e => onChange({ src: e.target.value })}
                  placeholder="ou cole uma URL..."
                  className="text-xs"
                />
              </div>

              {/* Alt text */}
              <div className="space-y-2">
                <Label>Texto alternativo</Label>
                <Input
                  value={element.alt || ''}
                  onChange={e => onChange({ alt: e.target.value })}
                  placeholder="Descrição da imagem"
                />
              </div>

              {/* Object fit */}
              <div className="space-y-2">
                <Label>Ajuste</Label>
                <Select value={element.imageObjectFit || 'cover'} onValueChange={v => onChange({ imageObjectFit: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Cobrir (crop)</SelectItem>
                    <SelectItem value="contain">Conter (sem corte)</SelectItem>
                    <SelectItem value="fill">Esticar</SelectItem>
                    <SelectItem value="none">Original</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max height */}
              <div className="space-y-2">
                <Label>Altura máxima ({element.imageMaxHeight || 400}px)</Label>
                <Slider
                  value={[element.imageMaxHeight || 400]}
                  onValueChange={([v]) => onChange({ imageMaxHeight: v })}
                  min={100}
                  max={800}
                  step={20}
                />
              </div>

              {/* Focal point */}
              {element.src && (element.imageObjectFit === 'cover' || !element.imageObjectFit) && (
                <div className="space-y-2">
                  <Label>Ponto focal</Label>
                  <p className="text-xs text-muted-foreground">Clique na imagem para definir o ponto de interesse</p>
                  <div
                    className="relative rounded-lg overflow-hidden border border-border cursor-crosshair"
                    style={{ height: 160 }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
                      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
                      onChange({ imageFocalX: x, imageFocalY: y });
                    }}
                  >
                    <img
                      src={element.src}
                      alt=""
                      className="w-full h-full"
                      style={{ objectFit: 'cover', objectPosition: `${element.imageFocalX ?? 50}% ${element.imageFocalY ?? 50}%` }}
                    />
                    <div
                      className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg bg-primary/60 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={{
                        left: `${element.imageFocalX ?? 50}%`,
                        top: `${element.imageFocalY ?? 50}%`,
                      }}
                    />
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => onChange({ imageFocalX: 50, imageFocalY: 50 })}>
                    Centralizar ponto focal
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Video URL */}
          {element.type === 'video' && (
            <div className="space-y-2">
              <Label>URL do vídeo</Label>
              <Input
                value={element.src || ''}
                onChange={e => onChange({ src: e.target.value })}
                placeholder="https://youtube.com/..."
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
                      <ColorPickerField
                        value={item.color || '#6366f1'}
                        onChange={v => {
                          const items = (element.chartItems || []).map(d =>
                            d.id === item.id ? { ...d, color: v || '#6366f1' } : d
                          );
                          onChange({ chartItems: items });
                        }}
                        allowTransparent={false}
                        defaultColor="#6366f1"
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

          {/* ─── Comparative Chart settings ─── */}
          {element.type === 'comparative_chart' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Modo do gráfico</Label>
                <Select
                  value={element.comparativeMode || 'cartesian'}
                  onValueChange={v => onChange({ comparativeMode: v as ComparativeChartMode })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cartesian">Cartesiano (Linhas)</SelectItem>
                    <SelectItem value="bar">Barras</SelectItem>
                    <SelectItem value="circular">Circular</SelectItem>
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

              {/* Labels (X-axis) */}
              {(element.comparativeMode || 'cartesian') !== 'circular' && (
                <div className="space-y-2">
                  <Label>Eixo X ({(element.comparativeLabels || []).length} pontos)</Label>
                  {(element.comparativeLabels || []).map((lbl, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={lbl}
                        onChange={e => {
                          const labels = [...(element.comparativeLabels || [])];
                          labels[i] = e.target.value;
                          onChange({ comparativeLabels: labels });
                        }}
                        className="h-8 text-sm flex-1"
                        placeholder={`Ponto ${i + 1}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const labels = (element.comparativeLabels || []).filter((_, j) => j !== i);
                          const datasets = (element.comparativeDatasets || []).map(ds => ({
                            ...ds,
                            points: ds.points.filter((_, j) => j !== i),
                          }));
                          onChange({ comparativeLabels: labels, comparativeDatasets: datasets });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      const labels = [...(element.comparativeLabels || []), `Ponto ${(element.comparativeLabels || []).length + 1}`];
                      const datasets = (element.comparativeDatasets || []).map(ds => ({
                        ...ds,
                        points: [...ds.points, { id: crypto.randomUUID(), label: labels[labels.length - 1], value: '0' }],
                      }));
                      onChange({ comparativeLabels: labels, comparativeDatasets: datasets });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar ponto
                  </Button>
                </div>
              )}

              {/* Datasets */}
              <div className="space-y-3">
                <Label>Conjuntos de dados ({(element.comparativeDatasets || []).length})</Label>
                {(element.comparativeDatasets || []).map((ds) => (
                  <div key={ds.id} className="space-y-2 p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-1.5">
                      <ColorPickerField
                        value={ds.color}
                        onChange={v => {
                          const datasets = (element.comparativeDatasets || []).map(d =>
                            d.id === ds.id ? { ...d, color: v || '#6366f1' } : d
                          );
                          onChange({ comparativeDatasets: datasets });
                        }}
                        allowTransparent={false}
                        defaultColor="#6366f1"
                      />
                      <Input
                        value={ds.name}
                        onChange={e => {
                          const datasets = (element.comparativeDatasets || []).map(d =>
                            d.id === ds.id ? { ...d, name: e.target.value } : d
                          );
                          onChange({ comparativeDatasets: datasets });
                        }}
                        className="h-8 text-sm flex-1"
                        placeholder="Nome do dataset"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          onChange({ comparativeDatasets: (element.comparativeDatasets || []).filter(d => d.id !== ds.id) });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={ds.tooltip || ''}
                      onChange={e => {
                        const datasets = (element.comparativeDatasets || []).map(d =>
                          d.id === ds.id ? { ...d, tooltip: e.target.value } : d
                        );
                        onChange({ comparativeDatasets: datasets });
                      }}
                      className="h-7 text-xs"
                      placeholder="Tooltip da legenda (opcional)"
                    />
                    {/* Data points */}
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-medium">Valores</span>
                      {ds.points.map((pt, pi) => (
                        <div key={pt.id} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <ColorPickerField
                              value={pt.color || '#9ca3af'}
                              onChange={v => {
                                const datasets = (element.comparativeDatasets || []).map(d => {
                                  if (d.id !== ds.id) return d;
                                  return {
                                    ...d,
                                    points: d.points.map((p, j) =>
                                      j === pi ? { ...p, color: v } : p
                                    ),
                                  };
                                });
                                onChange({ comparativeDatasets: datasets });
                              }}
                              allowTransparent={false}
                            />
                            <span className="text-[10px] text-muted-foreground w-12 truncate">
                              {(element.comparativeLabels || [])[pi] || `#${pi + 1}`}
                            </span>
                            <Input
                              value={pt.value}
                              onChange={e => {
                                const datasets = (element.comparativeDatasets || []).map(d => {
                                  if (d.id !== ds.id) return d;
                                  return {
                                    ...d,
                                    points: d.points.map((p, j) =>
                                      j === pi ? { ...p, value: e.target.value } : p
                                    ),
                                  };
                                });
                                onChange({ comparativeDatasets: datasets });
                              }}
                              className="h-7 text-xs w-20 font-mono"
                              placeholder="0"
                            />
                          </div>
                          <Input
                            value={pt.tooltip || ''}
                            onChange={e => {
                              const datasets = (element.comparativeDatasets || []).map(d => {
                                if (d.id !== ds.id) return d;
                                return {
                                  ...d,
                                  points: d.points.map((p, j) =>
                                    j === pi ? { ...p, tooltip: e.target.value || undefined } : p
                                  ),
                                };
                              });
                              onChange({ comparativeDatasets: datasets });
                            }}
                            className="h-6 text-[10px] ml-[74px]"
                            placeholder="Tip (opcional)"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    const colors = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];
                    const datasets = [...(element.comparativeDatasets || [])];
                    const labels = element.comparativeLabels || [];
                    datasets.push({
                      id: crypto.randomUUID(),
                      name: `Dataset ${datasets.length + 1}`,
                      color: colors[datasets.length % colors.length],
                      points: labels.map((l, i) => ({ id: crypto.randomUUID(), label: l, value: '0' })),
                    });
                    onChange({ comparativeDatasets: datasets });
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar dataset
                </Button>
              </div>
            </div>
          )}

          {/* ─── Horizontal Bar settings ─── */}
          {element.type === 'horizontal_bar' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={element.horizontalBarLabel || ''}
                  onChange={e => onChange({ horizontalBarLabel: e.target.value })}
                  placeholder="Progresso"
                />
              </div>
              <div className="space-y-2">
                <Label>Valor ({element.horizontalBarValue ?? 50}%)</Label>
                <Slider
                  value={[element.horizontalBarValue ?? 50]}
                  onValueChange={([v]) => onChange({ horizontalBarValue: v })}
                  min={0}
                  max={100}
                  step={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Altura da barra ({element.horizontalBarHeight || 12}px)</Label>
                <Slider
                  value={[element.horizontalBarHeight || 12]}
                  onValueChange={([v]) => onChange({ horizontalBarHeight: v })}
                  min={4}
                  max={32}
                  step={2}
                />
              </div>
            </div>
          )}

          {/* ─── Timer settings ─── */}
          {element.type === 'timer' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Modo</Label>
                <Select
                  value={element.timerMode || 'time'}
                  onValueChange={v => onChange({ timerMode: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto inline</SelectItem>
                    <SelectItem value="time">Contador de tempo</SelectItem>
                    <SelectItem value="datetime">Data e hora alvo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(element.timerMode || 'time') !== 'datetime' && (
                <div className="space-y-2">
                  <Label>Duração (minutos)</Label>
                  <Input
                    type="number"
                    value={element.timerDurationMinutes ?? 10}
                    onChange={e => onChange({ timerDurationMinutes: Number(e.target.value) || 1 })}
                    min={1}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              {(element.timerMode) === 'datetime' && (
                <div className="space-y-2">
                  <Label>Data e hora alvo</Label>
                  <Input
                    type="datetime-local"
                    value={element.timerTargetDate ? element.timerTargetDate.slice(0, 16) : ''}
                    onChange={e => onChange({ timerTargetDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Texto do timer</Label>
                <Input
                  value={element.timerLabel || ''}
                  onChange={e => onChange({ timerLabel: e.target.value })}
                  placeholder="Oferta expira em:"
                />
              </div>

              <div className="space-y-2">
                <Label>Texto ao finalizar</Label>
                <Input
                  value={element.timerFinishedLabel || ''}
                  onChange={e => onChange({ timerFinishedLabel: e.target.value })}
                  placeholder="Tempo esgotado!"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Exibir</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['timerShowDays', 'Dias'],
                    ['timerShowHours', 'Horas'],
                    ['timerShowMinutes', 'Minutos'],
                    ['timerShowSeconds', 'Segundos'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={element[key] !== false}
                        onCheckedChange={v => onChange({ [key]: v })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Arredondamento dos boxes ({element.timerBoxBorderRadius ?? 8}px)</Label>
                <Slider
                  value={[element.timerBoxBorderRadius ?? 8]}
                  onValueChange={([v]) => onChange({ timerBoxBorderRadius: v })}
                  min={0}
                  max={24}
                  step={1}
                />
              </div>
            </div>
          )}

          {element.type === 'circular_progress' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Valor (%)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[element.circularProgressValue ?? 72]}
                    onValueChange={([v]) => onChange({ circularProgressValue: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                  <span className="text-xs font-mono w-8 text-right">{element.circularProgressValue ?? 72}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Label antes</Label>
                <Input
                  value={element.circularProgressLabelBefore || ''}
                  onChange={e => onChange({ circularProgressLabelBefore: e.target.value })}
                  placeholder="Ex: Seu progresso"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Label depois</Label>
                <Input
                  value={element.circularProgressLabelAfter || ''}
                  onChange={e => onChange({ circularProgressLabelAfter: e.target.value })}
                  placeholder="Ex: concluído"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {element.type === 'list' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Estilo</Label>
                <Select
                  value={element.listStyleType || 'bullet'}
                  onValueChange={v => onChange({ listStyleType: v as ListStyleType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bullet">● Bullet</SelectItem>
                    <SelectItem value="numbered">1. Numerada</SelectItem>
                    <SelectItem value="check">✓ Check</SelectItem>
                    <SelectItem value="emoji">😀 Emoji</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Espaçamento ({element.listGap ?? 8}px)</Label>
                <Slider
                  value={[element.listGap ?? 8]}
                  onValueChange={([v]) => onChange({ listGap: v })}
                  min={0}
                  max={32}
                  step={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Itens ({(element.listItems || []).length})</Label>
                {(element.listItems || []).map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-1.5">
                    {element.listStyleType === 'emoji' && (
                      <Input
                        value={item.emoji || '✅'}
                        onChange={e => {
                          const items = (element.listItems || []).map(li =>
                            li.id === item.id ? { ...li, emoji: e.target.value } : li
                          );
                          onChange({ listItems: items });
                        }}
                        className="h-8 w-10 text-center text-sm p-0"
                      />
                    )}
                    <Input
                      value={item.text}
                      onChange={e => {
                        const items = (element.listItems || []).map(li =>
                          li.id === item.id ? { ...li, text: e.target.value } : li
                        );
                        onChange({ listItems: items });
                      }}
                      className="h-8 text-sm flex-1"
                      placeholder={`Item ${idx + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => {
                        const items = (element.listItems || []).filter(li => li.id !== item.id);
                        onChange({ listItems: items });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const items = [...(element.listItems || []), { id: crypto.randomUUID(), text: 'Novo item', emoji: '✅' }];
                    onChange({ listItems: items });
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Adicionar item
                </Button>
              </div>
            </div>
          )}

          {element.type === 'progress_bar' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Layout</Label>
                <Select
                  value={String(element.progressBarLayout || 1)}
                  onValueChange={v => onChange({ progressBarLayout: Number(v) as 1 | 2 | 3 })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 coluna</SelectItem>
                    <SelectItem value="2">2 colunas</SelectItem>
                    <SelectItem value="3">3 colunas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Disposição</Label>
                <Select
                  value={element.progressBarDisposition || 'chart_legend'}
                  onValueChange={v => onChange({ progressBarDisposition: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chart_legend">gráfico | legenda</SelectItem>
                    <SelectItem value="legend_chart">legenda | gráfico</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Barras ({(element.progressBarItems || []).length})</Label>
                {(element.progressBarItems || []).map((bar) => (
                  <div key={bar.id} className="space-y-1.5 p-2.5 rounded-lg border border-border">
                    <Input
                      value={bar.label}
                      onChange={e => {
                        const items = (element.progressBarItems || []).map(b =>
                          b.id === bar.id ? { ...b, label: e.target.value } : b
                        );
                        onChange({ progressBarItems: items });
                      }}
                      className="h-8 text-sm font-semibold text-center"
                      placeholder="Legenda"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-12">Valor</span>
                      <Input
                        type="number"
                        value={bar.value}
                        onChange={e => {
                          const items = (element.progressBarItems || []).map(b =>
                            b.id === bar.id ? { ...b, value: Number(e.target.value) || 0 } : b
                          );
                          onChange({ progressBarItems: items });
                        }}
                        className="h-6 text-xs text-center flex-1"
                        min={0}
                        max={100}
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => onChange({ progressBarItems: (element.progressBarItems || []).filter(b => b.id !== bar.id) })}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    const items = [...(element.progressBarItems || [])];
                    const colors = ['#EF4444', '#23C55E', '#FACC16', '#3b82f6', '#8b5cf6'];
                    items.push({
                      id: crypto.randomUUID(),
                      label: `Item ${items.length + 1}`,
                      value: 50,
                      color: colors[items.length % colors.length],
                    });
                    onChange({ progressBarItems: items });
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> adicionar barra
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

          </>)}

          {/* ═══════ APARÊNCIA TAB ═══════ */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              {!['divider', 'spacer', 'columns'].includes(element.type) && (
                <AlignmentSelector
                  value={element.style?.textAlign as any}
                  onChange={v => updateStyle({ textAlign: v })}
                />
              )}



              <ColorPickerField
                label="Cor do texto"
                value={element.style?.color || ''}
                onChange={v => updateStyle({ color: v || undefined })}
                placeholder="Padrão"
                defaultColor="#000000"
              />

              <TypographySelector
                fontFamily={element.style?.fontFamily}
                fontWeight={element.style?.fontWeight}
                onFontFamilyChange={v => updateStyle({ fontFamily: v })}
                onFontWeightChange={v => updateStyle({ fontWeight: v })}
              />

              {/* Rating/NPS colors */}
              {(element.type === 'input_rating' || element.type === 'input_nps') && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores da avaliação</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Ativo"
                      value={element.ratingActiveColor || (element.type === 'input_nps' ? '#22c55e' : '#facc15')}
                      onChange={v => onChange({ ratingActiveColor: v })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Inativo"
                      value={element.ratingInactiveColor || '#d1d5db'}
                      onChange={v => onChange({ ratingInactiveColor: v })}
                      allowTransparent={false}
                      defaultColor="#d1d5db"
                    />
                  </div>
                </div>
              )}

              {/* Loading colors */}
              {element.type === 'loading' && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores do loading</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Preenchimento"
                      value={element.loadingColor || '#6366f1'}
                      onChange={v => onChange({ loadingColor: v })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Trilho"
                      value={element.loadingTrackColor || '#e5e7eb'}
                      onChange={v => onChange({ loadingTrackColor: v })}
                      allowTransparent={false}
                      defaultColor="#e5e7eb"
                    />
                    <ColorPickerField
                      label="Texto"
                      value={element.loadingTextColor || '#1a1a1a'}
                      onChange={v => onChange({ loadingTextColor: v })}
                      allowTransparent={false}
                    />
                  </div>
                </div>
              )}

              {/* Horizontal Bar colors */}
              {element.type === 'horizontal_bar' && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores da barra</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Barra"
                      value={element.horizontalBarColor || '#6366f1'}
                      onChange={v => onChange({ horizontalBarColor: v || '#6366f1' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Fundo"
                      value={element.horizontalBarBackground || '#e5e7eb'}
                      onChange={v => onChange({ horizontalBarBackground: v || '#e5e7eb' })}
                      allowTransparent={false}
                      defaultColor="#e5e7eb"
                    />
                    <ColorPickerField
                      label="Valor"
                      value={element.horizontalBarValueColor || element.horizontalBarColor || '#6366f1'}
                      onChange={v => onChange({ horizontalBarValueColor: v || undefined })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Label"
                      value={element.horizontalBarLabelColor || '#000000'}
                      onChange={v => onChange({ horizontalBarLabelColor: v || '#000000' })}
                      allowTransparent={false}
                      defaultColor="#000000"
                    />
                  </div>
                </div>
              )}

              {/* Timer specific colors */}
              {element.type === 'timer' && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores do timer</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Dígitos"
                      value={element.timerDigitColor || '#ffffff'}
                      onChange={v => onChange({ timerDigitColor: v || '#ffffff' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Fundo box"
                      value={element.timerBoxBackground || '#EF4444'}
                      onChange={v => onChange({ timerBoxBackground: v || '#EF4444' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Texto/Label"
                      value={element.timerLabelColor || '#1a1a1a'}
                      onChange={v => onChange({ timerLabelColor: v || '#1a1a1a' })}
                      allowTransparent={false}
                      defaultColor="#1a1a1a"
                    />
                    <ColorPickerField
                      label="Separador"
                      value={element.timerSeparatorColor || '#1a1a1a'}
                      onChange={v => onChange({ timerSeparatorColor: v || '#1a1a1a' })}
                      allowTransparent={false}
                      defaultColor="#1a1a1a"
                    />
                  </div>
                </div>
              )}

              {/* List appearance */}
              {element.type === 'list' && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Ícone / Marcador"
                      value={element.listIconColor || '#22c55e'}
                      onChange={v => onChange({ listIconColor: v || '#22c55e' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Texto"
                      value={element.listTextColor || '#1a1a1a'}
                      onChange={v => onChange({ listTextColor: v || '#1a1a1a' })}
                      allowTransparent={false}
                    />
                  </div>
                </div>
              )}

              {/* Circular Progress appearance */}
              {element.type === 'circular_progress' && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <ColorPickerField
                      label="Progresso"
                      value={element.circularProgressColor || '#22c55e'}
                      onChange={v => onChange({ circularProgressColor: v || '#22c55e' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Trilho"
                      value={element.circularProgressTrackColor || '#e5e7eb'}
                      onChange={v => onChange({ circularProgressTrackColor: v || '#e5e7eb' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Percentual"
                      value={element.circularProgressTextColor || '#1a1a1a'}
                      onChange={v => onChange({ circularProgressTextColor: v || '#1a1a1a' })}
                      allowTransparent={false}
                    />
                    <ColorPickerField
                      label="Labels"
                      value={element.circularProgressLabelColor || '#6b7280'}
                      onChange={v => onChange({ circularProgressLabelColor: v || '#6b7280' })}
                      allowTransparent={false}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Tamanho ({element.circularProgressSize || 160}px)</Label>
                    <Slider
                      value={[element.circularProgressSize || 160]}
                      onValueChange={([v]) => onChange({ circularProgressSize: v })}
                      min={80}
                      max={240}
                      step={4}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Espessura ({element.circularProgressStroke || 14}px)</Label>
                    <Slider
                      value={[element.circularProgressStroke || 14]}
                      onValueChange={([v]) => onChange({ circularProgressStroke: v })}
                      min={4}
                      max={30}
                      step={1}
                    />
                  </div>
                </div>
              )}

              {/* Progress Bar specific colors */}
              {element.type === 'progress_bar' && (element.progressBarItems || []).length > 0 && (
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Cores das barras</Label>
                  {(element.progressBarItems || []).map((bar) => (
                    <div key={bar.id} className="space-y-2 p-2.5 rounded-lg border border-border">
                      <p className="text-xs font-medium text-foreground truncate">{bar.label || 'Sem nome'}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <ColorPickerField
                          label="Barra"
                          value={bar.color}
                          onChange={v => {
                            const items = (element.progressBarItems || []).map(b =>
                              b.id === bar.id ? { ...b, color: v || bar.color } : b
                            );
                            onChange({ progressBarItems: items });
                          }}
                          allowTransparent={false}
                        />
                        <ColorPickerField
                          label="Fundo"
                          value={bar.barBackground || '#e5e7eb'}
                          onChange={v => {
                            const items = (element.progressBarItems || []).map(b =>
                              b.id === bar.id ? { ...b, barBackground: v || '#e5e7eb' } : b
                            );
                            onChange({ progressBarItems: items });
                          }}
                          allowTransparent={false}
                          defaultColor="#e5e7eb"
                        />
                        <ColorPickerField
                          label="Valor"
                          value={bar.valueColor || bar.color}
                          onChange={v => {
                            const items = (element.progressBarItems || []).map(b =>
                              b.id === bar.id ? { ...b, valueColor: v || bar.color } : b
                            );
                            onChange({ progressBarItems: items });
                          }}
                          allowTransparent={false}
                        />
                        <ColorPickerField
                          label="Texto"
                          value={bar.labelColor || '#000000'}
                          onChange={v => {
                            const items = (element.progressBarItems || []).map(b =>
                              b.id === bar.id ? { ...b, labelColor: v || '#000000' } : b
                            );
                            onChange({ progressBarItems: items });
                          }}
                          allowTransparent={false}
                          defaultColor="#000000"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Bar width control */}
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-muted-foreground">Largura das barras ({element.progressBarBarWidth || 120}px)</Label>
                    <Slider
                      value={[element.progressBarBarWidth || 120]}
                      onValueChange={([v]) => onChange({ progressBarBarWidth: v })}
                      min={40}
                      max={200}
                      step={4}
                    />
                  </div>

                  {/* Column border settings (shared) */}
                  <Label className="text-xs font-medium text-muted-foreground mt-4">Bordas das colunas</Label>
                  <div className="space-y-2 p-2.5 rounded-lg border border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">Largura</span>
                        <Input
                          type="number"
                          value={element.progressBarColBorderWidth ?? ''}
                          onChange={e => onChange({ progressBarColBorderWidth: e.target.value ? Number(e.target.value) : undefined })}
                          placeholder="1"
                          className="h-8 text-xs"
                          min={0}
                          max={20}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] text-muted-foreground">Estilo</span>
                        <Select
                          value={element.progressBarColBorderStyle || 'solid'}
                          onValueChange={v => onChange({ progressBarColBorderStyle: v as any })}
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
                    <ColorPickerField
                      label="Cor da borda"
                      value={element.progressBarColBorderColor || ''}
                      onChange={v => onChange({ progressBarColBorderColor: v || undefined })}
                      placeholder="Padrão"
                      defaultColor="rgba(0,0,0,0.12)"
                    />
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Arredondamento ({element.progressBarColBorderRadius ?? 8}px)</span>
                      <Slider
                        value={[element.progressBarColBorderRadius ?? 8]}
                        onValueChange={([v]) => onChange({ progressBarColBorderRadius: v })}
                        min={0}
                        max={50}
                        step={1}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════ EXTERIOR TAB ═══════ */}
          {activeTab === 'exterior' && (
            <div className="space-y-4">
              <ColorPickerField
                label="Cor do fundo"
                value={element.style?.backgroundColor || ''}
                onChange={v => updateStyle({ backgroundColor: v || undefined })}
                placeholder="Transparente"
                defaultColor="#ffffff"
              />

              <BorderSettings
                borderWidth={element.style?.borderWidth}
                borderStyle={element.style?.borderStyle}
                borderColor={element.style?.borderColor}
                borderRadius={element.style?.borderRadius}
                onChange={updateStyle}
              />

              <ShadowSelector
                value={element.style?.boxShadow}
                onChange={v => updateStyle({ boxShadow: v })}
              />

              <SpacingControl
                property="padding"
                label="Padding"
                value={element.style?.padding}
                sides={{
                  top: element.style?.paddingTop,
                  right: element.style?.paddingRight,
                  bottom: element.style?.paddingBottom,
                  left: element.style?.paddingLeft,
                }}
                onChange={updateStyle}
              />

              <SpacingControl
                property="margin"
                label="Margem"
                value={element.style?.margin}
                sides={{
                  top: element.style?.marginTop,
                  right: element.style?.marginRight,
                  bottom: element.style?.marginBottom,
                  left: element.style?.marginLeft,
                }}
                onChange={updateStyle}
              />

              {['button', 'image', 'divider'].includes(element.type) && (
                <WidthSelector
                  value={element.style?.width}
                  onChange={v => updateStyle({ width: v })}
                />
              )}
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
