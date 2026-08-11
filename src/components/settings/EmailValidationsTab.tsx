import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Loader2, RefreshCw, Trash2, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Shield, Mail,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { formatEmailValidationIdentifier } from '@/lib/emailValidationIdentifier';
import { withIntegrationTimeout } from '@/lib/integrationSettings';
import { hasSingleIdAck } from '@/lib/databaseAck';

interface EmailValidation {
  id: string;
  email: string;
  status: string;
  overall_score: number;
  is_safe_to_send: boolean | null;
  is_disposable: boolean | null;
  is_valid_syntax: boolean | null;
  is_role_account: boolean | null;
  is_free_email: boolean | null;
  is_catch_all: boolean | null;
  is_spamtrap: boolean | null;
  domain: string | null;
  verification_mode: string | null;
  created_at: string;
  updated_at: string;
}

type FilterStatus = 'all' | 'safe' | 'risky' | 'invalid';

const PAGE_SIZE = 15;

function statusBadge(record: EmailValidation) {
  if (record.is_safe_to_send === true) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
        <CheckCircle2 className="h-3 w-3" /> Seguro
      </span>
    );
  }
  if (record.is_disposable || record.is_spamtrap) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
        <XCircle className="h-3 w-3" /> {record.is_spamtrap ? 'Spamtrap' : 'Descartável'}
      </span>
    );
  }
  if (record.is_safe_to_send === false) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600">
        <AlertTriangle className="h-3 w-3" /> Arriscado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      Pendente
    </span>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600';
  if (score >= 50) return 'text-orange-500';
  return 'text-destructive';
}

export default function EmailValidationsTab() {
  const { toast } = useToast();
  const [records, setRecords] = useState<EmailValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<EmailValidation | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidateEmail, setRevalidateEmail] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('email_validations').select('*', { count: 'exact' });

      if (search.trim()) {
        query = query.or(`email.ilike.%${search.trim()}%,domain.ilike.%${search.trim()}%`);
      }

      if (filter === 'safe') query = query.eq('is_safe_to_send', true);
      else if (filter === 'risky') query = query.eq('is_safe_to_send', false).eq('is_disposable', false).eq('is_spamtrap', false);
      else if (filter === 'invalid') query = query.or('is_disposable.eq.true,is_spamtrap.eq.true');

      const { data, count, error } = await withIntegrationTimeout(Promise.resolve(
        query
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
      ));
      if (error) throw error;
      setRecords((data as EmailValidation[]) || []);
      setTotal(count || 0);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar validações',
        description: error?.message || 'Não foi possível carregar o histórico.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [search, filter, page, toast]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Reset page when filter/search changes
  useEffect(() => { setPage(0); }, [search, filter]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const { data, error } = await withIntegrationTimeout(Promise.resolve(
        supabase.from('email_validations').delete().eq('id', id).select('id').maybeSingle(),
      ));
      if (error || !hasSingleIdAck(data, id)) throw error || new Error('O servidor não confirmou a exclusão.');
      toast({ title: 'Excluído', description: 'Registro removido.' });
      if (selected?.id === id) setSelected(null);
      void fetchRecords();
    } catch (error: any) {
      toast({ title: 'Erro', description: error?.message || 'Não foi possível excluir.', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  }, [selected, toast, fetchRecords]);

  const handleRevalidate = useCallback(async () => {
    const email = revalidateEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'E-mail inválido', description: 'Digite novamente um endereço válido.', variant: 'destructive' });
      return;
    }
    setRevalidating(true);
    try {
      const res = await withIntegrationTimeout(
        supabase.functions.invoke('verify-email', { body: { email, force: true } }),
        20_000,
      );
      if (res.error) throw res.error;
      const data = res.data as any;
      if (typeof data?.is_safe_to_send === 'boolean') {
        toast({ title: 'Validação concluída', description: `Score: ${data.overall_score ?? '—'}` });
        setSelected(null);
      } else {
        toast({ title: 'Sem resultado', description: 'Verifique se o Reoon está configurado.', variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Erro', description: error?.message || 'Falha na validação.', variant: 'destructive' });
    } finally {
      setRevalidateEmail('');
      setRevalidating(false);
      void fetchRecords();
    }
  }, [revalidateEmail, toast, fetchRecords]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header / Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por identificador ou domínio..."
            className="pl-9 text-sm"
          />
        </div>

        <Select value={filter} onValueChange={v => setFilter(v as FilterStatus)}>
          <SelectTrigger className="w-36 text-sm">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="safe">Seguros</SelectItem>
            <SelectItem value="risky">Arriscados</SelectItem>
            <SelectItem value="invalid">Descartáveis / Spam</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={fetchRecords} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">
          {total} registro(s)
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading && records.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Mail className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">Nenhuma validação encontrada</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identificador seguro</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modo</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-mono font-medium text-foreground">{formatEmailValidationIdentifier(r.email)}</p>
                      {r.domain && <p className="text-xs text-muted-foreground">{r.domain}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(r)}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${scoreColor(r.overall_score)}`}>{r.overall_score}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{r.verification_mode || '—'}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        title="Excluir"
                      >
                        {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={open => {
        if (!open) {
          setSelected(null);
          setRevalidateEmail('');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Detalhes da validação
            </DialogTitle>
            <DialogDescription>
              Identificador: {formatEmailValidationIdentifier(selected?.email)}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {statusBadge(selected)}
                <span className={`text-lg font-bold ${scoreColor(selected.overall_score)}`}>
                  Score: {selected.overall_score}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailRow label="Domínio" value={selected.domain || '—'} />
                <DetailRow label="Modo" value={selected.verification_mode || '—'} />
                <DetailRow label="Sintaxe válida" value={boolLabel(selected.is_valid_syntax)} />
                <DetailRow label="Seguro p/ envio" value={boolLabel(selected.is_safe_to_send)} />
                <DetailRow label="Descartável" value={boolLabel(selected.is_disposable)} warn={selected.is_disposable === true} />
                <DetailRow label="Conta genérica" value={boolLabel(selected.is_role_account)} />
                <DetailRow label="E-mail gratuito" value={boolLabel(selected.is_free_email)} />
                <DetailRow label="Catch-all" value={boolLabel(selected.is_catch_all)} />
                <DetailRow label="Spamtrap" value={boolLabel(selected.is_spamtrap)} warn={selected.is_spamtrap === true} />
                <DetailRow label="Criado em" value={new Date(selected.created_at).toLocaleString('pt-BR')} />
                <DetailRow label="Atualizado em" value={new Date(selected.updated_at).toLocaleString('pt-BR')} />
              </div>

              <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
                <Label htmlFor="revalidate-email" className="text-xs text-muted-foreground">
                  Digite novamente o e-mail para revalidar
                </Label>
                <Input
                  id="revalidate-email"
                  type="email"
                  autoComplete="off"
                  value={revalidateEmail}
                  onChange={event => setRevalidateEmail(event.target.value)}
                  placeholder="pessoa@exemplo.com"
                  disabled={revalidating}
                />
                <p className="text-[11px] text-muted-foreground">
                  O endereço é usado somente nesta validação e removido da tela ao concluir.
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={handleRevalidate} disabled={revalidating || !revalidateEmail.trim()}>
                  {revalidating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Revalidar e-mail digitado
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleDelete(selected.id)} disabled={deleting === selected.id}>
                  {deleting === selected.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                  Excluir
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium ${warn ? 'text-destructive' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function boolLabel(v: boolean | null): string {
  if (v === true) return 'Sim';
  if (v === false) return 'Não';
  return '—';
}
