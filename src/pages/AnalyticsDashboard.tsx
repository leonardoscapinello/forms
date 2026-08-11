import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useFormStore } from '@/hooks/useFormStore';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, TrendingUp, TrendingDown, Clock, ArrowDownRight, Eye, CheckCircle2, RefreshCw, MessageSquare, Zap, Activity, Brain, Smile, Frown, Meh, AlertTriangle, Loader2,
  Users, CircleHelp, MonitorSmartphone, Send, ShieldCheck,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import {
  averageBoundedDuration,
  averageSessionDurationMs,
  formatAnalyticsDuration,
} from '@/lib/analyticsTime';
import {
  AnalyticsDashboardData,
  AnalyticsDashboardView,
  calculateMetricChange,
  calculatePercentagePointChange,
  getAnalyticsTimeZone,
  isAnalyticsDashboardRpcUnavailable,
  parseAnalyticsDashboard,
  selectAnalyticsDashboardView,
  summarizeDeliveryHealth,
  summarizePixelHealth,
} from '@/lib/analyticsDashboard';

/* ── types ── */
interface Session {
  id: string;
  form_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  pages_visited: number | null;
  total_pages: number | null;
}

interface PageEvent {
  form_id: string;
  page_index: number | null;
  page_title: string | null;
  event_type: string;
  time_on_page_ms: number | null;
}

interface FormResponse {
  form_id: string;
  answers: Record<string, any>;
  metadata: Record<string, any> | null;
  created_at: string;
}

/* ── helpers ── */
const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '14', label: '14 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

