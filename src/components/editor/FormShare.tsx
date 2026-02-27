import { useState, useCallback, useEffect, useMemo } from 'react';
import { FormData } from '@/types/form';
import { PageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Check, Copy, Link, ExternalLink, Globe, Loader2, CheckCircle2,
  Unplug, Sheet, Webhook, ChevronDown,
} from 'lucide-react';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

const PUBLISHED_BASE = 'https://nodecraft-forms.lovable.app';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast({ description: `${label} copiado!` });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="flex-1 bg-muted border-border text-sm text-foreground" />
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        Copiar
      </Button>
    </div>
  );
}

/** Extract input fields from pages — same logic as FormResponses */
function extractFieldHeaders(form: FormData): string[] {
  const headers: string[] = [];
  for (const page of form.pages || []) {
    for (const el of (page.elements || []) as PageElement[]) {
      if (el.type.startsWith('input_')) {
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys && subKeys.length > 0) {
          const parentLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
          for (const sub of subKeys) {
            headers.push(`${parentLabel} — ${sub.label}`);
          }
        } else {
          headers.push(el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '));
        }
      }
    }
  }
  return headers;
}

export default function FormShare({ form, onUpdate }: Props) {
  const previewUrl = `${PUBLISHED_BASE}/preview/${form.id}`;
  const isPublished = form.status === 'published';
  const { toast } = useToast();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleOAuthReady, setGoogleOAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Check if Google OAuth is configured
  useEffect(() => {
    supabase
      .from('integration_settings')
      .select('config, is_active')
      .eq('integration_type', 'google_oauth')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.is_active) {
          const cfg = data.config as any;
          setGoogleOAuthReady(!!cfg?.accessToken);
        }
      });
  }, []);

  const handleConnectSheet = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const headers = ['#', 'Status', 'Entrada', 'Envio', 'Duração', ...extractFieldHeaders(form)];
      const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
        body: {
          action: 'create',
          formId: form.id,
          formTitle: form.title,
          headers,
        },
      });
      if (error || !data?.spreadsheetId) {
        toast({ title: 'Erro', description: data?.error || 'Falha ao criar planilha.', variant: 'destructive' });
        setGoogleLoading(false);
        return;
      }
      onUpdate({
        googleSheetId: data.spreadsheetId,
        googleSheetUrl: data.spreadsheetUrl,
      });
      toast({ title: 'Planilha criada!', description: 'Google Sheets conectado com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
    setGoogleLoading(false);
  }, [form, onUpdate, toast]);

  const handleSyncNow = useCallback(async () => {
    if (!form.googleSheetId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
        body: {
          action: 'sync',
          formId: form.id,
          formTitle: form.title,
          spreadsheetId: form.googleSheetId,
        },
      });
      if (error || !data?.success) {
        toast({ title: 'Erro', description: data?.error || 'Falha ao sincronizar.', variant: 'destructive' });
      } else {
        toast({ title: 'Sincronizado!', description: `${data.rowsWritten || 0} respostas enviadas.` });
      }
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
    setSyncing(false);
  }, [form, toast]);

  const handleDisconnectSheet = useCallback(() => {
    onUpdate({ googleSheetId: undefined, googleSheetUrl: undefined });
    toast({ title: 'Desconectado', description: 'Google Sheets desconectado deste formulário.' });
  }, [onUpdate, toast]);

  const isSheetConnected = !!form.googleSheetId;
  const [showPayload, setShowPayload] = useState(false);

  // Build example webhook payload for preview
  const examplePayload = useMemo(() => {
    const fields: any[] = [];
    for (const page of form.pages || []) {
      for (const el of (page.elements || []) as PageElement[]) {
        if (!el.type.startsWith('input_')) continue;
        fields.push({
          field_id: el.id,
          field_name: el.fieldName || el.id,
          type: el.type.replace('input_', ''),
          label: el.label || null,
          placeholder: el.placeholder || null,
          required: el.required ?? false,
          value: '<valor respondido>',
          raw_value: '<valor bruto>',
        });
      }
    }
    return {
      event: {
        id: '<response_uuid>',
        form_id: form.id,
        form_name: form.title,
        form_status: form.status,
        total_pages: (form.pages || []).length,
        landed_at: '2025-01-01T12:00:00.000Z',
        submitted_at: '2025-01-01T12:05:30.000Z',
        total_time_ms: 330000,
        total_time_seconds: 330,
      },
      respondent: {
        ip: null,
        user_agent: 'Mozilla/5.0 ...',
        geolocation: null,
      },
      navigation: {
        source_url: 'https://example.com/page',
        referrer: 'https://google.com',
        query_params: { utm_source: 'email', utm_campaign: 'test' },
      },
      fields,
      answers: Object.fromEntries(fields.map(f => [f.field_name, '<valor>'])),
      answers_raw: Object.fromEntries(fields.map(f => [f.field_id, '<valor bruto>'])),
      variables: Object.fromEntries((form.variables || []).map(v => [v.name, '<valor>'])),
      meta: undefined,
    };
  }, [form]);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Compartilhar</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Distribua seu formulário e conecte integrações.
          </p>
        </div>

        {/* Status banner */}
        {!isPublished && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-4 py-3">
            <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              O formulário está em rascunho. <strong>Publique</strong> para que o link funcione publicamente.
            </p>
          </div>
        )}

        {/* ── Section: Link ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Seus links do formulário</h3>
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <CopyField label="Link público" value={previewUrl} />
            <Button variant="outline" size="sm" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir em nova aba
              </a>
            </Button>
          </div>
        </div>

        {/* ── Section: Integrations grid ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Integrações</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Google Sheets card */}
            <button
              onClick={isSheetConnected ? undefined : handleConnectSheet}
              disabled={googleLoading || !googleOAuthReady}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 transition-all hover:shadow-sm ${
                isSheetConnected
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : googleOAuthReady
                    ? 'border-border hover:border-primary/40 cursor-pointer'
                    : 'border-border opacity-50 cursor-not-allowed'
              }`}
            >
              {isSheetConnected && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
              )}
              {googleLoading ? (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              ) : (
                <svg className="h-10 w-10" viewBox="0 0 48 48">
                  <path fill="#43A047" d="M37 45H11c-1.66 0-3-1.34-3-3V6c0-1.66 1.34-3 3-3h17l12 12v27c0 1.66-1.34 3-3 3z" />
                  <path fill="#C8E6C9" d="M40 15H28V3z" />
                  <path fill="#2E7D32" d="M40 15H28V3l12 12z" opacity=".3" />
                  <path fill="#E8F5E9" d="M14 19h20v18H14z" />
                  <path fill="#43A047" d="M34 19v18H14V19h20m0-1H14c-.55 0-1 .45-1 1v18c0 .55.45 1 1 1h20c.55 0 1-.45 1-1V19c0-.55-.45-1-1-1z" />
                  <path fill="#43A047" d="M14 23h20v1H14zm0 4h20v1H14zm0 4h20v1H14zm7-12h1v18h-1zm6 0h1v18h-1z" />
                </svg>
              )}
              <span className="text-sm font-medium text-foreground">Google Sheets</span>
            </button>

            {/* Placeholder cards for future */}
            {['WhatsApp', 'Slack'].map(name => (
              <div
                key={name}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-6 opacity-40"
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-lg">📌</span>
                </div>
                <span className="text-sm font-medium text-muted-foreground">{name}</span>
                <span className="text-[10px] text-muted-foreground">Em breve</span>
              </div>
            ))}
          </div>

          {!googleOAuthReady && (
            <p className="text-xs text-muted-foreground">
              Configure o <strong>Google OAuth2</strong> em{' '}
              <a href="/settings" className="text-primary underline">Configurações → Integrações</a>{' '}
              para conectar o Google Sheets.
            </p>
          )}
        </div>

        {/* ── Connected Sheet details ── */}
        {isSheetConnected && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-semibold text-foreground">Google Sheets conectado</span>
            </div>
            <p className="text-xs text-muted-foreground">
              As respostas serão sincronizadas para a planilha com as mesmas colunas da aba Respostas.
            </p>
            {form.googleSheetUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={form.googleSheetUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Abrir planilha
                </a>
              </Button>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing} className="gap-1.5">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
                Sincronizar agora
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDisconnectSheet} className="gap-1.5 text-muted-foreground hover:text-destructive">
                <Unplug className="h-3.5 w-3.5" />
                Desconectar
              </Button>
            </div>
          </div>
        )}

        {/* ── Section: Webhook ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Webhook className="h-4 w-4 text-muted-foreground" />
            Webhook de conclusão
          </h3>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <p className="text-xs text-muted-foreground">
              Receba um POST com todos os dados da resposta sempre que alguém completar o formulário.
            </p>
            <div className="space-y-1.5">
              <Input
                value={form.completionWebhookUrl || ''}
                onChange={e => onUpdate({ completionWebhookUrl: e.target.value })}
                placeholder="https://hooks.exemplo.com/webhook"
                className="text-sm font-mono"
              />
            </div>
            {form.completionWebhookUrl && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ativo — será disparado ao completar o formulário
              </div>
            )}

            {/* Payload preview */}
            <div>
              <button
                onClick={() => setShowPayload(!showPayload)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPayload ? 'rotate-180' : ''}`} />
                Ver modelo do payload ({examplePayload.fields.length} campos)
              </button>
              {showPayload && (
                <pre className="mt-2 rounded-lg bg-muted p-4 text-[11px] font-mono overflow-x-auto max-h-96 overflow-y-auto text-foreground/80 whitespace-pre-wrap">
                  {JSON.stringify(examplePayload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
