import { useEffect, useMemo, useState } from 'react';
import { FormData } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface Props {
  form: FormData;
}

type ResponseRow = {
  id: string;
  metadata: Record<string, any> | null;
};

export default function FormResponses({ form }: Props) {
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    (supabase as any)
      .from('form_responses')
      .select('id, metadata')
      .eq('form_id', form.id)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => {
        if (!active) return;
        setRows((data || []) as ResponseRow[]);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [form.id]);

  const { total, completed, partial } = useMemo(() => {
    const totalCount = rows.length;
    const completedCount = rows.filter(r => r.metadata?.status === 'complete').length;
    return {
      total: totalCount,
      completed: completedCount,
      partial: Math.max(totalCount - completedCount, 0),
    };
  }, [rows]);

  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md w-full">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          {loading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <span className="text-2xl">📋</span>}
        </div>
        <h2 className="text-xl font-semibold text-foreground">Respostas</h2>
        <p className="text-sm text-muted-foreground">
          {loading
            ? 'Carregando respostas...'
            : total > 0
              ? `${total} respostas coletadas até agora.`
              : 'Nenhuma resposta recebida ainda. Publique e compartilhe o formulário para começar a coletar respostas.'}
        </p>

        {!loading && total > 0 && (
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{completed}</p>
              <p className="text-xs text-muted-foreground">Completas</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{partial}</p>
              <p className="text-xs text-muted-foreground">Incompletas</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 col-span-2">
              <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
              <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

