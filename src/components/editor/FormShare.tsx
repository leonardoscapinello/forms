import { useState, useCallback, useEffect, useMemo } from 'react';
import { FormData } from '@/types/form';
import { PageElement, COMPOUND_FIELD_SUB_KEYS } from '@/types/pageElements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Check, Copy, ExternalLink, Globe, Loader2, CheckCircle2,
  Unplug, Sheet, Webhook, ChevronDown, Link2, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

interface Props {
  form: FormData;
  onUpdate: (patch: Partial<FormData>) => void;
}

const PUBLISHED_BASE = 'https://nodecraft-forms.lovable.app';

/* ── Helpers ── */

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
      <Input readOnly value={value} className="flex-1 bg-muted border-border text-sm text-foreground font-mono" />
      <Button variant="outline" size="sm" onClick={copy} className="shrink-0 gap-1.5">
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function extractFieldHeaders(form: FormData): string[] {
  const headers: string[] = [];
  for (const page of form.pages || []) {
    for (const el of (page.elements || []) as PageElement[]) {
      if (el.type.startsWith('input_')) {
        const subKeys = COMPOUND_FIELD_SUB_KEYS[el.type];
        if (subKeys && subKeys.length > 0) {
          const parentLabel = el.label || el.type.replace('input_', '').replace(/_/g, ' ');
          for (const sub of subKeys) headers.push(`${parentLabel} — ${sub.label}`);
        } else {
          headers.push(el.label || el.placeholder || el.type.replace('input_', '').replace(/_/g, ' '));
        }
      }
    }
  }
  // Add variables as columns
  for (const v of form.variables || []) {
    headers.push(`⚡ ${v.name}`);
  }
  return headers;
}

/* ── Integration card type ── */
interface IntegrationDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string; // tailwind bg class token
  comingSoon?: boolean;
}

