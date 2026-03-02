import { useState, useEffect, useMemo } from 'react';
import { useFormStore } from '@/hooks/useFormStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, TrendingUp, Clock, ArrowDownRight, Eye, CheckCircle2, RefreshCw, MessageSquare,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
function msToReadable(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest > 0 ? `${m}m ${rest}s` : `${m}m`;
}

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

/* ── KPI card ── */
function KpiCard({ icon: Icon, label, value, sub, trend }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            trend === 'up' ? 'bg-primary/10 text-primary-foreground' :
            trend === 'down' ? 'bg-destructive/10 text-destructive' :
            'bg-accent text-muted-foreground'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Dropoff bar component ── */
function DropoffBar({ label, total, dropoffs, index, maxTotal }: {
  label: string; total: number; dropoffs: number; index: number; maxTotal: number;
}) {
  const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
  const dropPct = total > 0 ? Math.round((dropoffs / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground truncate max-w-[220px]">
          <span className="text-muted-foreground mr-1.5">{index + 1}.</span>
          {label}
        </span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="tabular-nums text-muted-foreground">{total} sessões</span>
          {dropoffs > 0 && (
            <span className="text-destructive text-[10px] font-semibold tabular-nums">
              {dropoffs} abandonos ({dropPct}%)
            </span>
          )}
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full rounded-l-full transition-all duration-700"
          style={{
            width: `${pct > 0 ? Math.max(pct - (dropoffs > 0 ? Math.round((dropoffs / maxTotal) * 100) : 0), 2) : 0}%`,
            background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
          }}
        />
        {dropoffs > 0 && (
          <div
            className="h-full transition-all duration-700"
            style={{
              width: `${Math.round((dropoffs / maxTotal) * 100)}%`,
              background: `hsl(var(--destructive) / 0.6)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ── main ── */
export default function AnalyticsDashboard() {
  const { forms } = useFormStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pageEvents, setPageEvents] = useState<PageEvent[]>([]);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [days, setDays] = useState('30');
  const [formFilter, setFormFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const since = useMemo(() => startOfDay(subDays(new Date(), Number(days))).toISOString(), [days]);

  /* fetch data */
  const fetchData = async () => {
    setLoading(true);
    const [sessRes, evtRes, respRes] = await Promise.all([
      supabase.from('form_sessions').select('id, form_id, status, started_at, completed_at, pages_visited, total_pages').gte('started_at', since).order('started_at', { ascending: false }).limit(1000),
      supabase.from('form_page_events').select('form_id, page_index, page_title, event_type, time_on_page_ms').gte('created_at', since).limit(1000),
      supabase.from('form_responses').select('form_id, answers, metadata, created_at').gte('created_at', since).limit(1000),
    ]);
    setSessions((sessRes.data as Session[]) || []);
    setPageEvents((evtRes.data as PageEvent[]) || []);
    setResponses((respRes.data as FormResponse[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [since]);

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

  /* KPIs */
  const totalSessions = filteredSessions.length;
  const completedSessions = filteredSessions.filter(s => s.status === 'completed');
  const completionRate = totalSessions > 0 ? Math.round((completedSessions.length / totalSessions) * 100) : 0;
  const dropoffRate = 100 - completionRate;

  const avgTimeMs = completedSessions.length > 0
    ? completedSessions.reduce((sum, s) => {
        if (!s.completed_at || !s.started_at) return sum;
        return sum + (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime());
      }, 0) / completedSessions.length
    : 0;

  const avgPagesVisited = filteredSessions.length > 0
    ? Math.round(filteredSessions.reduce((sum, s) => sum + (s.pages_visited || 0), 0) / filteredSessions.length * 10) / 10
    : 0;

  /* trend chart — sessions per day */
  const trendData = useMemo(() => {
    const numDays = Number(days);
    const buckets: Record<string, { date: string; sessões: number; completas: number }> = {};
    for (let i = 0; i < numDays; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      buckets[d] = { date: d, sessões: 0, completas: 0 };
    }
    filteredSessions.forEach(s => {
      const d = format(parseISO(s.started_at), 'yyyy-MM-dd');
      if (buckets[d]) {
        buckets[d].sessões++;
        if (s.status === 'completed') buckets[d].completas++;
      }
    });
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredSessions, days]);

  /* ── DROPOFF BY PAGE ── */
  const pageDropoffData = useMemo(() => {
    // Build page funnel from page_view events
    const pageMap: Record<number, { index: number; title: string; views: number; timesArr: number[] }> = {};
    filteredEvents.filter(e => e.event_type === 'page_view').forEach(e => {
      const idx = e.page_index ?? 0;
      if (!pageMap[idx]) pageMap[idx] = { index: idx, title: e.page_title || `Página ${idx + 1}`, views: 0, timesArr: [] };
      pageMap[idx].views++;
      if (e.time_on_page_ms) pageMap[idx].timesArr.push(e.time_on_page_ms);
    });

    // Count abandonments per page using metadata.last_page_index from partial responses
    const abandonsByPage: Record<number, number> = {};
    filteredResponses.forEach(r => {
      const meta = r.metadata as Record<string, any> | null;
      if (meta?.status === 'partial' && meta?.last_page_index != null) {
        const pageIdx = Number(meta.last_page_index);
        abandonsByPage[pageIdx] = (abandonsByPage[pageIdx] || 0) + 1;
      }
    });

    const sorted = Object.values(pageMap).sort((a, b) => a.index - b.index);
    return sorted.map(p => ({
      ...p,
      dropoffs: abandonsByPage[p.index] || 0,
      avgTimeMs: p.timesArr.length > 0 ? p.timesArr.reduce((s, v) => s + v, 0) / p.timesArr.length : 0,
    }));
  }, [filteredEvents, filteredResponses]);

  /* ── DROPOFF BY QUESTION (last answered question) ── */
  const questionDropoffData = useMemo(() => {
    // We need the form's page/element definitions to map answer keys to titles
    const targetForms = formFilter === 'all' ? forms : forms.filter(f => f.id === formFilter);

    // Build a map of elementId -> { title, pageTitle } for input elements only
    const questionMeta: Record<string, { id: string; title: string; pageTitle: string }> = {};
    const questionOrder: string[] = [];

    targetForms.forEach(form => {
      (form.pages || []).forEach((page, pageIdx) => {
        (page.elements || []).forEach(el => {
          if (el.type.startsWith('input_') && !questionMeta[el.id]) {
            questionMeta[el.id] = {
              id: el.id,
              title: el.content || el.label || el.type,
              pageTitle: page.title || `Página ${pageIdx + 1}`,
            };
            questionOrder.push(el.id);
          }
        });
      });
    });

    // For each partial response, find the LAST answered question
    const lastAnsweredCount: Record<string, number> = {};
    const totalAnsweredCount: Record<string, number> = {};

    filteredResponses.forEach(r => {
      const meta = r.metadata as Record<string, any> | null;
      const answers = r.answers || {};
      const isPartial = meta?.status === 'partial';

      // Count how many responses filled each question (for funnel)
      const answeredKeys = Object.keys(answers).filter(k =>
        !k.startsWith('__') && answers[k] !== '' && answers[k] !== null && answers[k] !== undefined
      );

      answeredKeys.forEach(k => {
        totalAnsweredCount[k] = (totalAnsweredCount[k] || 0) + 1;
      });

      // For partial responses, find the last answered question in order
      if (isPartial && answeredKeys.length > 0) {
        let lastIdx = -1;
        let lastQId = '';
        answeredKeys.forEach(k => {
          const orderIdx = questionOrder.indexOf(k);
          if (orderIdx > lastIdx) {
            lastIdx = orderIdx;
            lastQId = k;
          }
        });
        if (lastQId) {
          lastAnsweredCount[lastQId] = (lastAnsweredCount[lastQId] || 0) + 1;
        }
      }
    });

    // Build result sorted by question order
    return questionOrder.map(qId => ({
      id: qId,
      title: questionMeta[qId]?.title || qId,
      pageTitle: questionMeta[qId]?.pageTitle || '',
      totalFilled: totalAnsweredCount[qId] || 0,
      abandonedHere: lastAnsweredCount[qId] || 0,
    })).filter(q => q.totalFilled > 0 || q.abandonedHere > 0);
  }, [filteredResponses, forms, formFilter]);

  /* completion rate per form (pie) */
  const pieData = useMemo(() => [
    { name: 'Completas', value: completedSessions.length, color: 'hsl(var(--success))' },
    { name: 'Abandonos', value: totalSessions - completedSessions.length, color: 'hsl(var(--destructive))' },
  ], [completedSessions.length, totalSessions]);

  /* top forms by responses */
  const topFormsData = useMemo(() => {
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
  }, [sessions, forms]);

  const tooltipStyle = {
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 },
    labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
    itemStyle: { color: 'hsl(var(--foreground))' },
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px] space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Visão geral de performance dos seus formulários</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={formFilter} onValueChange={setFormFilter}>
              <SelectTrigger className="w-[200px] h-9 text-xs">
                <SelectValue placeholder="Todos formulários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos formulários</SelectItem>
                {forms.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard icon={Eye} label="Sessões" value={totalSessions} sub={`em ${days} dias`} />
          <KpiCard icon={CheckCircle2} label="Completas" value={completedSessions.length} trend="up" />
          <KpiCard icon={TrendingUp} label="Taxa de conclusão" value={`${completionRate}%`} trend={completionRate >= 50 ? 'up' : 'down'} />
          <KpiCard icon={ArrowDownRight} label="Taxa de abandono" value={`${dropoffRate}%`} trend={dropoffRate > 50 ? 'down' : 'up'} />
          <KpiCard icon={Clock} label="Tempo médio" value={msToReadable(avgTimeMs)} sub={`${avgPagesVisited} páginas em média`} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Trend area chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Sessões por dia</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="grad-sessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-completed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => format(parseISO(v), 'dd/MM')} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} labelFormatter={v => format(parseISO(v as string), "dd 'de' MMMM", { locale: ptBR })} />
                  <Area type="monotone" dataKey="sessões" stroke="hsl(var(--primary))" fill="url(#grad-sessions)" strokeWidth={2} />
                  <Area type="monotone" dataKey="completas" stroke="hsl(var(--success))" fill="url(#grad-completed)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Completion pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Conclusão vs Abandono</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] flex items-center justify-center relative">
              {totalSessions === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} strokeWidth={0}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                {pieData.map(p => (
                  <span key={p.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name} ({p.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dropoff analysis — tabbed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
              Análise de drop-off
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="page" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="page" className="text-xs">Por página</TabsTrigger>
                <TabsTrigger value="question" className="text-xs">Por pergunta</TabsTrigger>
              </TabsList>

              <TabsContent value="page">
                {pageDropoffData.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de páginas</p>
                ) : (
                  <div className="space-y-3">
                    {pageDropoffData.map((page, i) => (
                      <DropoffBar
                        key={page.index}
                        label={page.title}
                        total={page.views}
                        dropoffs={page.dropoffs}
                        index={i}
                        maxTotal={pageDropoffData[0]?.views || 1}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="question">
                {questionDropoffData.length === 0 ? (
                  <div className="py-8 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {formFilter === 'all'
                        ? 'Selecione um formulário para ver o drop-off por pergunta'
                        : 'Sem dados de perguntas'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questionDropoffData.map((q, i) => (
                      <div key={q.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-foreground truncate block max-w-[280px]">
                              <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                              {q.title}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{q.pageTitle}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className="tabular-nums text-muted-foreground">{q.totalFilled} preencheram</span>
                            {q.abandonedHere > 0 && (
                              <span className="text-destructive text-[10px] font-semibold tabular-nums">
                                {q.abandonedHere} abandonaram aqui
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden flex">
                          {(() => {
                            const maxFilled = questionDropoffData[0]?.totalFilled || 1;
                            const fillPct = Math.round(((q.totalFilled - q.abandonedHere) / maxFilled) * 100);
                            const dropPct = Math.round((q.abandonedHere / maxFilled) * 100);
                            return (
                              <>
                                <div
                                  className="h-full rounded-l-full transition-all duration-700"
                                  style={{
                                    width: `${Math.max(fillPct, q.totalFilled > 0 ? 2 : 0)}%`,
                                    background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))`,
                                  }}
                                />
                                {q.abandonedHere > 0 && (
                                  <div
                                    className="h-full transition-all duration-700"
                                    style={{
                                      width: `${dropPct}%`,
                                      background: `hsl(var(--destructive) / 0.6)`,
                                    }}
                                  />
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Top forms */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Top formulários
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topFormsData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topFormsData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} width={100} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="sessions" name="Sessões" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
                  <Bar dataKey="completed" name="Completas" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
