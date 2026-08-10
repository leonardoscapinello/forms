import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Webhook, Globe, MousePointerClick, BarChart2, Users, Target,
  ArrowRight, TrendingDown, AlertCircle, ChevronDown, ChevronRight as ChevronRightIcon,
  Eye, Layers,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { formatDistanceToNow, format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  form_id: string;
  response_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  last_seen_at: string;
  current_page_index: number;
  pages_visited: number;
  total_pages: number | null;
  source_url: string | null;
  referrer: string | null;
  user_agent: string | null;
  query_params: Record<string, string> | null;
  created_at: string;
}

interface PageEventRow {
  id: string;
  session_id: string | null;
  form_id: string;
  response_id: string;
  page_id: string | null;
  page_index: number | null;
  page_title: string | null;
  event_type: string;
  time_on_page_ms: number | null;
  created_at: string;
}

interface PixelLogRow {
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

// ─── Constants ────────────────────────────────────────────────────────────────

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
  tiktok_pixel: 'bg-muted text-foreground border-border',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const cfg = PLATFORMS.find(p => p.value === platform);
  if (!cfg) return <Webhook className={className} />;
  const Icon = cfg.icon;
  return <Icon className={className} />;
}

function isPixelSuccess(log: PixelLogRow): boolean {
  if (!log.fired_server) return false;
  const r = log.server_response;
  if (!r) return false;
  // Meta: events_received > 0
  if (log.platform === 'meta_pixel') {
    const meta = r.meta;
    return meta?.ok === true && meta?.data?.events_received > 0;
  }
  // GA4: 204 or ok
  if (log.platform === 'google_analytics') return r.ga4?.ok === true;
  // TikTok: code === 0
  if (log.platform === 'tiktok_pixel') return r.tiktok?.ok === true && r.tiktok?.data?.code === 0;
  // LinkedIn: ok
  if (log.platform === 'linkedin_pixel') return r.linkedin?.ok === true;
  return log.fired_server;
}

