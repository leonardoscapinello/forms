import { useEffect, useMemo, useState, useCallback } from 'react';
import { FormData } from '@/types/form';
import { PageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, ChevronDown, ChevronUp, Filter, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [refreshing, setRefreshing] = useState(false);

  const fetchResponses = useCallback(() => {
    setLoading(true);
    (supabase as any)
      .from('form_responses')
      .select('id, response_id, answers, metadata, total_time_ms, pages_visited, created_at')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }: any) => {
        setRows((data || []) as ResponseRow[]);
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

  // Extract variables as extra columns
  const variableColumns = useMemo(() => {
    return (form.variables || []).map(v => ({
      key: `__var_${v.name}`,
      label: `⚡ ${v.name}`,
      type: v.type,
    }));
  }, [form.variables]);

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

  const exportCSV = useCallback(() => {
    const headers = ['#', 'ID', 'Status', 'Entrada', 'Envio', 'Duração', ...fields.map(f => f.label), ...variableColumns.map(v => v.label)];
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
      csvRows.push([idx + 1, hash, status, `"${entrada}"`, `"${envio}"`, `"${duration}"`, ...fieldVals, ...varVals].join(','));
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
                {fields.map((f, fi) => (
                  <TableHead key={`${f.id}-${f.subKey || fi}`} className="min-w-[160px] max-w-[280px]">
                    <span className="truncate block">{f.label}</span>
                  </TableHead>
                ))}
                {variableColumns.map(v => (
                  <TableHead key={v.key} className="min-w-[120px] max-w-[200px]">
                    <span className="truncate block text-primary/80">{v.label}</span>
                  </TableHead>
                ))}
              </TableRow>
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
