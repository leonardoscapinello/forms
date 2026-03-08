import { useEffect, useMemo, useState, useCallback } from 'react';
import { FormData, TrackedParam, DEFAULT_TRACKED_PARAMS } from '@/types/form';
import { PageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, ChevronDown, ChevronUp, Filter, RefreshCw, Brain, Smile, Frown, Meh, AlertTriangle, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';


interface Props {
  form: FormData;
}

type ResponseRow = {
  id: string;
  response_id: string;
  answers: Record<string, any>;
  metadata: Record<string, any> | null;
  total_time_ms: number | null;
  pages_visited: number | null;
  created_at: string;
};

type StatusFilter = 'all' | 'complete' | 'partial';

/** Extract all input elements from the form pages — these become the table columns.
 *  Compound fields (address, company, phone) are expanded into sub-columns. */
function extractInputFields(form: FormData): { id: string; label: string; type: string; subKey?: string }[] {
  const fields: { id: string; label: string; type: string; subKey?: string }[] = [];
  for (const page of form.pages || []) {
    for (const el of page.elements || []) {
      if (el.type.startsWith('input_')) {
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys && subKeys.length > 0) {
          // Expand compound field into sub-columns
          const parentLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
          for (const sub of subKeys) {
            fields.push({
              id: el.id,
              label: `${parentLabel} — ${sub.label}`,
              type: el.type,
              subKey: sub.key,
            });
          }
        } else {
          fields.push({
            id: el.id,
            label: el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '),
            type: el.type,
          });
        }
      }
    }
  }
  return fields;
}

/** Format a cell value for display */
function formatCellValue(value: any, fieldType: string): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    // Phone fields store { full_number, ... }
    if (value.full_number) return value.full_number;
    // Address/company compound fields
    const parts = Object.values(value).filter(v => v && typeof v === 'string');
    return parts.length > 0 ? parts.join(', ') : JSON.stringify(value);
  }
  return String(value);
}