/* ── Animated number ── */
function AnimatedNumber({ value, suffix = '' }: { value: number | string; suffix?: string }) {
  return (
    <motion.span
      key={String(value)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="tabular-nums"
    >
      {value}{suffix}
    </motion.span>
  );
}

function MetricHelp({ children }: { children: string }) {
  return (
    <UiTooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Como esta métrica é calculada"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-xs leading-relaxed" side="top">
        {children}
      </TooltipContent>
    </UiTooltip>
  );
}

function formatTrend(value: number | null, suffix = '%'): string {
  if (value === null) return 'sem base anterior';
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

/* ── Radial progress ── */
function RadialProgress({ value, size = 64, strokeWidth = 5, color }: {
  value: number; size?: number; strokeWidth?: number; color: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

/* ── KPI card ── */
function KpiCard({ icon: Icon, label, value, sub, trend, change, changeSuffix = '%', positiveIsGood = true, help, accent, delay = 0 }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
  trend?: 'up' | 'down' | 'neutral'; change?: number | null; changeSuffix?: string;
  positiveIsGood?: boolean; help?: string; accent?: string; delay?: number;
}) {
  const accentColor = accent || 'hsl(var(--primary))';
  const changeIsGood = change == null || change === 0 ? null : (change > 0) === positiveIsGood;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 group hover:border-primary/30 transition-all duration-300"
    >
      {/* Glow effect */}
      <div
        className="absolute -top-12 -right-12 h-24 w-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
        style={{ background: accentColor }}
      />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}15` }}
          >
            <Icon className="h-4 w-4" style={{ color: accentColor }} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
          {help && <MetricHelp>{help}</MetricHelp>}
        </div>
        <p
          className="min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(1.45rem,2.4vw,1.875rem)] font-bold leading-tight text-foreground"
          title={String(value)}
        >
          <AnimatedNumber value={value} />
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {change !== undefined && (
            <span className={`flex shrink-0 items-center gap-0.5 text-[10px] font-semibold ${
              changeIsGood === true ? 'text-success' : changeIsGood === false ? 'text-destructive' : 'text-muted-foreground'
            }`} title="Comparação com o período anterior de mesma duração">
              {change !== null && change !== 0 && (change > 0
                ? <TrendingUp className="h-3 w-3" />
                : <TrendingDown className="h-3 w-3" />)}
              {formatTrend(change, changeSuffix)}
            </span>
          )}
          {change === undefined && trend && trend !== 'neutral' && (
            <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${
              trend === 'up' ? 'text-primary' : 'text-destructive'
            }`}>
              {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            </span>
          )}
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Glass panel wrapper ── */
function GlassPanel({ children, className = '', delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={`rounded-2xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden ${className}`}
    >
      {children}
    </motion.div>
  );
}

/* ── Dropoff bar ── */
function DropoffBar({ label, total, dropoffs, index, maxTotal }: {
  label: string; total: number; dropoffs: number; index: number; maxTotal: number;
}) {
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const dropPct = total > 0 ? Math.round((dropoffs / total) * 100) : 0;
  const continuePct = maxTotal > 0 ? Math.max(Math.round(((total - dropoffs) / maxTotal) * 100), total > 0 ? 2 : 0) : 0;
  const dropBarPct = maxTotal > 0 ? Math.round((dropoffs / maxTotal) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="space-y-1.5 group/bar"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground truncate max-w-[240px]">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground mr-2">
            {index + 1}
          </span>
          {label}
        </span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="tabular-nums text-muted-foreground">{total}</span>
          {dropoffs > 0 && (
            <span className="flex items-center gap-1 text-destructive text-[10px] font-bold tabular-nums">
              <ArrowDownRight className="h-3 w-3" />
              {dropoffs} ({dropPct}%)
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        <motion.div
          className="h-full rounded-l-full"
          initial={{ width: 0 }}
          animate={{ width: `${continuePct}%` }}
          transition={{ duration: 0.8, delay: index * 0.06 + 0.2, ease: 'easeOut' }}
          style={{ background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))` }}
        />
        {dropoffs > 0 && (
          <motion.div
            className="h-full"
            initial={{ width: 0 }}
            animate={{ width: `${dropBarPct}%` }}
            transition={{ duration: 0.6, delay: index * 0.06 + 0.5, ease: 'easeOut' }}
            style={{ background: `hsl(var(--destructive) / 0.5)` }}
          />
        )}
      </div>
    </motion.div>
  );
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label, labelFormatter }: any) {
  if (!active || !payload?.length) return null;
  const formattedLabel = labelFormatter ? labelFormatter(label) : label;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md px-4 py-3 shadow-xl text-xs space-y-1.5">
      <p className="font-bold text-foreground text-[13px]">{formattedLabel}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-card" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-bold text-foreground tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ MAIN ═══════════════ */
export default function AnalyticsDashboard() {
  const { forms } = useFormStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pageEvents, setPageEvents] = useState<PageEvent[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [aggregate, setAggregate] = useState<AnalyticsDashboardData | null>(null);
  const [dataMode, setDataMode] = useState<'aggregate' | 'legacy_sample' | 'error'>('aggregate');
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [days, setDays] = useState('30');
  const [formFilter, setFormFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [sentimentAgg, setSentimentAgg] = useState<any>(null);
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);
  const analyticsRequestId = useRef(0);

  const since = useMemo(() => startOfDay(subDays(new Date(), Number(days))).toISOString(), [days]);

  const formIds = useMemo(() => forms.map(f => f.id), [forms]);

  const fetchData = useCallback(async () => {
    const requestId = ++analyticsRequestId.current;
    if (formIds.length === 0) {
      setAggregate(null);
      setSessions([]);
      setPageEvents([]);
      setResponses([]);
      setAnalyticsError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAnalyticsError(null);
    const until = new Date().toISOString();

    try {
      const [rpcResult, responseSample] = await Promise.all([
        supabase.rpc('get_analytics_dashboard', {
          p_form_ids: formIds,
          p_since: since,
          p_until: until,
          p_timezone: getAnalyticsTimeZone(),
        }),
        supabase.functions.invoke('form-responses-read', {
          body: { form_ids: formIds, limit: 1000, since, fields: 'form_id, answers, metadata, created_at' },
        }),
      ]);

      if (requestId !== analyticsRequestId.current) return;

      setResponses((responseSample.data?.data || []) as FormResponse[]);

      if (!rpcResult.error) {
        const parsed = parseAnalyticsDashboard(rpcResult.data);
        if (!parsed) throw new Error('O servidor retornou um agregado de analytics inválido.');
        setAggregate(parsed);
        setDataMode('aggregate');
        setSessions([]);
        setPageEvents([]);
        return;
      }

      if (!isAnalyticsDashboardRpcUnavailable(rpcResult.error)) {
        throw new Error(rpcResult.error.message || 'Não foi possível carregar as métricas completas.');
      }

      // Compatibility window for environments where the migration has not yet
      // reached PostgREST. This mode is visible in the UI and never used for
      // permission, timeout or database errors.
      const [sessRes, evtRes] = await Promise.all([
        supabase.from('form_sessions').select('id, form_id, status, started_at, completed_at, pages_visited, total_pages').gte('started_at', since).in('form_id', formIds).order('started_at', { ascending: false }).limit(1000),
        supabase.from('form_page_events').select('form_id, page_index, page_title, event_type, time_on_page_ms').gte('created_at', since).in('form_id', formIds).order('created_at', { ascending: false }).limit(2000),
      ]);
      if (requestId !== analyticsRequestId.current) return;
      if (sessRes.error || evtRes.error) {
        throw new Error(sessRes.error?.message || evtRes.error?.message || 'Falha no modo de compatibilidade.');
      }
      setAggregate(null);
      setDataMode('legacy_sample');
      setSessions((sessRes.data as Session[]) || []);
      setPageEvents((evtRes.data as PageEvent[]) || []);
    } catch (error) {
      if (requestId !== analyticsRequestId.current) return;
      setAggregate(null);
      setDataMode('error');
      setAnalyticsError(error instanceof Error ? error.message : 'Não foi possível carregar analytics.');
      setSessions([]);
      setPageEvents([]);
    } finally {
      if (requestId === analyticsRequestId.current) setLoading(false);
    }
  }, [since, formIds]);

  useEffect(() => {
    fetchData();
    return () => { analyticsRequestId.current += 1; };
  }, [fetchData]);

  /* filtered data */
  const filteredSessions = useMemo(() =>
    formFilter === 'all' ? sessions : sessions.filter(s => s.form_id === formFilter),
  [sessions, formFilter]);

  const filteredEvents = useMemo(() =>
    formFilter === 'all' ? pageEvents : pageEvents.filter(e => e.form_id === formFilter),
  [pageEvents, formFilter]);

  const filteredResponses = useMemo(() =>
    formFilter === 'all' ? responses : responses.filter(r => r.form_id === formFilter),
  [responses, formFilter]);

  const dashboardView = useMemo<AnalyticsDashboardView | null>(() => (
    aggregate ? selectAnalyticsDashboardView(aggregate, formFilter) : null
  ), [aggregate, formFilter]);

  /* KPIs */
  const totalSessions = dashboardView?.summary.totalSessions ?? filteredSessions.length;
  const completedSessions = filteredSessions.filter(s => s.status === 'completed');
  const completedCount = dashboardView?.summary.completedSessions ?? completedSessions.length;
  const completionRate = dashboardView?.summary.completionRate
    ?? (totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0);
  const dropoffRate = 100 - completionRate;

  const avgTimeMs = dashboardView?.summary.avgDurationMs ?? averageSessionDurationMs(completedSessions);

  const avgPagesVisited = dashboardView?.summary.avgPagesVisited ?? (filteredSessions.length > 0
    ? Math.round(filteredSessions.reduce((sum, s) => sum + (s.pages_visited || 0), 0) / filteredSessions.length * 10) / 10
    : 0);

  /* trend chart */
  const trendData = useMemo(() => {
    const numDays = Number(days);
    const buckets: Record<string, { date: string; sessões: number; completas: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      buckets[d] = { date: d, sessões: 0, completas: 0 };
    }
    if (dashboardView) {
      dashboardView.daily.forEach(row => {
        if (buckets[row.date]) {
          buckets[row.date].sessões += row.sessions;
          buckets[row.date].completas += row.completed;
        }
      });
    } else {
      filteredSessions.forEach(s => {
        const d = format(parseISO(s.started_at), 'yyyy-MM-dd');
        if (buckets[d]) {
          buckets[d].sessões++;
          if (s.status === 'completed') buckets[d].completas++;
        }
      });
    }
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }, [dashboardView, filteredSessions, days]);

  /* ── Flow-ordered page list from canvas BFS ── */
  const flowOrderedPageList = useMemo(() => {
    const targetForms = formFilter === 'all' ? forms : forms.filter(f => f.id === formFilter);
    const result: { formId: string; pageId: string; pageIndex: number; title: string }[] = [];

    for (const form of targetForms) {
      const edges = form.flowEdges || [];
      const pages = form.pages || [];
      if (pages.length === 0) continue;

      // BFS from 'start' following edges — same logic as useEditorForm
      const pageMap = new Map(pages.map((p, i) => [p.id, { ...p, originalIndex: i }]));
      const ordered: typeof pages = [];
      const visited = new Set<string>();
      const queue = ['start'];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        if (current.startsWith('p-')) {
          const pageId = current.slice(2);
          const page = pageMap.get(pageId);
          if (page) { ordered.push(page); pageMap.delete(pageId); }
        }
        for (const edge of edges) {
          if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
        }
      }
      // Append disconnected pages at the end
      for (const page of pages) { if (pageMap.has(page.id)) ordered.push(page); }

      ordered.forEach((page, flowIdx) => {
        const originalIdx = pages.findIndex(p => p.id === page.id);
        result.push({ formId: form.id, pageId: page.id, pageIndex: originalIdx, title: page.title || `Página ${flowIdx + 1}` });
      });
    }
    return result;
  }, [forms, formFilter]);

  /* ── DROPOFF BY PAGE (flow order) ── */
  const pageDropoffData = useMemo(() => {
    if (dashboardView) {
      const formTitle = new Map(forms.map(form => [form.id, form.title]));
      return dashboardView.pages
        .map(page => ({
          index: page.pageIndex ?? Number.MAX_SAFE_INTEGER,
          title: formFilter === 'all'
            ? `${formTitle.get(page.formId) || 'Formulário'} · ${page.pageTitle}`
            : page.pageTitle,
          views: page.reached,
          dropoffs: page.dropoffs,
          avgTimeMs: page.avgTimeOnPageMs,
          formId: page.formId,
          pageId: page.pageId,
        }))
        .sort((left, right) => {
          const byForm = left.formId.localeCompare(right.formId);
          return formFilter === 'all' && byForm !== 0 ? byForm : left.index - right.index;
        });
    }

    // Build a map from (formId, pageIndex) -> flowOrder position
    const flowIndexMap = new Map<string, { flowIdx: number; title: string }>();
    flowOrderedPageList.forEach((p, flowIdx) => {
      flowIndexMap.set(`${p.formId}:${p.pageIndex}`, { flowIdx, title: p.title });
    });

    const pageMap: Record<number, { index: number; title: string; views: number; timesArr: number[] }> = {};
    filteredEvents.filter(e => e.event_type === 'page_view').forEach(e => {
      const idx = e.page_index ?? 0;
      // Try to find flow order for this page
      let flowIdx = idx;
      let title = e.page_title || `Página ${idx + 1}`;
      if (formFilter !== 'all') {
        const key = `${formFilter}:${idx}`;
        const found = flowIndexMap.get(key);
        if (found) { flowIdx = found.flowIdx; title = found.title; }
      }
      if (!pageMap[flowIdx]) pageMap[flowIdx] = { index: flowIdx, title, views: 0, timesArr: [] };
      pageMap[flowIdx].views++;
      if (e.time_on_page_ms) pageMap[flowIdx].timesArr.push(e.time_on_page_ms);
    });
    const abandonsByPage: Record<number, number> = {};
    filteredResponses.forEach(r => {
      const meta = r.metadata as Record<string, any> | null;
      if (meta?.status === 'partial' && meta?.last_page_index != null) {
        let pageIdx = Number(meta.last_page_index);
        if (formFilter !== 'all') {
          const key = `${formFilter}:${pageIdx}`;
          const found = flowIndexMap.get(key);
          if (found) pageIdx = found.flowIdx;
        }
        abandonsByPage[pageIdx] = (abandonsByPage[pageIdx] || 0) + 1;
      }
    });
    const sorted = Object.values(pageMap).sort((a, b) => a.index - b.index);
    return sorted.map(p => ({
      ...p,
      dropoffs: abandonsByPage[p.index] || 0,
      avgTimeMs: averageBoundedDuration(p.timesArr, 60 * 60 * 1000),
    }));
  }, [dashboardView, filteredEvents, filteredResponses, flowOrderedPageList, formFilter, forms]);

  /* ── DROPOFF BY QUESTION (flow order) ── */
  const questionDropoffData = useMemo(() => {
    const targetForms = formFilter === 'all' ? forms : forms.filter(f => f.id === formFilter);
    const questionMeta: Record<string, { id: string; title: string; pageTitle: string }> = {};
    const questionOrder: string[] = [];
    targetForms.forEach(form => {
      // Use flow-ordered pages (BFS) instead of array order
      const edges = form.flowEdges || [];
      const pages = form.pages || [];
      const pageMap = new Map(pages.map(p => [p.id, p]));
      const orderedPages: typeof pages = [];
      const visited = new Set<string>();
      const queue = ['start'];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        if (current.startsWith('p-')) {
          const pageId = current.slice(2);
          const page = pageMap.get(pageId);
          if (page) { orderedPages.push(page); pageMap.delete(pageId); }
        }
        for (const edge of edges) {
          if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
        }
      }
      for (const page of pages) { if (pageMap.has(page.id)) orderedPages.push(page); }

      orderedPages.forEach((page, flowIdx) => {
        (page.elements || []).forEach(el => {
          if (el.type.startsWith('input_') && !questionMeta[el.id]) {
            questionMeta[el.id] = { id: el.id, title: el.content || el.label || el.type, pageTitle: page.title || `Página ${flowIdx + 1}` };
            questionOrder.push(el.id);
          }
        });
      });
    });
    const lastAnsweredCount: Record<string, number> = {};
    const totalAnsweredCount: Record<string, number> = {};
    filteredResponses.forEach(r => {
      const meta = r.metadata as Record<string, any> | null;
      const answers = r.answers || {};
      const isPartial = meta?.status === 'partial';
      const answeredKeys = Object.keys(answers).filter(k =>
        !k.startsWith('__') && answers[k] !== '' && answers[k] !== null && answers[k] !== undefined
      );
      answeredKeys.forEach(k => { totalAnsweredCount[k] = (totalAnsweredCount[k] || 0) + 1; });
      if (isPartial && answeredKeys.length > 0) {
        let lastIdx = -1, lastQId = '';
        answeredKeys.forEach(k => { const oi = questionOrder.indexOf(k); if (oi > lastIdx) { lastIdx = oi; lastQId = k; } });
        if (lastQId) lastAnsweredCount[lastQId] = (lastAnsweredCount[lastQId] || 0) + 1;
      }
    });
    return questionOrder.map(qId => ({
      id: qId, title: questionMeta[qId]?.title || qId, pageTitle: questionMeta[qId]?.pageTitle || '',
      totalFilled: totalAnsweredCount[qId] || 0, abandonedHere: lastAnsweredCount[qId] || 0,
    })).filter(q => q.totalFilled > 0 || q.abandonedHere > 0);
  }, [filteredResponses, forms, formFilter]);

  /* pie */
  const pieData = useMemo(() => [
    { name: 'Completas', value: completedCount, color: 'hsl(var(--primary))' },
    { name: 'Não concluídas', value: Math.max(totalSessions - completedCount, 0), color: 'hsl(var(--destructive))' },
  ], [completedCount, totalSessions]);

  /* top forms */
  const topFormsData = useMemo(() => {
    if (aggregate) {
      return aggregate.forms
        .filter(metric => formFilter === 'all' || metric.formId === formFilter)
        .map(metric => ({
          id: metric.formId,
          name: metric.title,
          sessions: metric.totalSessions,
          completed: metric.completedSessions,
        }))
        .sort((left, right) => right.sessions - left.sessions)
        .slice(0, 8);
    }
    const map: Record<string, { id: string; name: string; sessions: number; completed: number }> = {};
    sessions.forEach(s => {
      if (!map[s.form_id]) {
        const form = forms.find(f => f.id === s.form_id);
        map[s.form_id] = { id: s.form_id, name: form?.title || s.form_id.slice(0, 8), sessions: 0, completed: 0 };
      }
      map[s.form_id].sessions++;
      if (s.status === 'completed') map[s.form_id].completed++;
    });
    return Object.values(map).sort((a, b) => b.sessions - a.sessions).slice(0, 8);
  }, [aggregate, sessions, forms, formFilter]);

  const sessionChange = dashboardView
    ? calculateMetricChange(totalSessions, dashboardView.summary.previousTotalSessions)
    : undefined;
  const completedChange = dashboardView
    ? calculateMetricChange(completedCount, dashboardView.summary.previousCompletedSessions)
    : undefined;
  const conversionChange = dashboardView
    ? calculatePercentagePointChange(completionRate, dashboardView.summary.previousCompletionRate)
    : undefined;
  const deliveryHealth = useMemo(
    () => summarizeDeliveryHealth(dashboardView?.deliveries || []),
    [dashboardView],
  );
  const pixelHealth = useMemo(
    () => summarizePixelHealth(dashboardView?.pixels || []),
    [dashboardView],
  );
  const maxPageReach = useMemo(
    () => Math.max(...pageDropoffData.map(page => page.views), 1),
    [pageDropoffData],
  );

  return (
    <TooltipProvider delayDuration={250}>
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1280px] mx-auto space-y-8">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-end justify-between gap-4 flex-wrap"
        >
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            </div>
            <p className="text-sm text-muted-foreground ml-[42px]">Performance completa, conversão e saúde operacional</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={formFilter} onValueChange={setFormFilter}>
              <SelectTrigger className="w-[180px] h-9 text-xs rounded-xl border-border bg-card">
                <SelectValue placeholder="Todos formulários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos formulários</SelectItem>
                {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[110px] h-9 text-xs rounded-xl border-border bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </motion.div>

        <AnimatePresence mode="popLayout">
          {dataMode === 'legacy_sample' && (
            <motion.div
              key="legacy-sample"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
              className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Modo de compatibilidade temporário</p>
                <p className="mt-0.5 opacity-80">
                  A agregação corporativa ainda não está disponível neste ambiente. Os números abaixo usam uma amostra recente de até 1.000 sessões e 2.000 eventos; portanto, não representam o histórico completo.
                </p>
              </div>
            </motion.div>
          )}
          {analyticsError && (
            <motion.div
              key="analytics-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">As métricas completas não puderam ser carregadas</p>
                <p className="mt-0.5 break-words opacity-80">{analyticsError}</p>
              </div>
              <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={fetchData}>Tentar novamente</Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <KpiCard
            icon={Eye}
            label="Sessões"
            value={totalSessions}
            sub={`em ${days} dias`}
            change={sessionChange}
            help="Sessões distintas iniciadas no período. Tentativas duplicadas com o mesmo identificador são contadas uma única vez."
            accent="hsl(var(--primary))"
            delay={0}
          />
          <KpiCard
            icon={Users}
            label="Leads únicos"
            value={dashboardView?.summary.uniqueLeads ?? completedCount}
            sub="respostas completas distintas"
            help="Quantidade de response IDs distintos concluídos no período. Não deduplica a mesma pessoa entre formulários, pois o painel não usa PII."
            accent="hsl(var(--success))"
            delay={0.04}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completas"
            value={completedCount}
            change={completedChange}
            help="Sessões que chegaram ao estado concluído, independentemente de integrações externas posteriores."
            accent="hsl(var(--success))"
            delay={0.08}
          />
          <KpiCard
            icon={Zap}
            label="Conversão"
            value={`${completionRate}%`}
            change={conversionChange}
            changeSuffix=" pp"
            help="Percentual de sessões distintas concluídas. A comparação é em pontos percentuais contra o período anterior de mesma duração."
            accent="hsl(var(--primary))"
            delay={0.12}
          />
          <KpiCard
            icon={Clock}
            label="Tempo médio"
            value={formatAnalyticsDuration(avgTimeMs)}
            sub={`${avgPagesVisited} pág. em média`}
            help="Média entre início e conclusão. Durações negativas ou acima de 24 horas são descartadas para evitar distorções."
            delay={0.16}
          />
          <KpiCard
            icon={Activity}
            label="Tempo típico (p50)"
            value={dashboardView ? formatAnalyticsDuration(dashboardView.summary.p50DurationMs) : '—'}
            sub="metade conclui até aqui"
            help="Mediana do tempo de conclusão: 50% das conclusões válidas foram mais rápidas que este valor."
            delay={0.2}
          />
          <KpiCard
            icon={ShieldCheck}
            label="Cauda lenta (p95)"
            value={dashboardView ? formatAnalyticsDuration(dashboardView.summary.p95DurationMs) : '—'}
            sub={`${dropoffRate}% não concluíram`}
            help="95º percentil do tempo de conclusão. Ajuda a revelar experiências lentas que a média pode esconder."
            accent="hsl(var(--destructive))"
            delay={0.24}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Area chart */}
          <GlassPanel className="lg:col-span-2" delay={0.15}>
            <div className="px-6 pt-5 pb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">Sessões por dia</p>
                <p className="text-[11px] text-muted-foreground">Tendência de {days} dias</p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Sessões</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'hsl(var(--success))' }} /> Completas</span>
              </div>
            </div>
            <div className="h-[260px] px-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="grad-sessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-completed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => format(parseISO(v), 'dd/MM')} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={(v: string) => format(parseISO(v), "dd 'de' MMMM", { locale: ptBR })} />} cursor={{ stroke: 'hsl(var(--primary) / 0.3)' }} />
                  <Area type="monotone" dataKey="sessões" stroke="hsl(var(--primary))" fill="url(#grad-sessions)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: 'hsl(var(--primary))', strokeWidth: 2, stroke: 'hsl(var(--card))' }} />
                  <Area type="monotone" dataKey="completas" stroke="hsl(var(--success))" fill="url(#grad-completed)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'hsl(var(--success))', strokeWidth: 2, stroke: 'hsl(var(--card))' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassPanel>

          {/* Radial completion */}
          <GlassPanel delay={0.2}>
            <div className="px-6 pt-5 pb-2">
              <p className="text-sm font-bold text-foreground">Taxa de conversão</p>
              <p className="text-[11px] text-muted-foreground">Completas vs Abandonos</p>
            </div>
            <div className="flex flex-col items-center justify-center h-[240px] gap-4">
              {totalSessions === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados</p>
              ) : (
                <>
                  <div className="relative">
                    <RadialProgress value={completionRate} size={120} strokeWidth={8} color="hsl(var(--primary))" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-foreground tabular-nums">{completionRate}%</span>
                      <span className="text-[10px] text-muted-foreground">conversão</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {pieData.map(p => (
                      <span key={p.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.name} <span className="font-bold text-foreground tabular-nums">{p.value}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </GlassPanel>
        </div>

        {/* ── Acquisition and operational health ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassPanel delay={0.22}>
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                  <MonitorSmartphone className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Aquisição e dispositivos</p>
                  <p className="text-[11px] text-muted-foreground">Origem declarada por UTM/referrer e categoria do user agent</p>
                </div>
              </div>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Principais origens</p>
                  <MetricHelp>Usa utm_source quando presente; caso contrário, o domínio de referência. Sem ambos, a sessão é classificada como direto.</MetricHelp>
                </div>
                {dashboardView?.sources.length ? (
                  <div className="space-y-2.5">
                    {dashboardView.sources.slice(0, 6).map(source => (
                      <div key={source.source} className="flex items-center gap-3 text-xs">
                        <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={source.source}>{source.source}</span>
                        <span className="tabular-nums text-muted-foreground">{source.sessions}</span>
                        <span className="w-12 text-right font-semibold tabular-nums text-foreground">{source.conversionRate}%</span>
                      </div>
                    ))}
                    <div className="flex justify-end gap-4 border-t border-border pt-2 text-[10px] text-muted-foreground">
                      <span>sessões</span><span>conversão</span>
                    </div>
                  </div>
                ) : <p className="py-5 text-center text-xs text-muted-foreground">Sem origem registrada</p>}
              </div>
              <div>
                <div className="mb-3 flex items-center gap-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Dispositivos</p>
                  <MetricHelp>Classificação aproximada do user agent em desktop, mobile ou tablet. Não é fingerprinting.</MetricHelp>
                </div>
                {dashboardView?.devices.length ? (
                  <div className="space-y-2.5">
                    {dashboardView.devices.map(device => {
                      const labels = { desktop: 'Desktop', mobile: 'Celular', tablet: 'Tablet' };
                      const share = totalSessions > 0 ? Math.round(device.sessions / totalSessions * 100) : 0;
                      return (
                        <div key={device.device} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">{labels[device.device]}</span>
                            <span className="tabular-nums text-muted-foreground">{device.sessions} · {device.conversionRate}% conv.</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="py-5 text-center text-xs text-muted-foreground">Sem dispositivo registrado</p>}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel delay={0.24}>
            <div className="border-b border-border px-6 py-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Saúde operacional</p>
                  <p className="text-[11px] text-muted-foreground">Entregas duráveis e confirmações de pixels no período</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Entregas / outbox</p>
                  <MetricHelp>Cada envio para webhook ou Google Sheets é persistido antes da resposta ao lead. Falhas entram em retentativa; dead-letter exige intervenção.</MetricHelp>
                </div>
                {deliveryHealth.total > 0 ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Entregues</span><strong className="tabular-nums text-success">{deliveryHealth.delivered}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Processando</span><strong className="tabular-nums">{deliveryHealth.processing}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Em retentativa</span><strong className="tabular-nums text-amber-600">{deliveryHealth.retrying}</strong></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Dead-letter</span><strong className="tabular-nums text-destructive">{deliveryHealth.deadLetter}</strong></div>
                    <div className="mt-3 border-t border-border pt-3 text-center">
                      <strong className="text-xl tabular-nums text-foreground">{deliveryHealth.successRate}%</strong>
                      <p className="text-[10px] text-muted-foreground">já entregues</p>
                    </div>
                  </div>
                ) : <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma entrega externa no período</p>}
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-foreground">Pixels</p>
                  <MetricHelp>Confirma se o evento foi registrado no navegador e no endpoint server-side. O log indica transporte, não atribuição final pela plataforma.</MetricHelp>
                </div>
                {pixelHealth.total > 0 ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="mb-1 flex justify-between"><span className="text-muted-foreground">Navegador</span><strong>{pixelHealth.clientRate}%</strong></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pixelHealth.clientRate}%` }} /></div>
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between"><span className="text-muted-foreground">Server-side</span><strong>{pixelHealth.serverRate}%</strong></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${pixelHealth.serverRate}%` }} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-center">
                      <div className="rounded-lg bg-muted/50 p-2"><strong className="block tabular-nums">{pixelHealth.total}</strong><span className="text-[10px] text-muted-foreground">eventos</span></div>
                      <div className="rounded-lg bg-destructive/5 p-2"><strong className="block tabular-nums text-destructive">{pixelHealth.missingServer}</strong><span className="text-[10px] text-muted-foreground">sem CAPI</span></div>
                    </div>
                  </div>
                ) : <p className="py-5 text-center text-xs text-muted-foreground">Nenhum pixel disparado no período</p>}
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* ── Dropoff analysis ── */}
        <GlassPanel delay={0.25}>
          <div className="px-6 pt-5 pb-2 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center">
              <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Análise de drop-off</p>
              <p className="text-[11px] text-muted-foreground">Onde os usuários abandonam o formulário</p>
            </div>
          </div>
          <div className="px-6 pb-6 pt-2">
            <Tabs defaultValue="page" className="w-full">
              <TabsList className="mb-5 bg-muted/60 rounded-xl">
                <TabsTrigger value="page" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Por página</TabsTrigger>
                <TabsTrigger value="question" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Por pergunta</TabsTrigger>
              </TabsList>

              <TabsContent value="page">
                {pageDropoffData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de páginas</p>
                ) : (
                  <div className="space-y-3">
                    {pageDropoffData.map((page, i) => (
                      <DropoffBar key={`${'formId' in page ? page.formId : 'legacy'}:${'pageId' in page ? page.pageId : page.index}`} label={page.title} total={page.views} dropoffs={page.dropoffs} index={i} maxTotal={maxPageReach} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="question">
                <p className="mb-4 text-[11px] text-muted-foreground">
                  Diagnóstico por pergunta baseado nas até 1.000 respostas mais recentes do período; o funil por página acima usa o histórico completo.
                </p>
                {questionDropoffData.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-sm text-muted-foreground">
                      {formFilter === 'all' ? 'Selecione um formulário para ver o drop-off por pergunta' : 'Sem dados de perguntas'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questionDropoffData.map((q, i) => (
                      <DropoffBar key={q.id} label={q.title} total={q.totalFilled} dropoffs={q.abandonedHere} index={i} maxTotal={questionDropoffData[0]?.totalFilled || 1} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </GlassPanel>

        {/* ── Sentiment analysis ── */}
        <GlassPanel delay={0.28}>
          <div className="px-6 pt-5 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Brain className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Sentimentos & Emoções</p>
                <p className="text-[11px] text-muted-foreground">Análise por IA das respostas em texto</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={analyzingSentiment || formFilter === 'all'}
              onClick={async () => {
                if (formFilter === 'all') return;
                setAnalyzingSentiment(true);
                try {
                  const { data, error } = await supabase.functions.invoke('analyze-sentiment', {
                    body: { form_id: formFilter },
                  });
                  if (error) throw error;
                  if (data?.aggregate) setSentimentAgg(data.aggregate);
                } catch { /* ignore */ }
                setAnalyzingSentiment(false);
              }}
            >
              {analyzingSentiment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              Analisar
            </Button>
          </div>
          <div className="px-6 pb-6 pt-2">
            {formFilter === 'all' ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Selecione um formulário para analisar sentimentos</p>
            ) : !sentimentAgg ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Clique em "Analisar" para processar as respostas</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Sentiment distribution */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Distribuição de sentimento</p>
                  {(['positive', 'neutral', 'negative', 'mixed'] as const).map(key => {
                    const count = sentimentAgg.sentimentCounts[key] || 0;
                    const pct = sentimentAgg.total > 0 ? Math.round((count / sentimentAgg.total) * 100) : 0;
                    const icons = { positive: <Smile className="h-4 w-4 text-emerald-500" />, neutral: <Meh className="h-4 w-4 text-muted-foreground" />, negative: <Frown className="h-4 w-4 text-destructive" />, mixed: <AlertTriangle className="h-4 w-4 text-amber-500" /> };
                    const labels = { positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo', mixed: 'Misto' };
                    const colors = { positive: 'bg-emerald-500', neutral: 'bg-muted-foreground', negative: 'bg-destructive', mixed: 'bg-amber-500' };
                    return (
                      <div key={key} className="flex items-center gap-3">
                        {icons[key]}
                        <span className="text-xs text-foreground w-16">{labels[key]}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${colors[key]}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6 }}
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums w-10 text-right">{count}</span>
                      </div>
                    );
                  })}
                  <div className="pt-2 text-center">
                    <span className="text-2xl font-bold text-foreground">{sentimentAgg.avgScore > 0 ? '+' : ''}{sentimentAgg.avgScore}</span>
                    <p className="text-[10px] text-muted-foreground">Score médio (-1 a +1)</p>
                  </div>
                </div>

                {/* Top emotions */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Emoções detectadas</p>
                  {sentimentAgg.topEmotions?.length > 0 ? (
                    <div className="space-y-2">
                      {sentimentAgg.topEmotions.map(([emotion, count]: [string, number], i: number) => {
                        const maxCount = sentimentAgg.topEmotions[0]?.[1] || 1;
                        const pct = Math.round((count / maxCount) * 100);
                        return (
                          <motion.div
                            key={emotion}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.08 }}
                            className="flex items-center gap-3"
                          >
                            <span className="text-xs text-foreground capitalize w-24 truncate">{emotion}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-bold tabular-nums w-8 text-right">{count}</span>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">Sem emoções detectadas</p>
                  )}
                  <p className="text-[11px] text-muted-foreground text-center pt-2">{sentimentAgg.total} respostas analisadas</p>
                </div>
              </div>
            )}
          </div>
        </GlassPanel>

        {/* ── Top forms ── */}
        <GlassPanel delay={0.3}>
          <div className="px-6 pt-5 pb-2 flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Top formulários</p>
              <p className="text-[11px] text-muted-foreground">Rankings por volume de sessões</p>
            </div>
          </div>
          <div className="px-6 pb-6">
            {topFormsData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(topFormsData.length * 44, 160)}>
                <BarChart data={topFormsData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} width={110} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--accent) / 0.3)' }} />
                  <Bar dataKey="sessions" name="Sessões" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} barSize={16} />
                  <Bar dataKey="completed" name="Completas" fill="hsl(var(--success))" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
    </TooltipProvider>
  );
}
