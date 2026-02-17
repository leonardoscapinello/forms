import { useState, useEffect, useCallback } from 'react';
import { FormData, FormPixelEvent, AnalyticsPlatform, PixelEventType } from '@/types/form';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
  Facebook, BarChart3, Music2, Linkedin, Plus, Trash2, Zap,
  Activity, TrendingUp, Clock, CheckCircle2, XCircle, RefreshCw,
  Webhook, Globe, User, MousePointerClick, AlertCircle, BarChart2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

interface PixelEventLogRow {
  id: string;
  form_id: string;
  response_id: string | null;
  platform: string;
  event_name: string;
  event_id: string | null;
  trigger_type: string;
  fired_client: boolean;
  fired_server: boolean;
  server_response: Record<string, any> | null;
  source_url: string | null;
  user_agent: string | null;
  custom_params: Record<string, any> | null;
  created_at: string;
}

const PLATFORMS: { value: AnalyticsPlatform; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'meta_pixel', label: 'Meta Pixel', icon: Facebook, color: 'text-blue-500' },
  { value: 'google_analytics', label: 'Google Analytics', icon: BarChart3, color: 'text-orange-500' },
  { value: 'tiktok_pixel', label: 'TikTok Pixel', icon: Music2, color: 'text-foreground' },
  { value: 'linkedin_pixel', label: 'LinkedIn Pixel', icon: Linkedin, color: 'text-sky-600' },
];

const LOAD_EVENTS: { value: PixelEventType | 'PageView'; label: string }[] = [
  { value: 'PageView', label: 'PageView (padrão)' },
  { value: 'ViewContent', label: 'ViewContent' },
  { value: 'Lead', label: 'Lead' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout' },
  { value: 'CompleteRegistration', label: 'CompleteRegistration' },
  { value: 'Purchase', label: 'Purchase' },
  { value: 'AddToCart', label: 'AddToCart' },
  { value: 'Contact', label: 'Contact' },
  { value: 'Search', label: 'Search' },
  { value: 'SubmitApplication', label: 'SubmitApplication' },
  { value: 'custom', label: 'Evento customizado...' },
];

const PLATFORM_COLORS: Record<string, string> = {
  meta_pixel: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  google_analytics: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  tiktok_pixel: 'bg-foreground/10 text-foreground border-foreground/20',
  linkedin_pixel: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  webhook: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
};

const PLATFORM_LABELS: Record<string, string> = {
  meta_pixel: 'Meta',
  google_analytics: 'GA4',
  tiktok_pixel: 'TikTok',
  linkedin_pixel: 'LinkedIn',
  webhook: 'Webhook',
};

const TRIGGER_LABELS: Record<string, string> = {
  load_event: 'Carregamento',
  flow_node: 'Nó do Workflow',
};

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cfg = PLATFORMS.find(p => p.value === platform);
  if (!cfg) return <Webhook className={className} />;
  const Icon = cfg.icon;
  return <Icon className={className} />;
}

// ─── Monitoring Panel ────────────────────────────────────────────────────────

