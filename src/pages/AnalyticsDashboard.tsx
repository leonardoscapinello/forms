import { useState, useEffect, useMemo } from 'react';
import { useFormStore } from '@/hooks/useFormStore';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3, Users, TrendingUp, Clock, ArrowDownRight, Activity, Eye, CheckCircle2, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { format, subDays, startOfDay, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

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

const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(48, 80%, 55%)',
  'hsl(160, 50%, 45%)',
  'hsl(340, 60%, 55%)',
  'hsl(200, 60%, 50%)',
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
            trend === 'up' ? 'bg-emerald-500/10 text-emerald-600' :
            trend === 'down' ? 'bg-rose-500/10 text-rose-500' :
            'bg-accent text-muted-foreground'
          }`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── main ── */
export default function AnalyticsDashboard() {
  const { forms } = useFormStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pageEvents, setPageEvents] = useState<PageEvent[]>([]);
  const [days, setDays] = useState('30');
  const [formFilter, setFormFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const since = useMemo(() => startOfDay(subDays(new Date(), Number(days))).toISOString(), [days]);

  /* fetch data */
  const fetchData = async () => {
    setLoading(true);
    const [sessRes, evtRes] = await Promise.all([
      supabase.from('form_sessions').select('id, form_id, status, started_at, completed_at, pages_visited, total_pages').gte('started_at', since).order('started_at', { ascending: false }).limit(1000),
      supabase.from('form_page_events').select('form_id, page_index, page_title, event_type, time_on_page_ms').gte('created_at', since).limit(1000),
    ]);
    setSessions((sessRes.data as Session[]) || []);
    setPageEvents((evtRes.data as PageEvent[]) || []);
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

  /* dropoff funnel — page-level */
  const funnelData = useMemo(() => {
    const pageMap: Record<number, { index: number; title: string; views: number; avgTimeMs: number; timesArr: number[] }> = {};
    filteredEvents.forEach(e => {
      const idx = e.page_index ?? 0;
      if (!pageMap[idx]) pageMap[idx] = { index: idx, title: e.page_title || `Página ${idx + 1}`, views: 0, avgTimeMs: 0, timesArr: [] };
      pageMap[idx].views++;
      if (e.time_on_page_ms) pageMap[idx].timesArr.push(e.time_on_page_ms);
    });
    const sorted = Object.values(pageMap).sort((a, b) => a.index - b.index);
    sorted.forEach(p => {
      p.avgTimeMs = p.timesArr.length > 0 ? p.timesArr.reduce((s, v) => s + v, 0) / p.timesArr.length : 0;
    });
    return sorted;
  }, [filteredEvents]);

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

  /* completion rate per form (pie) */
  const pieData = useMemo(() => {
    return [
      { name: 'Completas', value: completedSessions.length, color: 'hsl(160, 50%, 45%)' },
      { name: 'Abandonos', value: totalSessions - completedSessions.length, color: 'hsl(340, 60%, 55%)' },
    ];
  }, [completedSessions.length, totalSessions]);

  const tooltipStyle = {
    contentStyle: { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, fontSize: 12 },
    labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
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
                      <stop offset="0%" stopColor="hsl(160,50%,45%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(160,50%,45%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={v => format(parseISO(v), 'dd/MM')} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} labelFormatter={v => format(parseISO(v as string), "dd 'de' MMMM", { locale: ptBR })} />
                  <Area type="monotone" dataKey="sessões" stroke="hsl(var(--primary))" fill="url(#grad-sessions)" strokeWidth={2} />
                  <Area type="monotone" dataKey="completas" stroke="hsl(160,50%,45%)" fill="url(#grad-completed)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Completion pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Conclusão vs Abandono</CardTitle>
            </CardHeader>
            <CardContent className="h-[260px] flex items-center justify-center">
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

        {/* Funnel + Top forms */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Dropoff funnel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
                Funil de drop-off por página
              </CardTitle>
            </CardHeader>
            <CardContent>
              {funnelData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem dados de páginas</p>
              ) : (
                <div className="space-y-2">
                  {funnelData.map((page, i) => {
                    const maxViews = funnelData[0]?.views || 1;
                    const pct = Math.round((page.views / maxViews) * 100);
                    const dropPct = i > 0 ? Math.round(((funnelData[i - 1].views - page.views) / funnelData[i - 1].views) * 100) : 0;
                    return (
                      <div key={page.index} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground truncate max-w-[180px]">{page.title}</span>
                          <div className="flex items-center gap-3">
                            <span className="tabular-nums text-muted-foreground">{page.views} views</span>
                            {i > 0 && dropPct > 0 && (
                              <span className="text-rose-500 text-[10px] font-semibold">-{dropPct}%</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">{msToReadable(page.avgTimeMs)}</span>
                          </div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                    <Bar dataKey="completed" name="Completas" fill="hsl(160,50%,45%)" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
