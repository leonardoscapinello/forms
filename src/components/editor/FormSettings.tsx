import { useState, useMemo } from 'react';
import type { FormData } from '@/types/form';
import { FormPixelEvent, AnalyticsPlatform, PixelEventType, TrackedParam, DEFAULT_TRACKED_PARAMS, UserDataMapping } from '@/types/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Facebook, BarChart3, Music2, Linkedin, Plus, Trash2, Zap, Globe, Save, RotateCcw, MapPin, Link2, Mail, Phone, User, ChevronDown, ChevronUp, Brain, Lock } from 'lucide-react';


interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

const PLATFORMS: { value: AnalyticsPlatform; label: string; icon: React.ElementType }[] = [
  { value: 'meta_pixel',        label: 'Meta Pixel',        icon: Facebook  },
  { value: 'google_analytics',  label: 'Google Analytics',  icon: BarChart3 },
  { value: 'tiktok_pixel',      label: 'TikTok Pixel',      icon: Music2    },
  { value: 'linkedin_pixel',    label: 'LinkedIn Pixel',    icon: Linkedin  },
];

const LOAD_EVENTS: { value: PixelEventType | 'PageView'; label: string }[] = [
  { value: 'PageView',             label: 'PageView (padrão)' },
  { value: 'ViewContent',          label: 'ViewContent' },
  { value: 'Lead',                 label: 'Lead' },
  { value: 'InitiateCheckout',     label: 'InitiateCheckout' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration' },
  { value: 'Purchase',             label: 'Purchase' },
  { value: 'AddToCart',            label: 'AddToCart' },
  { value: 'Contact',              label: 'Contact' },
  { value: 'Search',               label: 'Search' },
  { value: 'SubmitApplication',    label: 'SubmitApplication' },
  { value: 'custom',               label: 'Evento customizado...' },
];

function LeadFieldSelector({ label, icon: Icon, value, elements, filterTypes, onChange }: {
  label: string;
  icon: React.ElementType;
  value?: string;
  elements: { id: string; label: string; type: string }[];
  filterTypes?: string[];
  onChange: (val: string) => void;
}) {
  const filtered = filterTypes ? elements.filter(e => filterTypes.includes(e.type)) : elements;
  const allOptions = filterTypes
    ? [...filtered, ...elements.filter(e => !filterTypes.includes(e.type))]
    : elements;

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </label>
      <Select value={value || '__auto__'} onValueChange={v => onChange(v === '__auto__' ? '' : v)}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Auto-detectar" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__auto__" className="text-xs text-muted-foreground">Auto-detectar (primeiro)</SelectItem>
          <SelectItem value="__none__" className="text-xs text-muted-foreground">Não enviar</SelectItem>
          {allOptions.map(el => (
            <SelectItem key={el.id} value={el.id} className="text-xs">
              {el.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function FormSettings({ form, onUpdate }: Props) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const formElements = useMemo(() => {
    const els: { id: string; label: string; type: string }[] = [];
    for (const page of form.pages || []) {
      for (const el of page.elements || []) {
        if (el.type?.startsWith('input_')) {
          els.push({
            id: el.id,
            label: el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '),
            type: el.type,
          });
        }
      }
    }
    return els;
  }, [form.pages]);

  const events: FormPixelEvent[] = form.pixelLoadEvents || [];
  const trackedParams: TrackedParam[] = form.trackedParams || DEFAULT_TRACKED_PARAMS;

  const addEvent = () => {
    const newEvent: FormPixelEvent = {
      id: crypto.randomUUID(),
      platform: 'meta_pixel',
      eventType: 'PageView',
    };
    onUpdate({ pixelLoadEvents: [...events, newEvent] });
  };

  const updateEvent = (id: string, patch: Partial<FormPixelEvent>) => {
    onUpdate({
      pixelLoadEvents: events.map(e => e.id === id ? { ...e, ...patch } : e),
    });
  };

  const removeEvent = (id: string) => {
    onUpdate({ pixelLoadEvents: events.filter(e => e.id !== id) });
  };

  // Tracked params helpers
  const updateTrackedParams = (next: TrackedParam[]) => {
    onUpdate({ trackedParams: next });
  };

  const toggleParam = (id: string) => {
    updateTrackedParams(trackedParams.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const removeParam = (id: string) => {
    updateTrackedParams(trackedParams.filter(p => p.id !== id));
  };

  const addParam = () => {
    const newParam: TrackedParam = {
      id: crypto.randomUUID(),
      key: '',
      label: '',
      enabled: true,
    };
    updateTrackedParams([...trackedParams, newParam]);
  };

  const updateParam = (id: string, patch: Partial<TrackedParam>) => {
    updateTrackedParams(trackedParams.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Configurações do formulário</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Defina comportamentos globais e a aparência do formulário.
          </p>
        </div>


        {/* ─── Tracked GET Parameters ─── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Parâmetros GET rastreados</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                Parâmetros da URL capturados e exibidos na tabela de respostas e Google Sheets.
                <br />
                <span className="text-muted-foreground/70">O webhook e o banco de dados sempre recebem todos os parâmetros, independente desta configuração.</span>
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addParam}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Adicionar
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            {trackedParams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum parâmetro configurado.
              </p>
            ) : (
              trackedParams.map(param => (
                <div key={param.id} className="flex items-center gap-3 py-1.5">
                  <Switch
                    checked={param.enabled}
                    onCheckedChange={() => toggleParam(param.id)}
                    className="shrink-0"
                  />
                  <Input
                    value={param.key}
                    onChange={e => updateParam(param.id, { key: e.target.value })}
                    placeholder="nome_do_parametro"
                    className="h-8 text-xs font-mono flex-1 max-w-[200px]"
                  />
                  <Input
                    value={param.label || ''}
                    onChange={e => updateParam(param.id, { label: e.target.value })}
                    placeholder="Label (opcional)"
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeParam(param.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pixel Load Events */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-node-analytics-accent" />
                <h3 className="text-sm font-semibold text-foreground">Eventos no carregamento</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                Disparados assim que o formulário é carregado — ideal para PageView, ViewContent, etc.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addEvent}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Adicionar evento
            </Button>
          </div>

          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 flex flex-col items-center gap-2">
              <Zap className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground text-center">
                Nenhum evento configurado.<br />
                Adicione um evento para disparar ao carregar o formulário.
              </p>
              <Button variant="outline" size="sm" onClick={addEvent} className="mt-1">
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Adicionar evento
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map(event => {
                const platformCfg = PLATFORMS.find(p => p.value === event.platform) ?? PLATFORMS[0];
                const PIcon = platformCfg.icon;
                return (
                  <div
                    key={event.id}
                    className="rounded-xl border border-border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PIcon className="h-4 w-4 text-node-analytics-accent" />
                        <span className="text-sm font-medium text-foreground">{platformCfg.label}</span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">
                          {event.eventType === 'custom' ? (event.customEventName || 'CustomEvent') : event.eventType}
                        </span>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEvent(event.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Plataforma</span>
                        <Select
                          value={event.platform}
                          onValueChange={val => updateEvent(event.id, { platform: val as AnalyticsPlatform })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PLATFORMS.map(p => {
                              const Icon = p.icon;
                              return (
                                <SelectItem key={p.value} value={p.value} className="text-xs">
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-3.5 w-3.5" />
                                    <span>{p.label}</span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evento</span>
                        <Select
                          value={event.eventType}
                          onValueChange={val => updateEvent(event.id, { eventType: val as PixelEventType | 'PageView' })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LOAD_EVENTS.map(e => (
                              <SelectItem key={e.value} value={e.value} className="text-xs">
                                {e.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {event.eventType === 'custom' && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Nome do evento</span>
                        <Input
                          value={event.customEventName || ''}
                          onChange={e => updateEvent(event.id, { customEventName: e.target.value })}
                          placeholder="NomeDoEvento"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}

                    {/* Lead data mapping (collapsible) */}
                    <div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                        onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                      >
                        {expandedEventId === event.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        <User className="h-3 w-3" />
                        Dados do lead
                      </button>
                      {expandedEventId === event.id && (
                        <div className="mt-2 space-y-1.5 bg-muted/30 rounded-lg p-2.5">
                          <LeadFieldSelector
                            label="E-mail"
                            icon={Mail}
                            value={event.userDataMapping?.emailElementId}
                            elements={formElements}
                            filterTypes={['input_email']}
                            onChange={v => updateEvent(event.id, { userDataMapping: { ...event.userDataMapping, emailElementId: v } })}
                          />
                          <LeadFieldSelector
                            label="Telefone"
                            icon={Phone}
                            value={event.userDataMapping?.phoneElementId}
                            elements={formElements}
                            filterTypes={['input_phone']}
                            onChange={v => updateEvent(event.id, { userDataMapping: { ...event.userDataMapping, phoneElementId: v } })}
                          />
                          <LeadFieldSelector
                            label="Nome"
                            icon={User}
                            value={event.userDataMapping?.nameElementId}
                            elements={formElements}
                            filterTypes={['input_short_text', 'input_text']}
                            onChange={v => updateEvent(event.id, { userDataMapping: { ...event.userDataMapping, nameElementId: v } })}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {events.length > 0 && (
            <p className="text-xs text-muted-foreground">
              💡 Os pixels precisam estar configurados em{' '}
              <strong>Configurações → Integrações</strong> com os IDs corretos para os eventos serem disparados.
            </p>
          )}
        </div>

        {/* ─── Respostas & Retomada ─── */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Respostas</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">
              Controle como respostas completas e parciais são armazenadas.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Salvar respostas parciais</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Grava respostas mesmo que o respondente não finalize o formulário.
                </p>
              </div>
              <Switch
                checked={form.savePartialResponses ?? true}
                onCheckedChange={v => onUpdate({ savePartialResponses: v })}
              />
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-sm">Permitir retomada</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O respondente pode continuar de onde parou se voltar ao formulário.
                </p>
              </div>
              <Switch
                checked={form.allowResume ?? false}
                onCheckedChange={v => onUpdate({ allowResume: v })}
              />
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-sm">Capturar geolocalização</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Detecta cidade, estado e país do respondente via IP ou GPS.
                </p>
              </div>
              <Switch
                checked={form.enableGeolocation ?? true}
                onCheckedChange={v => onUpdate({ enableGeolocation: v })}
              />
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Barra de progresso</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Exibe o progresso do respondente no topo do formulário.
                </p>
              </div>
              <Switch
                checked={form.showProgressBar !== false}
                onCheckedChange={v => onUpdate({ showProgressBar: v })}
              />
            </div>

            <div className="border-t border-border" />

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label className="text-sm">Análise de emoções (IA)</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Avalia sentimento, arquétipo psicológico, intenção de compra e gatilhos emocionais de cada resposta usando IA.
                </p>
              </div>
              <Switch
                checked={form.enableSentimentAnalysis ?? false}
                onCheckedChange={v => onUpdate({ enableSentimentAnalysis: v })}
              />
            </div>
          </div>
        </div>

        {/* ─── Encerrar formulário ─── */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-semibold text-foreground">Encerrar formulário</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">
              Fecha o formulário para novas respostas. Quem tentar acessar verá uma mensagem ou será redirecionado.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Formulário fechado</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quando ativo, ninguém poderá enviar novas respostas.
                </p>
              </div>
              <Switch
                checked={form.status === 'closed'}
                onCheckedChange={v => onUpdate({ status: v ? 'closed' : 'published' })}
              />
            </div>

            {form.status === 'closed' && (
              <>
                <div className="border-t border-border" />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Mensagem de encerramento</Label>
                  <Input
                    value={form.closedMessage || ''}
                    onChange={e => onUpdate({ closedMessage: e.target.value })}
                    placeholder="Este formulário não está mais aceitando respostas."
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">URL de redirecionamento (opcional)</Label>
                  <Input
                    value={form.closedRedirectUrl || ''}
                    onChange={e => onUpdate({ closedRedirectUrl: e.target.value })}
                    placeholder="https://seusite.com/obrigado"
                    className="text-xs font-mono h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Se preenchido, o respondente será redirecionado ao invés de ver a mensagem.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Webhook de conclusão ─── */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-node-webhook-accent" />
              <h3 className="text-sm font-semibold text-foreground">Webhook de conclusão</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 ml-6">
              Envia automaticamente um POST com todos os dados ao finalizar o formulário.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">URL do endpoint</Label>
              <Input
                value={form.completionWebhookUrl || ''}
                onChange={e => onUpdate({ completionWebhookUrl: e.target.value })}
                placeholder="https://api.exemplo.com/webhook"
                className="text-xs font-mono h-9"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              O payload inclui respostas tipadas, variáveis, metadados do respondente e parâmetros de URL.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}