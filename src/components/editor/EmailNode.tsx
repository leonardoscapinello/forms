import { memo, useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Mail, Trash2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, XCircle, Send, Code, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { EmailNodeData, FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { VariableInput } from './shared';
import { LocalInput } from './shared/LocalInput';
import { toast } from 'sonner';
import type { InputElementGroup } from './VariableAssignPanel';
import { Textarea } from '@/components/ui/textarea';

interface ResendInstance {
  id: string;
  label: string;
  config: { apiKey: string; defaultFrom: string };
  is_active: boolean;
}

export interface EmailNodeProps {
  nodeData: EmailNodeData;
  onChange: (patch: Partial<EmailNodeData>) => void;
  onDelete: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
}

function EmailNode({ data, selected }: NodeProps & { data: EmailNodeProps }) {
  const { nodeData, onChange, onDelete, variables = [], integrationNodes = [], allInputElements = [], trackedParams } = data;
  const [expanded, setExpanded] = useState(true);
  const [instances, setInstances] = useState<ResendInstance[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const EmailBuilderDialog = useMemo(() => lazy(() => import('./email-builder/EmailBuilderDialog')), []);

  useEffect(() => {
    supabase.from('integration_settings')
      .select('*')
      .eq('integration_type', 'resend')
      .then(({ data: rows }) => {
        if (rows) {
          setInstances(rows.map(r => ({
            id: r.id, label: r.label,
            config: r.config as any, is_active: r.is_active,
          })));
        }
      });
  }, []);

  const activeInstances = useMemo(() => instances.filter(i => i.is_active), [instances]);

  // Auto-fill fromEmail from selected instance default
  const selectedInstance = useMemo(() => instances.find(i => i.id === nodeData.instanceId), [instances, nodeData.instanceId]);

  const handleTest = useCallback(async () => {
    if (!nodeData.instanceId || !nodeData.toEmail) return;
    setTesting(true); setTestResult(null);
    try {
      const { data: res } = await supabase.functions.invoke('resend-send', {
        body: {
          instanceId: nodeData.instanceId,
          fromEmail: nodeData.fromEmail || selectedInstance?.config.defaultFrom || 'onboarding@resend.dev',
          fromName: nodeData.fromName || '',
          toEmail: nodeData.toEmail,
          subject: nodeData.subject || 'Teste',
          bodyText: nodeData.bodyText || 'E-mail de teste',
          bodyHtml: nodeData.bodyHtml,
          useHtml: nodeData.useHtml,
          testMode: true,
        },
      });
      setTestResult(res?.success ? 'success' : 'error');
      toast[res?.success ? 'success' : 'error'](
        res?.success ? 'E-mail enviado!' : `Falhou: ${JSON.stringify(res?.data || res?.error).slice(0, 100)}`
      );
    } catch { setTestResult('error'); toast.error('Erro ao enviar'); }
    setTesting(false);
  }, [nodeData, selectedInstance]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative">
        <div className={`w-80 max-w-80 rounded-xl border bg-card shadow-sm transition-all overflow-hidden ${
          selected
            ? 'border-node-email-accent shadow-md ring-2 ring-node-email-accent/20'
            : 'border-border'
        }`}>

          <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-node-email-accent !border-2 !border-card" />
          <Handle type="source" position={Position.Right} id="default" className="!w-3 !h-3 !bg-node-email-accent !border-2 !border-card" />

          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-node-email-accent/30 bg-node-email rounded-t-xl">
            <Mail className="h-3.5 w-3.5 text-node-email-accent" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-node-email-accent">E-mail</span>

            {!expanded && (
              <div className="flex items-center gap-1 ml-1">
                {nodeData.toEmail && (
                  <span className="text-[9px] bg-node-email-accent/15 text-node-email-accent px-1.5 py-0.5 rounded-full truncate max-w-[100px]">
                    {nodeData.toEmail.startsWith('{{') ? nodeData.toEmail : nodeData.toEmail}
                  </span>
                )}
              </div>
            )}

            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setExpanded(!expanded)} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {expanded && (
            <div className="nodrag nopan nowheel" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
              <div className="px-3 py-3 space-y-3 min-w-0 overflow-hidden">

                {/* Instance */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Instância</span>
                  {activeInstances.length === 0 ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                      <p className="text-[10px] text-destructive/80">Nenhuma instância Resend configurada</p>
                    </div>
                  ) : (
                    <Select value={nodeData.instanceId || ''} onValueChange={v => {
                      const inst = instances.find(i => i.id === v);
                      onChange({ instanceId: v, fromEmail: inst?.config.defaultFrom || nodeData.fromEmail });
                    }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar instância…" /></SelectTrigger>
                      <SelectContent>
                        {activeInstances.map(inst => (
                          <SelectItem key={inst.id} value={inst.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-node-email-accent inline-block" />
                              {inst.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* From */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Remetente</span>
                  <div className="space-y-1.5 min-w-0">
                    <VariableInput
                      value={nodeData.fromName || ''}
                      onChange={v => onChange({ fromName: v })}
                      variables={variables}
                      integrationNodes={integrationNodes}
                      allInputElements={allInputElements}
                      trackedParams={trackedParams}
                      placeholder="Nome (opcional)"
                      className="h-8 text-xs w-full"
                    />
                    <VariableInput
                      value={nodeData.fromEmail || ''}
                      onChange={v => onChange({ fromEmail: v })}
                      variables={variables}
                      integrationNodes={integrationNodes}
                      allInputElements={allInputElements}
                      trackedParams={trackedParams}
                      placeholder="email@dominio.com"
                      className="h-8 text-xs w-full"
                    />
                  </div>
                </div>

                {/* To */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Destinatário</span>
                  <VariableInput
                    value={nodeData.toEmail || ''}
                    onChange={v => onChange({ toEmail: v })}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    allInputElements={allInputElements}
                    trackedParams={trackedParams}
                    placeholder="email@exemplo.com ou {{email}}"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Subject */}
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Assunto</span>
                  <VariableInput
                    value={nodeData.subject || ''}
                    onChange={v => onChange({ subject: v })}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    allInputElements={allInputElements}
                    trackedParams={trackedParams}
                    placeholder="Assunto do e-mail"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Corpo</span>
                    <div className="flex items-center gap-1.5">
                      <Code className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground">HTML</span>
                      <Switch
                        checked={nodeData.useHtml || false}
                        onCheckedChange={v => onChange({ useHtml: v })}
                        className="scale-75 origin-right"
                      />
                    </div>
                  </div>
                  {nodeData.useHtml ? (
                    <div className="space-y-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs gap-2"
                        onClick={() => setBuilderOpen(true)}
                      >
                        <Pencil className="h-3 w-3" />
                        Abrir Editor Visual
                      </Button>
                      {nodeData.bodyHtml && (
                        <div className="rounded-md border border-input bg-muted/30 p-2 max-h-[60px] overflow-hidden">
                          <p className="text-[9px] text-muted-foreground truncate">HTML gerado ({nodeData.bodyHtml.length} caracteres)</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea
                      value={nodeData.bodyText || ''}
                      onChange={e => onChange({ bodyText: e.target.value })}
                      placeholder="Olá {{nome}}, obrigado por…"
                      className="w-full min-h-[60px] max-h-[200px] rounded-md border border-input bg-background px-2 py-1.5 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  )}
                </div>
              </div>

              {/* Footer: Test button */}
              <div className="border-t border-border px-3 py-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  disabled={testing || !nodeData.instanceId || !nodeData.toEmail}
                  onClick={handleTest}
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-node-email-accent" />
                  ) : testResult === 'error' ? (
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {testing ? 'Enviando…' : testResult === 'success' ? 'Enviado!' : testResult === 'error' ? 'Falhou' : 'Enviar teste'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Email Builder Dialog */}
        {builderOpen && (
          <Suspense fallback={null}>
            <EmailBuilderDialog
              open={builderOpen}
              onClose={() => setBuilderOpen(false)}
              value={nodeData.bodyHtml || ''}
              onChange={html => onChange({ bodyHtml: html })}
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}

export default memo(EmailNode);