function msToReadable(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useAnalyticsData(formId: string) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [pageEvents, setPageEvents] = useState<PageEventRow[]>([]);
  const [pixelLogs, setPixelLogs] = useState<PixelLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, pRes, plRes] = await Promise.all([
      (supabase as any).from('form_sessions').select('*').eq('form_id', formId).order('created_at', { ascending: false }).limit(500),
      (supabase as any).from('form_page_events').select('*').eq('form_id', formId).order('created_at', { ascending: false }).limit(2000),
      (supabase as any).from('pixel_events_log').select('*').eq('form_id', formId).order('created_at', { ascending: false }).limit(500),
    ]);
    setSessions(sRes.data || []);
    setPageEvents(pRes.data || []);
    setPixelLogs(plRes.data || []);
    setLoading(false);
    setLoadedAt(Date.now());
  }, [formId]);

  useEffect(() => { load(); }, [load]);

  return { sessions, pageEvents, pixelLogs, loading, refresh: load, loadedAt };
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, trend, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 text-muted-foreground text-xs ${color || ''}`}>
          {icon}
          <span>{label}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-[10px] font-medium ${trend >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ sessions, pixelLogs, pageEvents }: {
  sessions: SessionRow[];
  pixelLogs: PixelLogRow[];
  pageEvents: PageEventRow[];
}) {
  const total = sessions.length;
  const completed = sessions.filter(s => s.status === 'completed').length;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  const avgPagesVisited = total > 0
    ? sessions.reduce((a, s) => a + (s.pages_visited || 0), 0) / total
    : 0;

  const pixelTotal = pixelLogs.length;
  const pixelSuccess = pixelLogs.filter(isPixelSuccess).length;
  const pixelSuccessRate = pixelTotal > 0 ? (pixelSuccess / pixelTotal) * 100 : 0;

  // Sessions over last 30 days
  const days = useMemo(() => eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }), []);
  const sessionsByDay = useMemo(() => {
    return days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const count = sessions.filter(s => s.created_at.startsWith(dayStr)).length;
      const done = sessions.filter(s => s.created_at.startsWith(dayStr) && s.status === 'completed').length;
      return { date: format(day, 'dd/MM', { locale: ptBR }), sessions: count, completed: done };
    });
  }, [sessions, days]);

  // Pixel platform breakdown
  const byPlatform = useMemo(() => {
    const acc: Record<string, { total: number; success: number }> = {};
    for (const log of pixelLogs) {
      if (!acc[log.platform]) acc[log.platform] = { total: 0, success: 0 };
      acc[log.platform].total += 1;
      if (isPixelSuccess(log)) acc[log.platform].success += 1;
    }
    return Object.entries(acc).map(([platform, v]) => ({
      platform,
      label: PLATFORM_LABELS[platform] || platform,
      ...v,
      rate: v.total > 0 ? Math.round((v.success / v.total) * 100) : 0,
    }));
  }, [pixelLogs]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Sessões totais"
          value={total}
          sub="formulário aberto"
        />
        <KpiCard
          icon={<Target className="h-4 w-4" />}
          label="Taxa de conclusão"
          value={`${completionRate.toFixed(1)}%`}
          sub={`${completed} de ${total} concluídos`}
        />
        <KpiCard
          icon={<Layers className="h-4 w-4" />}
          label="Páginas por sessão"
          value={avgPagesVisited.toFixed(1)}
          sub="média de páginas vistas"
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          label="Pixels disparados"
          value={pixelTotal}
          sub={pixelTotal > 0 ? `${pixelSuccessRate.toFixed(0)}% confirmados` : 'Nenhum configurado'}
        />
      </div>

      {/* Sessions over time */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Sessões nos últimos 30 dias</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={sessionsByDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#B3AB86" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#B3AB86" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6B8A2A" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#6B8A2A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Area type="monotone" dataKey="sessions" stroke="#B3AB86" fill="url(#gradSessions)" strokeWidth={2} name="Sessões" dot={false} />
            <Area type="monotone" dataKey="completed" stroke="#6B8A2A" fill="url(#gradCompleted)" strokeWidth={2} name="Concluídos" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pixel success per platform */}
      {byPlatform.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Taxa de confirmação por pixel</p>
          <div className="space-y-3">
            {byPlatform.map(p => (
              <div key={p.platform} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${PLATFORM_COLORS[p.platform] || 'bg-muted border-border text-foreground'}`}>
                    <PlatformIcon platform={p.platform} className="h-3 w-3" />
                    <span className="font-medium">{p.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{p.success}/{p.total} confirmados</span>
                    <span className={`font-semibold ${p.rate >= 80 ? 'text-green-600' : p.rate >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                      {p.rate}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${p.rate >= 80 ? 'bg-green-500' : p.rate >= 50 ? 'bg-yellow-500' : 'bg-destructive'}`}
                    style={{ width: `${p.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Funnel Tab ───────────────────────────────────────────────────────────────

function FunnelTab({ sessions, pageEvents, form }: {
  sessions: SessionRow[];
  pageEvents: PageEventRow[];
  form: FormData;
}) {
  const totalStarts = useMemo(() => {
    const unique = new Set(sessions.map(s => s.response_id));
    return unique.size;
  }, [sessions]);

  const funnelData = useMemo(() => {
    const pages = form.pages || [];
    return pages.map((page, idx) => {
      const reached = new Set(
        pageEvents.filter(e => e.page_index === idx && e.event_type === 'page_view').map(e => e.response_id)
      ).size;
      const prevReached = idx === 0 ? totalStarts : new Set(
        pageEvents.filter(e => e.page_index === idx - 1 && e.event_type === 'page_view').map(e => e.response_id)
      ).size;
      const pct = totalStarts > 0 ? (reached / totalStarts) * 100 : 0;
      const dropoff = prevReached > 0 ? ((prevReached - reached) / prevReached) * 100 : 0;
      return { idx, title: page.title || `Página ${idx + 1}`, reached, pct, dropoff };
    });
  }, [pageEvents, form.pages, totalStarts]);

  const completions = useMemo(
    () => new Set(pageEvents.filter(e => e.event_type === 'form_complete').map(e => e.response_id)).size,
    [pageEvents]
  );

  if (totalStarts === 0) {
    return (
      <EmptyState
        icon={<TrendingDown className="h-8 w-8" />}
        title="Sem dados de funil ainda"
        description="Os dados de progressão aparecem quando visitantes começam a preencher o formulário."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard icon={<Users className="h-4 w-4" />} label="Acessos" value={totalStarts} />
        <KpiCard icon={<Target className="h-4 w-4" />} label="Concluídos" value={completions} />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Taxa de conversão"
          value={`${totalStarts > 0 ? ((completions / totalStarts) * 100).toFixed(1) : 0}%`}
        />
      </div>

      {/* Funnel chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground mb-5">Progressão por página</p>
        <div className="space-y-2">
          {/* Start row */}
          <FunnelRow
            label="Início (formulário aberto)"
            count={totalStarts}
            pct={100}
            dropoff={0}
            isFirst
          />
          {funnelData.map((row) => (
            <FunnelRow
              key={row.idx}
              label={row.title}
              count={row.reached}
              pct={row.pct}
              dropoff={row.dropoff}
            />
          ))}
          {/* Completion row */}
          <FunnelRow
            label="✓ Formulário concluído"
            count={completions}
            pct={totalStarts > 0 ? (completions / totalStarts) * 100 : 0}
            dropoff={funnelData.length > 0
              ? ((funnelData[funnelData.length - 1]?.reached || 0) - completions) /
                Math.max(funnelData[funnelData.length - 1]?.reached || 1, 1) * 100
              : 0}
            isLast
          />
        </div>
      </div>
    </div>
  );
}

function FunnelRow({
  label, count, pct, dropoff, isFirst, isLast,
}: {
  label: string;
  count: number;
  pct: number;
  dropoff: number;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <div className={`rounded-lg p-3 ${isLast ? 'bg-[#B3AB86]/8 border border-[#B3AB86]/20' : 'bg-muted/30'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-xs font-medium ${isLast ? 'text-[#6B5D2F]' : 'text-foreground'}`}>{label}</span>
        <div className="flex items-center gap-3">
          {!isFirst && dropoff > 0 && (
            <span className="text-[10px] text-destructive font-medium flex items-center gap-0.5">
              <TrendingDown className="h-3 w-3" />
              -{dropoff.toFixed(0)}%
            </span>
          )}
          <span className="text-xs font-semibold text-foreground">{count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span></span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-background overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isLast ? 'bg-[#6B5D2F]' : 'bg-[#8A7D4A]'}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab({ sessions }: { sessions: SessionRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Nenhuma sessão registrada"
        description="As sessões aparecem quando visitantes acessam o formulário publicado."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{sessions.length} sessões</p>
        <p className="text-xs text-muted-foreground">Clique em uma linha para expandir</p>
      </div>
      <div className="divide-y divide-border">
        {sessions.map(session => (
          <div key={session.id}>
            <div
              className="px-4 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => setExpanded(expanded === session.id ? null : session.id)}
            >
              <div className="flex items-center gap-3">
                {/* Status */}
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  session.status === 'completed'
                    ? 'bg-[#B3AB86]/10 text-[#6B5D2F] border-[#B3AB86]/20'
                    : session.status === 'dropped'
                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : 'bg-muted text-muted-foreground border-border'
                }`}>
                  {session.status === 'completed'
                    ? <><CheckCircle2 className="h-3 w-3" /> Concluído</>
                    : session.status === 'dropped'
                    ? <><XCircle className="h-3 w-3" /> Abandonado</>
                    : <><Clock className="h-3 w-3" /> Ativo</>
                  }
                </span>

                {/* Pages */}
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {session.pages_visited || 0}{session.total_pages ? `/${session.total_pages}` : ''} páginas
                </span>

                {/* Source */}
                {session.source_url && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                    {new URL(session.source_url).pathname || '/'}
                  </span>
                )}

                <span className="ml-auto text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(session.created_at), { addSuffix: true, locale: ptBR })}
                </span>
                {expanded === session.id
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                }
              </div>
            </div>

            {expanded === session.id && (
              <div className="px-4 py-3 bg-muted/20 border-t border-border space-y-2">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  <SessionDetail label="Response ID" value={session.response_id} mono />
                  <SessionDetail label="Iniciado" value={format(new Date(session.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                  {session.completed_at && (
                    <SessionDetail label="Concluído" value={format(new Date(session.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} />
                  )}
                  {session.source_url && <SessionDetail label="URL" value={session.source_url} />}
                  {session.referrer && <SessionDetail label="Referrer" value={session.referrer} />}
                  {session.user_agent && <SessionDetail label="User Agent" value={session.user_agent} />}
                  {session.query_params && Object.keys(session.query_params).length > 0 && (
                    <div className="col-span-2">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">Query Params</p>
                      <pre className="text-[10px] bg-background rounded p-2 overflow-x-auto">
                        {JSON.stringify(session.query_params, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionDetail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-[80px]">{label}</span>
      <span className={`text-[10px] text-foreground/70 truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Pixel Monitor Tab ────────────────────────────────────────────────────────

function PixelMonitorTab({ pixelLogs, refresh, loading }: {
  pixelLogs: PixelLogRow[];
  refresh: () => void;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = filter === 'all' ? pixelLogs : pixelLogs.filter(l => l.platform === filter);

  const successCount = pixelLogs.filter(isPixelSuccess).length;
  const failCount = pixelLogs.length - successCount;

  return (
    <div className="space-y-4">
      {pixelLogs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard icon={<Activity className="h-4 w-4" />} label="Total disparado" value={pixelLogs.length} />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Confirmados" value={successCount} />
          <KpiCard icon={<XCircle className="h-4 w-4" />} label="Falhas / sem config" value={failCount} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Log de eventos de pixel</p>
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<BarChart2 className="h-7 w-7" />}
            title="Nenhum evento registrado"
            description="Configure pixels e visite o formulário para ver os disparos aqui."
            compact
          />
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(log => (
              <PixelLogRow
                key={log.id}
                log={log}
                expanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PixelLogRow({ log, expanded, onToggle }: { log: PixelLogRow; expanded: boolean; onToggle: () => void }) {
  const success = isPixelSuccess(log);

  return (
    <div className="px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={onToggle}>
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold shrink-0 ${PLATFORM_COLORS[log.platform] || 'bg-muted text-muted-foreground border-border'}`}>
          <PlatformIcon platform={log.platform} className="h-3 w-3" />
          {PLATFORM_LABELS[log.platform] || log.platform}
        </div>

        <span className="text-xs font-mono font-medium text-foreground">{log.event_name}</span>

        <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground">
          {log.trigger_type === 'load_event' ? 'Carregamento' : 'Workflow'}
        </Badge>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>Client</span>
            {log.fired_client
              ? <CheckCircle2 className="h-3.5 w-3.5 text-[#4A5D2F]" />
              : <XCircle className="h-3.5 w-3.5 text-muted-foreground/60" />}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>CAPI</span>
            {success
              ? <CheckCircle2 className="h-3.5 w-3.5 text-[#4A5D2F]" />
              : log.fired_server
              ? <AlertCircle className="h-3.5 w-3.5 text-destructive/70" />
              : <XCircle className="h-3.5 w-3.5 text-muted-foreground/60" />}
          </div>
        </div>

        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-1.5 pl-1">
          {log.event_id && <PixelDetail label="Event ID" value={log.event_id} mono />}
          {log.response_id && <PixelDetail label="Response ID" value={log.response_id} mono />}
          {log.source_url && <PixelDetail label="Source URL" value={log.source_url} />}
          {log.user_agent && <PixelDetail label="User Agent" value={log.user_agent} />}
          {log.custom_params && Object.keys(log.custom_params).length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Parâmetros customizados</p>
              <pre className="text-[10px] bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(log.custom_params, null, 2)}</pre>
            </div>
          )}
          {log.server_response && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                Resposta da API {success ? '✅' : '⚠️'}
              </p>
              <pre className="text-[10px] bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(log.server_response, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PixelDetail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-[80px]">{label}</span>
      <span className={`text-[10px] text-foreground/70 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Load Events Config Tab ────────────────────────────────────────────────────

function LoadEventsTab({ form, onUpdate }: Props) {
  const events: FormPixelEvent[] = form.pixelLoadEvents || [];

  const addEvent = () => {
    onUpdate({ pixelLoadEvents: [...events, { id: crypto.randomUUID(), platform: 'meta_pixel', eventType: 'PageView' }] });
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
            Disparados ao carregar o formulário — ideal para PageView, ViewContent, etc.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addEvent}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar evento
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-7 w-7" />}
          title="Nenhum evento configurado"
          description="Adicione um evento para disparar ao carregar o formulário."
          action={<Button variant="outline" size="sm" onClick={addEvent}><Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar evento</Button>}
        />
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const pCfg = PLATFORMS.find(p => p.value === event.platform) ?? PLATFORMS[0];
            const PIcon = pCfg.icon;
            return (
              <div key={event.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PIcon className={`h-4 w-4 ${pCfg.color}`} />
                    <span className="text-sm font-medium">{pCfg.label}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {event.eventType === 'custom' ? (event.customEventName || 'CustomEvent') : event.eventType}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeEvent(event.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Plataforma</span>
                    <Select value={event.platform} onValueChange={val => updateEvent(event.id, { platform: val as AnalyticsPlatform })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORMS.map(p => { const I = p.icon; return (
                          <SelectItem key={p.value} value={p.value} className="text-xs">
                            <div className="flex items-center gap-2"><I className="h-3.5 w-3.5" />{p.label}</div>
                          </SelectItem>
                        ); })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Evento</span>
                    <Select value={event.eventType} onValueChange={val => updateEvent(event.id, { eventType: val as PixelEventType | 'PageView' })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LOAD_EVENTS.map(e => <SelectItem key={e.value} value={e.value} className="text-xs">{e.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {event.eventType === 'custom' && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Nome do evento</span>
                    <Input value={event.customEventName || ''} onChange={e => updateEvent(event.id, { customEventName: e.target.value })} placeholder="NomeDoEvento" className="h-8 text-xs" />
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
          <span>Os pixels precisam estar configurados em <strong>Configurações → Integrações</strong> com os IDs corretos. Após disparar, os eventos aparecem no <strong>Monitor de Pixels</strong>.</span>
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, description, action, compact }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 text-center text-muted-foreground ${compact ? 'py-8' : 'py-12'}`}>
      <div className="opacity-30">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs max-w-xs">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FormAnalytics({ form, onUpdate }: Props) {
  const { sessions, pageEvents, pixelLogs, loading, refresh, loadedAt } = useAnalyticsData(form.id);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-2">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-node-analytics-accent/10 flex items-center justify-center">
              <Activity className="h-4 w-4 text-node-analytics-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Análiticas & Pixels</h2>
              <p className="text-xs text-muted-foreground">
                Sessões, funil de conversão, disparos de pixel e taxa de confirmação em tempo real.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadedAt > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Atualizado {formatDistanceToNow(new Date(loadedAt), { addSuffix: true, locale: ptBR })}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="mb-6 bg-muted/40 h-auto p-1 flex-wrap gap-0.5">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <BarChart2 className="h-3.5 w-3.5" />Visão Geral
            </TabsTrigger>
            <TabsTrigger value="funnel" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <TrendingDown className="h-3.5 w-3.5" />Funil
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <Users className="h-3.5 w-3.5" />Sessões <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{sessions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pixels" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <Activity className="h-3.5 w-3.5" />Pixels <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{pixelLogs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="load-events" className="flex items-center gap-1.5 text-xs px-4 py-1.5">
              <Zap className="h-3.5 w-3.5" />Eventos de Carga
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab sessions={sessions} pixelLogs={pixelLogs} pageEvents={pageEvents} />
          </TabsContent>
          <TabsContent value="funnel">
            <FunnelTab sessions={sessions} pageEvents={pageEvents} form={form} />
          </TabsContent>
          <TabsContent value="sessions">
            <SessionsTab sessions={sessions} />
          </TabsContent>
          <TabsContent value="pixels">
            <PixelMonitorTab pixelLogs={pixelLogs} refresh={refresh} loading={loading} />
          </TabsContent>
          <TabsContent value="load-events">
            <LoadEventsTab form={form} onUpdate={onUpdate} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
