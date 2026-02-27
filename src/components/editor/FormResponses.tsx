import { useEffect, useMemo, useState, useCallback } from 'react';
import { FormData } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Download, ChevronDown, ChevronUp, Filter } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';

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

/** Extract all input elements from the form pages — these become the table columns */
function extractInputFields(form: FormData): { id: string; label: string; type: string }[] {
  const fields: { id: string; label: string; type: string }[] = [];
  for (const page of form.pages || []) {
    for (const el of page.elements || []) {
      if (el.type.startsWith('input_')) {
        fields.push({
          id: el.id,
          label: el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '),
          type: el.type,
        });
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    (supabase as any)
      .from('form_responses')
      .select('id, response_id, answers, metadata, total_time_ms, pages_visited, created_at')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }: any) => {
        if (!active) return;
        setRows((data || []) as ResponseRow[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [form.id]);

  const fields = useMemo(() => extractInputFields(form), [form]);

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
    const headers = ['#', 'Status', 'Entrada', 'Envio', 'Duração', ...fields.map(f => f.label)];
    const csvRows = [headers.join(',')];
    filtered.forEach((row, idx) => {
      const status = (row.metadata?.status === 'complete' || !!row.metadata?.submitted_at) ? 'Completa' : 'Parcial';
      const entrada = formatDate(row.metadata?.landed_at || row.created_at);
      const envio = row.metadata?.submitted_at ? formatDate(row.metadata.submitted_at) : '—';
      const duration = formatDuration(row.total_time_ms);
      const fieldVals = fields.map(f => {
        const raw = formatCellValue(row.answers?.[f.id], f.type);
        // Escape CSV
        return `"${raw.replace(/"/g, '""')}"`;
      });
      csvRows.push([idx + 1, status, `"${entrada}"`, `"${envio}"`, `"${duration}"`, ...fieldVals].join(','));
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

          {/* Export */}
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        <div className="min-w-max">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-12 text-center sticky left-0 bg-muted/50 z-10">#</TableHead>
                <TableHead className="w-24 sticky left-12 bg-muted/50 z-10">Status</TableHead>
                <TableHead className="w-36">Entrada</TableHead>
                <TableHead className="w-36">Envio</TableHead>
                <TableHead className="w-20">Duração</TableHead>
                {fields.map(f => (
                  <TableHead key={f.id} className="min-w-[160px] max-w-[280px]">
                    <span className="truncate block">{f.label}</span>
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
                    {fields.map(f => (
                      <TableCell key={f.id} className="text-sm max-w-[280px]">
                        <span className="truncate block" title={formatCellValue(row.answers?.[f.id], f.type)}>
                          {formatCellValue(row.answers?.[f.id], f.type)}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </ScrollArea>
    </div>
  );
}