/** Resolve cell value, handling compound sub-keys */
function resolveCellValue(answers: Record<string, any>, field: { id: string; type: string; subKey?: string }): string {
  const raw = answers?.[field.id];
  if (field.subKey) {
    // Try compound object first
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return formatCellValue(raw[field.subKey], field.type);
    }
    // Try flattened key (e.g. elementId.subKey)
    const flatVal = answers?.[`${field.id}.${field.subKey}`];
    return formatCellValue(flatVal, field.type);
  }
  return formatCellValue(raw, field.type);
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function FormResponses({ form }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [refreshing, setRefreshing] = useState(false);
  const [sentimentData, setSentimentData] = useState<Record<string, any>>({});
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);

  const fetchResponses = useCallback(() => {
    setLoading(true);
    supabase.functions.invoke('form-responses-read', {
      body: { form_id: form.id, limit: 500 },
    }).then(({ data, error }: any) => {
      if (error) {
        console.error('Failed to fetch responses:', error);
        setRows([]);
      } else {
        setRows((data?.data || []) as ResponseRow[]);
      }
      setLoading(false);
      setRefreshing(false);
    });
  }, [form.id]);

  useEffect(() => { fetchResponses(); }, [fetchResponses]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchResponses();
  }, [fetchResponses]);

  const fields = useMemo(() => extractInputFields(form), [form]);

  const handleAnalyzeSentiment = useCallback(async () => {
    setAnalyzingSentiment(true);
    try {
      // Build form context with field labels and variables for richer analysis
      const formContext = {
        fields: fields.map(f => ({ id: f.id, label: f.label, type: f.type })),
        variables: (form.variables || []).map(v => ({ name: v.name, type: v.type })),
      };
      const { data, error } = await supabase.functions.invoke('analyze-sentiment', {
        body: { form_id: form.id, form_context: formContext },
      });
      if (error) throw error;
      if (data?.results) {
        const map: Record<string, any> = {};
        for (const r of data.results) { map[r.id] = r; }
        setSentimentData(map);
        toast({ title: 'Análise concluída', description: `${data.results.length} respostas analisadas` });
      }
    } catch (e: any) {
      toast({ title: 'Erro na análise', description: e.message || 'Tente novamente', variant: 'destructive' });
    }
    setAnalyzingSentiment(false);
  }, [form.id, form.variables, fields, toast]);

  // Extract variables as extra columns
  const variableColumns = useMemo(() => {
    return (form.variables || []).map(v => ({
      key: `__var_${v.name}`,
      label: `⚡ ${v.name}`,
      type: v.type,
    }));
  }, [form.variables]);

  // Extract tracked GET params as columns
  const paramColumns = useMemo(() => {
    const params: TrackedParam[] = form.trackedParams || DEFAULT_TRACKED_PARAMS;
    return params.filter(p => p.enabled && p.key).map(p => ({
      key: `__param_${p.key}`,
      label: p.label || p.key,
    }));
  }, [form.trackedParams]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === 'complete') list = list.filter(r => r.metadata?.status === 'complete' || !!r.metadata?.submitted_at);
    if (statusFilter === 'partial') list = list.filter(r => r.metadata?.status !== 'complete' && !r.metadata?.submitted_at);
    if (sortDir === 'asc') list = [...list].reverse();
    return list;
  }, [rows, statusFilter, sortDir]);

  const { total, completed, partial } = useMemo(() => {
    const t = rows.length;
    const c = rows.filter(r => r.metadata?.status === 'complete' || !!r.metadata?.submitted_at).length;
    return { total: t, completed: c, partial: Math.max(t - c, 0) };
  }, [rows]);

  // Drop-off stats per field column
  const dropOffStats = useMemo(() => {
    if (rows.length === 0) return [];
    const totalCount = rows.length;
    return fields.map((field, idx) => {
      const answered = rows.filter(r => {
        const val = field.subKey
          ? (r.answers?.[field.id] && typeof r.answers[field.id] === 'object' && !Array.isArray(r.answers[field.id])
            ? r.answers[field.id][field.subKey]
            : r.answers?.[`${field.id}.${field.subKey}`])
          : r.answers?.[field.id];
        return val !== undefined && val !== null && val !== '';
      }).length;
      const pctOfTotal = Math.round((answered / totalCount) * 100);
      // Previous field answered count for sequential drop calculation
      const prevAnswered = idx === 0 ? totalCount : (() => {
        const pf = fields[idx - 1];
        return rows.filter(r => {
          const val = pf.subKey
            ? (r.answers?.[pf.id] && typeof r.answers[pf.id] === 'object' && !Array.isArray(r.answers[pf.id])
              ? r.answers[pf.id][pf.subKey]
              : r.answers?.[`${pf.id}.${pf.subKey}`])
            : r.answers?.[pf.id];
          return val !== undefined && val !== null && val !== '';
        }).length;
      })();
      const pctOfPrev = prevAnswered > 0 ? Math.round((answered / prevAnswered) * 100) : 0;
      const dropFromPrev = prevAnswered > 0 ? Math.round(((prevAnswered - answered) / prevAnswered) * 100) : 0;
      return { answered, pctOfTotal, pctOfPrev, dropFromPrev };
    });
  }, [rows, fields]);

  const exportCSV = useCallback(() => {
    const headers = ['#', 'ID', 'Status', 'Entrada', 'Envio', 'Duração', ...fields.map(f => f.label), ...variableColumns.map(v => v.label), ...paramColumns.map(p => `🔗 ${p.label}`)];
    const csvRows = [headers.join(',')];
    filtered.forEach((row, idx) => {
      const hash = row.metadata?.response_hash || row.response_id?.slice(0, 8).toUpperCase() || '';
      const status = (row.metadata?.status === 'complete' || !!row.metadata?.submitted_at) ? 'Completa' : 'Parcial';
      const entrada = formatDate(row.metadata?.landed_at || row.created_at);
      const envio = row.metadata?.submitted_at ? formatDate(row.metadata.submitted_at) : '—';
      const duration = formatDuration(row.total_time_ms);
      const fieldVals = fields.map(f => {
        const raw = resolveCellValue(row.answers, f);
        return `"${raw.replace(/"/g, '""')}"`;
      });
      const varVals = variableColumns.map(v => {
        const val = row.answers?.[v.key];
        return `"${formatCellValue(val, v.type).replace(/"/g, '""')}"`;
      });
      const paramVals = paramColumns.map(p => {
        const val = row.answers?.[p.key];
        return `"${(val !== undefined && val !== null ? String(val) : '—').replace(/"/g, '""')}"`;
      });
      csvRows.push([idx + 1, hash, status, `"${entrada}"`, `"${envio}"`, `"${duration}"`, ...fieldVals, ...varVals, ...paramVals].join(','));
    });
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respostas-${form.title || form.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, fields, form]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <span className="text-2xl">📋</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Respostas</h2>
          <p className="text-sm text-muted-foreground">
            Nenhuma resposta recebida ainda. Publique e compartilhe o formulário para começar a coletar respostas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground">{total} respostas</h2>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs font-normal">
              {completed} completas
            </Badge>
            <Badge variant="outline" className="text-xs font-normal">
              {partial} parciais
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all' ? 'Todas' : statusFilter === 'complete' ? 'Completas' : 'Parciais'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>Todas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('complete')}>Completas</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('partial')}>Parciais</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            className="gap-1.5"
          >
            {sortDir === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            {sortDir === 'desc' ? 'Mais recentes' : 'Mais antigas'}
          </Button>

          {/* Refresh */}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          {/* Sentiment — only if enabled */}
          {form.enableSentimentAnalysis && (
            <Button variant="outline" size="sm" onClick={handleAnalyzeSentiment} disabled={analyzingSentiment} className="gap-1.5">
              {analyzingSentiment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              Sentimentos
            </Button>
          )}

          {/* Export */}
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12 text-center sticky left-0 bg-muted/50 z-10">#</TableHead>
                <TableHead className="w-20 font-mono">ID</TableHead>
                <TableHead className="w-24 sticky left-12 bg-muted/50 z-10">Status</TableHead>
                <TableHead className="w-36">Entrada</TableHead>
                <TableHead className="w-36">Envio</TableHead>
                <TableHead className="w-20">Duração</TableHead>
                {Object.keys(sentimentData).length > 0 && (
                  <>
                    <TableHead className="w-28">Sentimento</TableHead>
                    <TableHead className="min-w-[160px]">Emoções</TableHead>
                  </>
                )}
                {fields.map((f, fi) => (
                  <TableHead key={`${f.id}-${f.subKey || fi}`} className="min-w-[160px] max-w-[280px]">
                    <span className="truncate block">{f.label}</span>
                  </TableHead>
                ))}
                {variableColumns.map(v => (
                  <TableHead key={v.key} className="min-w-[120px] max-w-[200px]">
                    <span className="truncate block text-[#8A7D4A]">{v.label}</span>
                  </TableHead>
                ))}
                {paramColumns.map(p => (
                  <TableHead key={p.key} className="min-w-[120px] max-w-[200px]">
                    <span className="truncate block text-muted-foreground">🔗 {p.label}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
              {/* Drop-off analysis row */}
              {fields.length > 0 && dropOffStats.length > 0 && (
                <TableRow className="bg-muted/30 border-b-2 border-border">
                  <TableCell className="sticky left-0 bg-muted/30 z-10" />
                  <TableCell />
                  <TableCell className="sticky left-12 bg-muted/30 z-10">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      <TrendingDown className="h-3 w-3" />
                      Drop-off
                    </div>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell />
                  {Object.keys(sentimentData).length > 0 && (
                    <>
                      <TableCell />
                      <TableCell />
                    </>
                  )}
                  {fields.map((f, fi) => {
                    const stat = dropOffStats[fi];
                    if (!stat) return <TableCell key={`drop-${f.id}-${f.subKey || fi}`} />;
                    const barColor = stat.pctOfTotal >= 70
                      ? 'bg-emerald-500'
                      : stat.pctOfTotal >= 40
                        ? 'bg-amber-500'
                        : 'bg-destructive';
                    const dropColor = stat.dropFromPrev > 20
                      ? 'text-destructive'
                      : stat.dropFromPrev > 10
                        ? 'text-amber-600'
                        : 'text-muted-foreground';
                    return (
                      <TableCell key={`drop-${f.id}-${f.subKey || fi}`} className="min-w-[160px] max-w-[280px]">
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="space-y-1 cursor-default">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold tabular-nums">{stat.pctOfTotal}%</span>
                                  {fi > 0 && stat.dropFromPrev > 0 && (
                                    <span className={`text-[10px] font-medium ${dropColor}`}>
                                      −{stat.dropFromPrev}%
                                    </span>
                                  )}
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                    style={{ width: `${stat.pctOfTotal}%` }}
                                  />
                                </div>
                                <div className="text-[9px] text-muted-foreground tabular-nums">
                                  {stat.answered}/{total} responderam
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs space-y-1 max-w-[200px]">
                              <p className="font-semibold">{f.label}</p>
                              <p>{stat.answered} de {total} responderam ({stat.pctOfTotal}%)</p>
                              {fi > 0 && (
                                <p className={dropColor}>
                                  {stat.dropFromPrev > 0
                                    ? `${stat.dropFromPrev}% abandonaram desde o campo anterior`
                                    : 'Sem abandono em relação ao campo anterior'}
                                </p>
                              )}
                              {fi > 0 && <p>Conversão sequencial: {stat.pctOfPrev}%</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    );
                  })}
                  {variableColumns.map(v => <TableCell key={`drop-${v.key}`} />)}
                  {paramColumns.map(p => <TableCell key={`drop-${p.key}`} />)}
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {filtered.map((row, idx) => {
                const isComplete = row.metadata?.status === 'complete' || !!row.metadata?.submitted_at;
                return (
                  <TableRow key={row.id} className="group hover:bg-muted/30">
                    <TableCell className="text-center text-xs text-muted-foreground sticky left-0 bg-background group-hover:bg-muted/30 z-10">
                      {sortDir === 'desc' ? filtered.length - idx : idx + 1}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {row.metadata?.response_hash || row.response_id?.slice(0, 8).toUpperCase() || '—'}
                    </TableCell>
                    <TableCell className="sticky left-12 bg-background group-hover:bg-muted/30 z-10">
                      <Badge
                        variant={isComplete ? 'default' : 'outline'}
                        className={`text-[10px] ${isComplete ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                      >
                        {isComplete ? 'Completa' : 'Parcial'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(row.metadata?.landed_at || row.created_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.metadata?.submitted_at ? formatDate(row.metadata.submitted_at) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDuration(row.total_time_ms)}
                    </TableCell>
                    {Object.keys(sentimentData).length > 0 && (() => {
                      const s = sentimentData[row.id];
                      const icon = s?.sentiment === 'positive' ? <Smile className="h-3.5 w-3.5 text-emerald-500" /> :
                        s?.sentiment === 'negative' ? <Frown className="h-3.5 w-3.5 text-destructive" /> :
                        s?.sentiment === 'mixed' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> :
                        <Meh className="h-3.5 w-3.5 text-muted-foreground" />;
                      return (
                        <>
                          <TableCell className="text-xs">
                            {s ? (
                              <div className="flex items-center gap-1.5" title={s.summary}>
                                {icon}
                                <span className="capitalize">{s.sentiment}</span>
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s?.emotions?.length ? (
                              <div className="flex flex-wrap gap-1">
                                {s.emotions.slice(0, 3).map((e: string) => (
                                  <Badge key={e} variant="outline" className="text-[9px] py-0 px-1.5">{e}</Badge>
                                ))}
                              </div>
                            ) : '—'}
                          </TableCell>
                        </>
                      );
                    })()}
                    {fields.map((f, fi) => (
                      <TableCell key={`${f.id}-${f.subKey || fi}`} className="text-sm max-w-[280px]">
                        <span className="truncate block" title={resolveCellValue(row.answers, f)}>
                          {resolveCellValue(row.answers, f)}
                        </span>
                      </TableCell>
                    ))}
                    {variableColumns.map(v => (
                      <TableCell key={v.key} className="text-sm max-w-[200px]">
                        <span className="truncate block" title={formatCellValue(row.answers?.[v.key], v.type)}>
                          {formatCellValue(row.answers?.[v.key], v.type)}
                        </span>
                      </TableCell>
                    ))}
                    {paramColumns.map(p => (
                      <TableCell key={p.key} className="text-sm max-w-[200px]">
                        <span className="truncate block" title={row.answers?.[p.key] ?? '—'}>
                          {row.answers?.[p.key] || '—'}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