function MonitoringPanel({ formId }: { formId: string }) {
  const [logs, setLogs] = useState<PixelEventLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('pixel_events_log')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as PixelEventLogRow[]) || []);
    setLoading(false);
  }, [formId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.platform === filter);

  // ── Stats ──
  const totalFired = logs.length;
  const clientFired = logs.filter(l => l.fired_client).length;
  const serverFired = logs.filter(l => l.fired_server).length;
  const byPlatform = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.platform] = (acc[l.platform] || 0) + 1;
    return acc;
  }, {});
  const topEvent = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.event_name] = (acc[l.event_name] || 0) + 1;
    return acc;
  }, {});
  const topEventName = Object.entries(topEvent).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Total disparado" value={totalFired} />
        <KpiCard icon={<Globe className="h-4 w-4" />} label="Client-side" value={clientFired} />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Server-side (CAPI)" value={serverFired} />
        <KpiCard icon={<MousePointerClick className="h-4 w-4" />} label="Evento mais comum" value={topEventName || '—'} small />
      </div>

      {/* Platform breakdown */}
      {Object.keys(byPlatform).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Por plataforma</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byPlatform).map(([plt, count]) => (
              <div key={plt} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${PLATFORM_COLORS[plt] || 'bg-muted text-muted-foreground border-border'}`}>
                <PlatformIcon platform={plt} className="h-3 w-3" />
                {PLATFORM_LABELS[plt] || plt} · {count}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Log de eventos</p>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todas plataformas</SelectItem>
                {PLATFORMS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
            <BarChart2 className="h-8 w-8 opacity-30" />
            <span className="text-sm">Nenhum evento registrado ainda.</span>
            <span className="text-xs">Quando pixels forem disparados, eles aparecerão aqui.</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredLogs.map(log => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogRow({ log }: { log: PixelEventLogRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded(v => !v)}>
      <div className="flex items-center gap-3">
        {/* Platform badge */}
        <div className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${PLATFORM_COLORS[log.platform] || 'bg-muted text-muted-foreground border-border'}`}>
          <PlatformIcon platform={log.platform} className="h-3 w-3" />
          {PLATFORM_LABELS[log.platform] || log.platform}
        </div>

        {/* Event name */}
        <span className="text-xs font-mono font-medium text-foreground">{log.event_name}</span>

        {/* Trigger type */}
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground">
          {TRIGGER_LABELS[log.trigger_type] || log.trigger_type}
        </Badge>

        {/* Fire indicators */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-muted-foreground">Client</span>
          {log.fired_client
            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
          <span className="text-[10px] text-muted-foreground ml-1">Server</span>
          {log.fired_server
            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
        </div>

        {/* Time */}
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-2 pl-1">
          <DetailRow label="Event ID" value={log.event_id} mono />
          <DetailRow label="Source URL" value={log.source_url} />
          <DetailRow label="Response ID" value={log.response_id} mono />
          {log.user_agent && <DetailRow label="User Agent" value={log.user_agent} />}
          {log.custom_params && Object.keys(log.custom_params).length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Parâmetros customizados</p>
              <pre className="text-[10px] bg-muted rounded p-2 overflow-x-auto text-foreground/80">
                {JSON.stringify(log.custom_params, null, 2)}
              </pre>
            </div>
          )}
          {log.server_response && (
            <div className="mt-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Resposta do servidor</p>
              <pre className="text-[10px] bg-muted rounded p-2 overflow-x-auto text-foreground/80">
                {JSON.stringify(log.server_response, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-medium text-muted-foreground min-w-[80px]">{label}</span>
      <span className={`text-[10px] text-foreground/70 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function KpiCard({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-bold text-foreground ${small ? 'text-base truncate' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}

// ─── Load Events Config Panel ─────────────────────────────────────────────────

function LoadEventsPanel({ form, onUpdate }: Props) {
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
    onUpdate({ pixelLoadEvents: events.map(e => e.id === id ? { ...e, ...patch } : e) });
  };

  const removeEvent = (id: string) => {
    onUpdate({ pixelLoadEvents: events.filter(e => e.id !== id) });
  };

  return (
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
              <div key={event.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PIcon className={`h-4 w-4 ${platformCfg.color}`} />
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
                    <Select value={event.platform} onValueChange={val => updateEvent(event.id, { platform: val as AnalyticsPlatform })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map(p => {
                          const Icon = p.icon;
                          return (
                            <SelectItem key={p.value} value={p.value} className="text-xs">
                              <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" /><span>{p.label}</span></div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evento</span>
                    <Select value={event.eventType} onValueChange={val => updateEvent(event.id, { eventType: val as PixelEventType | 'PageView' })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOAD_EVENTS.map(e => (
                          <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>
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
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div className="rounded-lg bg-muted/40 border border-border px-3.5 py-2.5 text-[11px] text-muted-foreground leading-relaxed flex gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Os pixels precisam estar configurados em{' '}
            <strong>Configurações → Integrações</strong> com os IDs corretos para os eventos serem disparados.
            Após disparar, os eventos aparecem no <strong>Monitor de Eventos</strong> acima.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FormAnalytics({ form, onUpdate }: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-2">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-node-analytics-accent/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-node-analytics-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Análiticas & Pixels</h2>
              <p className="text-xs text-muted-foreground">
                Configure eventos de pixel e monitore todos os disparos em tempo real.
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="monitor">
          <TabsList className="mb-6 bg-muted/40 h-auto p-1">
            <TabsTrigger value="monitor" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <Activity className="h-3.5 w-3.5" />
              Monitor de Eventos
            </TabsTrigger>
            <TabsTrigger value="load-events" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <Zap className="h-3.5 w-3.5" />
              Eventos de Carregamento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitor">
            <MonitoringPanel formId={form.id} />
          </TabsContent>

          <TabsContent value="load-events">
            <LoadEventsPanel form={form} onUpdate={onUpdate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