/* ── Main component ── */
export default function FormShare({ form, onUpdate }: Props) {
  const previewUrl = `${PUBLISHED_BASE}/f/${form.id}`;
  const isPublished = form.status === 'published';
  const { toast } = useToast();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleOAuthReady, setGoogleOAuthReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openModal, setOpenModal] = useState<string | null>(null);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<null | { ok: boolean; status: number }>(null);
  const [webhookDraftUrl, setWebhookDraftUrl] = useState(form.completionWebhookUrl || '');

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

  /* ── Google Sheets handlers ── */
  const handleConnectSheet = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const headers = ['#', 'Status', 'Entrada', 'Envio', 'Duração', ...extractFieldHeaders(form)];
      const { data, error } = await supabase.functions.invoke('google-sheets-sync', {
        body: { action: 'create', formId: form.id, formTitle: form.title, headers },
      });
      if (error || !data?.spreadsheetId) {
        toast({ title: 'Erro', description: data?.error || 'Falha ao criar planilha.', variant: 'destructive' });
      } else {
        onUpdate({ googleSheetId: data.spreadsheetId, googleSheetUrl: data.spreadsheetUrl });
        toast({ title: 'Planilha criada!', description: 'Google Sheets conectado.' });
      }
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
        body: { action: 'sync', formId: form.id, formTitle: form.title, spreadsheetId: form.googleSheetId },
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
    toast({ description: 'Google Sheets desconectado.' });
    setOpenModal(null);
  }, [onUpdate, toast]);

  /* ── Webhook payload preview ── */
  const [showPayload, setShowPayload] = useState(false);
  const examplePayload = useMemo(() => {
    const fields: any[] = [];
    for (const page of form.pages || []) {
      for (const el of (page.elements || []) as PageElement[]) {
        if (!el.type.startsWith('input_')) continue;
        fields.push({
          field_id: el.id,
          field_name: el.fieldName || el.id,
          type: el.type.replace('input_', ''),
          label: el.label || el.placeholder || null,
          answer: '<valor respondido>',
          answer_raw: '<valor bruto>',
          required: el.required ?? false,
        });
      }
    }
    return {
      event: { form_id: form.id, form_name: form.title, submitted_at: '2025-01-01T12:05:30Z', total_time_seconds: 330 },
      navigation: { source_url: 'https://...', query_params: { utm_source: 'email' } },
      fields,
      variables: Object.fromEntries((form.variables || []).map(v => [v.name, '<valor>'])),
      pixel_events: {
        total_fired: 2,
        events: [
          { platform: 'meta_pixel', event_name: 'Lead', event_id: 'abc123_dedup', trigger_type: 'flow_node', fired_client: true, fired_server: true, fired_at: '2025-01-01T12:05:29Z' },
          { platform: 'google_analytics', event_name: 'generate_lead', event_id: 'xyz789_dedup', trigger_type: 'load_event', fired_client: false, fired_server: true, fired_at: '2025-01-01T12:00:01Z' },
        ],
      },
    };
  }, [form]);

  /* ── Status flags ── */
  const isSheetConnected = !!form.googleSheetId;
  const isWebhookConnected = !!form.completionWebhookUrl;

  const handleWebhookTest = useCallback(async () => {
    if (!webhookDraftUrl) return;
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('webhook-test', {
        body: { url: webhookDraftUrl, payload: { ...examplePayload, _test: true } },
      });
      if (error) {
        setWebhookTestResult({ ok: false, status: 0 });
        toast({ title: 'Erro', description: 'Falha ao testar webhook.', variant: 'destructive' });
      } else {
        const result = { ok: data.ok, status: data.status };
        setWebhookTestResult(result);
        if (result.ok) {
          onUpdate({ completionWebhookUrl: webhookDraftUrl });
          toast({ title: 'Webhook conectado!', description: `Resposta ${result.status} — URL salva.` });
        } else {
          toast({ title: 'Falha no teste', description: `Status ${result.status || 'erro'} — URL não salva.`, variant: 'destructive' });
        }
      }
    } catch (err: any) {
      setWebhookTestResult({ ok: false, status: 0 });
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
    setWebhookTesting(false);
  }, [webhookDraftUrl, examplePayload, onUpdate, toast]);

  const handleDisconnectWebhook = useCallback(() => {
    onUpdate({ completionWebhookUrl: undefined });
    setWebhookDraftUrl('');
    setWebhookTestResult(null);
    toast({ description: 'Webhook desconectado.' });
  }, [onUpdate, toast]);

  /* ── Integration definitions ── */
  const integrations: IntegrationDef[] = [
    {
      id: 'link',
      label: 'Link público',
      color: 'bg-blue-500/10',
      icon: <Link2 className="h-6 w-6 text-blue-500" />,
    },
    {
      id: 'google_sheets',
      label: 'Google Sheets',
      color: 'bg-emerald-500/10',
      icon: (
        <svg className="h-6 w-6" viewBox="0 0 48 48">
          <path fill="#43A047" d="M37 45H11c-1.66 0-3-1.34-3-3V6c0-1.66 1.34-3 3-3h17l12 12v27c0 1.66-1.34 3-3 3z" />
          <path fill="#C8E6C9" d="M40 15H28V3z" />
          <path fill="#2E7D32" d="M40 15H28V3l12 12z" opacity=".3" />
          <path fill="#E8F5E9" d="M14 19h20v18H14z" />
          <path fill="#43A047" d="M34 19v18H14V19h20m0-1H14c-.55 0-1 .45-1 1v18c0 .55.45 1 1 1h20c.55 0 1-.45 1-1V19c0-.55-.45-1-1-1z" />
          <path fill="#43A047" d="M14 23h20v1H14zm0 4h20v1H14zm0 4h20v1H14zm7-12h1v18h-1zm6 0h1v18h-1z" />
        </svg>
      ),
    },
    {
      id: 'webhook',
      label: 'Webhook',
      color: 'bg-orange-500/10',
      icon: <Webhook className="h-6 w-6 text-orange-500" />,
    },
    { id: 'whatsapp', label: 'WhatsApp', color: 'bg-green-500/10', icon: <span className="text-2xl">💬</span>, comingSoon: true },
    { id: 'slack', label: 'Slack', color: 'bg-purple-500/10', icon: <span className="text-2xl">📨</span>, comingSoon: true },
    { id: 'zapier', label: 'Zapier', color: 'bg-amber-500/10', icon: <span className="text-2xl">⚡</span>, comingSoon: true },
  ];

  function isConnected(id: string) {
    if (id === 'link') return isPublished;
    if (id === 'google_sheets') return isSheetConnected;
    if (id === 'webhook') return isWebhookConnected;
    return false;
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-background">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-foreground">Conexões</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie links, integrações e webhooks do formulário.
          </p>
        </div>

        {/* Status banner */}
        {!isPublished && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 px-4 py-3">
            <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              O formulário está em rascunho. <strong>Publique</strong> para que o link funcione.
            </p>
          </div>
        )}

        {/* ── Cards grid ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {integrations.map((integ) => {
            const connected = isConnected(integ.id);
            const disabled = integ.comingSoon;

            return (
              <button
                key={integ.id}
                disabled={disabled}
                onClick={() => !disabled && setOpenModal(integ.id)}
                className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border p-6 transition-all aspect-square
                  ${connected
                    ? 'border-[#B3AB86]/40 bg-[#B3AB86]/5 shadow-sm'
                    : disabled
                      ? 'border-dashed border-border bg-muted/20 opacity-40 cursor-not-allowed'
                      : 'border-border bg-card hover:border-[#B3AB86]/30 hover:shadow-sm cursor-pointer'
                  }`}
              >
                {connected && (
                  <div className="absolute top-2.5 right-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#8A7D4A]" />
                  </div>
                )}
                <div className={`h-12 w-12 rounded-xl ${integ.color} flex items-center justify-center`}>
                  {integ.icon}
                </div>
                <span className="text-sm font-medium text-foreground">{integ.label}</span>
                {connected && <span className="text-[10px] font-medium text-[#8A7D4A]">Conectado</span>}
                {disabled && <span className="text-[10px] text-muted-foreground">Em breve</span>}
              </button>
            );
          })}
        </div>

        {!googleOAuthReady && (
          <p className="text-xs text-muted-foreground">
            Configure o <strong>Google OAuth2</strong> em{' '}
            <a href="/settings" className="text-primary underline">Configurações → Integrações</a>{' '}
            para conectar o Google Sheets.
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* ── Modal: Link público ── */}
      <Dialog open={openModal === 'link'} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-blue-500" /> Link público
            </DialogTitle>
            <DialogDescription>Compartilhe o link do formulário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <CopyField label="Link" value={previewUrl} />
            <Button variant="outline" size="sm" asChild>
              <a href={`${previewUrl}?editorPreview=1`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Testar em nova aba
              </a>
            </Button>
            <p className="text-[11px] text-muted-foreground">
              O link de teste não dispara WhatsApp, e-mails, webhooks nem salva respostas.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Google Sheets ── */}
      <Dialog open={openModal === 'google_sheets'} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sheet className="h-4 w-4 text-[#8A7D4A]" /> Google Sheets
            </DialogTitle>
            <DialogDescription>Sincronize respostas automaticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {isSheetConnected ? (
              <>
                <div className="flex items-center gap-2 text-sm text-[#8A7D4A]">
                  <CheckCircle2 className="h-4 w-4" /> Planilha conectada
                </div>
                {form.googleSheetUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={form.googleSheetUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir planilha
                    </a>
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSyncNow} disabled={syncing} className="gap-1.5">
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
                    Sincronizar agora
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDisconnectSheet} className="gap-1.5 text-muted-foreground hover:text-destructive">
                    <Unplug className="h-3.5 w-3.5" /> Desconectar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Crie uma planilha vinculada para receber todas as respostas automaticamente.
                </p>
                <Button onClick={handleConnectSheet} disabled={googleLoading || !googleOAuthReady} className="gap-1.5">
                  {googleLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5" />}
                  Criar e conectar planilha
                </Button>
                {!googleOAuthReady && (
                  <p className="text-xs text-destructive">Configure o Google OAuth nas Configurações primeiro.</p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Webhook ── */}
      <Dialog open={openModal === 'webhook'} onOpenChange={(o) => { if (!o) { setOpenModal(null); setWebhookTestResult(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-orange-500" /> Webhook
            </DialogTitle>
            <DialogDescription>Receba um POST com todos os dados ao completar o formulário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">URL do webhook</Label>
              <Input
                value={webhookDraftUrl}
                onChange={e => { setWebhookDraftUrl(e.target.value); setWebhookTestResult(null); }}
                placeholder="https://hooks.exemplo.com/webhook"
                className="text-sm font-mono"
              />
            </div>

            {/* Test result feedback */}
            {webhookTestResult && (
              <div className={`flex items-center gap-1.5 text-xs ${webhookTestResult.ok ? 'text-[#8A7D4A]' : 'text-destructive'}`}>
                {webhookTestResult.ok
                  ? <><CheckCircle2 className="h-3.5 w-3.5" /> Conectado — status {webhookTestResult.status}</>
                  : <><X className="h-3.5 w-3.5" /> Falhou — status {webhookTestResult.status || 'erro de rede'}</>
                }
              </div>
            )}

            {isWebhookConnected && !webhookTestResult && (
              <div className="flex items-center gap-1.5 text-xs text-[#8A7D4A]">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ativo — será disparado ao completar
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleWebhookTest}
                disabled={webhookTesting || !webhookDraftUrl}
                className="gap-1.5"
              >
                {webhookTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />}
                Testar e conectar
              </Button>
              {isWebhookConnected && (
                <Button variant="ghost" size="sm" onClick={handleDisconnectWebhook} className="gap-1.5 text-muted-foreground hover:text-destructive">
                  <Unplug className="h-3.5 w-3.5" /> Desconectar
                </Button>
              )}
            </div>

            <div>
              <button
                onClick={() => setShowPayload(!showPayload)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPayload ? 'rotate-180' : ''}`} />
                Ver modelo do payload ({examplePayload.fields.length} campos)
              </button>
              {showPayload && (
                <pre className="mt-2 rounded-lg bg-muted p-4 text-[11px] font-mono overflow-x-auto max-h-64 overflow-y-auto text-foreground/80 whitespace-pre-wrap">
                  {JSON.stringify(examplePayload, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
