import { useState } from 'react';
import { FormData, FormPixelEvent, AnalyticsPlatform, PixelEventType } from '@/types/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Facebook, BarChart3, Music2, Linkedin, Plus, Trash2, Zap, Globe, Save, RotateCcw } from 'lucide-react';

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

export default function FormSettings({ form, onUpdate }: Props) {
  const events: FormPixelEvent[] = form.pixelLoadEvents || [];

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

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Configurações do formulário</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Defina comportamentos globais aplicados a este formulário.
          </p>
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
                      {/* Platform */}
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

                      {/* Event type */}
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

                    {/* Custom event name */}
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
