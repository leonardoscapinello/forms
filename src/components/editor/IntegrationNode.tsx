import { memo, useState, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Webhook, Trash2, Plus, X, ArrowDownToLine, Play, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { IntegrationNodeData, WebhookParam, WebhookResponseMapping } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LocalInput } from './shared/LocalInput';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

/** Recursively flatten a JSON object into dot-notation paths */
function flattenPaths(obj: any, prefix = ''): string[] {
  if (obj === null || obj === undefined || typeof obj !== 'object') return [];
  const paths: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const p = `${prefix}[${i}]`;
      paths.push(p);
      paths.push(...flattenPaths(item, p));
    });
  } else {
    for (const key of Object.keys(obj)) {
      const p = prefix ? `${prefix}.${key}` : key;
      paths.push(p);
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        paths.push(...flattenPaths(obj[key], p));
      }
    }
  }
  return paths;
}

/** Get a value from an object using dot/bracket path */
function getNestedValue(obj: any, path: string): any {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return tokens.reduce((acc, key) => acc != null ? acc[key] : undefined, obj);
}

interface ParamSectionProps {
  label: string;
  items: WebhookParam[];
  onAdd: () => void;
  onUpdate: (idx: number, field: 'key' | 'value', val: string) => void;
  onRemove: (idx: number) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  hint?: string;
}

function ParamSection({ label, items, onAdd, onUpdate, onRemove, keyPlaceholder = 'chave', valuePlaceholder = 'valor', hint }: ParamSectionProps): JSX.Element {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" onClick={onAdd}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {hint && items.length === 0 && (
        <p className="text-[9px] text-muted-foreground/60 italic">{hint}</p>
      )}
      {items.map((param, idx) => (
        <div key={param.id} className="flex items-center gap-1">
          <LocalInput value={param.key} onCommit={v => onUpdate(idx, 'key', v)} placeholder={keyPlaceholder} className="h-7 text-xs w-0 flex-1 font-mono" />
          <LocalInput value={param.value} onCommit={v => onUpdate(idx, 'value', v)} placeholder={valuePlaceholder} className="h-7 text-xs w-0 flex-1" />
          <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onRemove(idx)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

interface IntegrationNodeProps {
  nodeData: IntegrationNodeData;
  onChange: (patch: Partial<IntegrationNodeData>) => void;
  onDelete: () => void;
  variables?: import('@/types/form').FormVariable[];
}

function IntegrationNode({ data, selected }: NodeProps & { data: IntegrationNodeProps }) {
  const { nodeData, onChange, onDelete, variables = [] } = data;

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; status?: number; body?: any; error?: string } | null>(null);
  const [responsePaths, setResponsePaths] = useState<string[]>(nodeData.responseFields || []);

  const handleTest = useCallback(async () => {
    if (!nodeData.webhookUrl) return;
    setTesting(true);
    setTestResult(null);
    setResponsePaths([]);

    try {
      // Build headers
      const customHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      for (const h of (nodeData.webhookHeaders || []).filter(p => p.key)) {
        customHeaders[h.key] = h.value;
      }

      // Build query params
      const qp = (nodeData.webhookQueryParams || []).filter(p => p.key);
      let testUrl = nodeData.webhookUrl;
      if (qp.length > 0) {
        const sep = testUrl.includes('?') ? '&' : '?';
        testUrl += sep + qp.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
      }

      // Build body extra params (legacy + new)
      const extraBody = Object.fromEntries(
        [...(nodeData.webhookParams || []), ...(nodeData.webhookBodyParams || [])].filter(p => p.key).map(p => [p.key, p.value])
      );

      const testPayload = {
        event: { id: 'test', form_id: 'test', form_name: 'Teste', landed_at: new Date().toISOString(), submitted_at: new Date().toISOString() },
        respondent: { ip: null, user_agent: 'Lovable Test', geolocation: null },
        answers: {},
        answers_raw: {},
        variables: {},
        query_params: {},
        meta: Object.keys(extraBody).length > 0 ? extraBody : undefined,
      };

      const method = nodeData.webhookMethod || 'POST';
      const fetchOpts: RequestInit = {
        method,
        headers: customHeaders,
      };
      if (method !== 'GET') {
        fetchOpts.body = JSON.stringify(testPayload);
      }

      const res = await fetch(testUrl, fetchOpts);
      let body: any = null;
      const text = await res.text();
      try { body = JSON.parse(text); } catch { body = text; }

      setTestResult({ ok: res.ok, status: res.status, body });

      if (typeof body === 'object' && body !== null) {
        const paths = flattenPaths(body);
        setResponsePaths(paths);
        onChange({ responseFields: paths, lastTestResponse: body });
      }
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Erro de rede' });
    } finally {
      setTesting(false);
    }
  }, [nodeData.webhookUrl, nodeData.webhookMethod, nodeData.webhookParams, nodeData.webhookHeaders, nodeData.webhookQueryParams, nodeData.webhookBodyParams]);

  return (
    <TooltipProvider>
      <div
        className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
          selected
            ? 'border-node-webhook-accent shadow-md ring-2 ring-node-webhook-accent/20'
            : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left} style={{ top: 18 }}  className="!w-3 !h-3 !bg-node-webhook-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-webhook-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-node-webhook-accent/30 bg-node-webhook rounded-t-xl">
          <Webhook className="h-3.5 w-3.5 text-node-webhook-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-node-webhook-accent">
            Integração
          </span>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-2.5 nodrag nopan nowheel" onPointerDown={e => e.stopPropagation()}>
          {/* URL */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              URL de destino <span className="text-destructive">*</span>
            </span>
            <LocalInput
              value={nodeData.webhookUrl || ''}
              onCommit={v => onChange({ webhookUrl: v })}
              placeholder="https://hooks.example.com/..."
              className={`h-8 text-xs ${!nodeData.webhookUrl ? 'border-destructive/50' : ''}`}
            />
          </div>

          {/* Method */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Método</span>
            <Select value={nodeData.webhookMethod || 'POST'} onValueChange={val => onChange({ webhookMethod: val as any })}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEBHOOK_METHODS.map(m => (
                  <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── Headers ── */}
          <ParamSection
            label="Headers"
            items={nodeData.webhookHeaders || []}
            onAdd={() => {
              const newParam: WebhookParam = { id: crypto.randomUUID(), key: '', value: '' };
              onChange({ webhookHeaders: [...(nodeData.webhookHeaders || []), newParam] });
            }}
            onUpdate={(idx, field, val) => {
              const updated = [...(nodeData.webhookHeaders || [])];
              updated[idx] = { ...updated[idx], [field]: val };
              onChange({ webhookHeaders: updated });
            }}
            onRemove={(idx) => onChange({ webhookHeaders: (nodeData.webhookHeaders || []).filter((_, i) => i !== idx) })}
            keyPlaceholder="Content-Type"
            valuePlaceholder="application/json"
          />

          {/* ── Query Params ── */}
          <ParamSection
            label="Query Params"
            items={nodeData.webhookQueryParams || []}
            onAdd={() => {
              const newParam: WebhookParam = { id: crypto.randomUUID(), key: '', value: '' };
              onChange({ webhookQueryParams: [...(nodeData.webhookQueryParams || []), newParam] });
            }}
            onUpdate={(idx, field, val) => {
              const updated = [...(nodeData.webhookQueryParams || [])];
              updated[idx] = { ...updated[idx], [field]: val };
              onChange({ webhookQueryParams: updated });
            }}
            onRemove={(idx) => onChange({ webhookQueryParams: (nodeData.webhookQueryParams || []).filter((_, i) => i !== idx) })}
            keyPlaceholder="param"
            valuePlaceholder="valor"
          />

          {/* ── Body JSON ── */}
          <ParamSection
            label="Body JSON"
            items={nodeData.webhookBodyParams || []}
            onAdd={() => {
              const newParam: WebhookParam = { id: crypto.randomUUID(), key: '', value: '' };
              onChange({ webhookBodyParams: [...(nodeData.webhookBodyParams || []), newParam] });
            }}
            onUpdate={(idx, field, val) => {
              const updated = [...(nodeData.webhookBodyParams || [])];
              updated[idx] = { ...updated[idx], [field]: val };
              onChange({ webhookBodyParams: updated });
            }}
            onRemove={(idx) => onChange({ webhookBodyParams: (nodeData.webhookBodyParams || []).filter((_, i) => i !== idx) })}
            keyPlaceholder="chave"
            valuePlaceholder="valor"
            hint="Campos extras adicionados ao body do webhook"
          />

          {/* ── Test Webhook ── */}
          <div className="border-t border-border pt-2.5">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-2"
              disabled={!nodeData.webhookUrl || testing}
              onClick={handleTest}
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {testing ? 'Enviando...' : 'Testar Webhook'}
            </Button>

            {testResult && (
              <div className={`mt-2 rounded-lg p-2 text-[10px] space-y-1 ${
                testResult.ok ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-destructive/10 border border-destructive/20'
              }`}>
                <div className="flex items-center gap-1.5">
                  {testResult.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  }
                  <span className={`font-medium ${testResult.ok ? 'text-emerald-600' : 'text-destructive'}`}>
                    {testResult.ok ? `OK (${testResult.status})` : testResult.error || `Erro (${testResult.status})`}
                  </span>
                </div>
                {testResult.body && typeof testResult.body === 'object' && (
                  <details className="cursor-pointer">
                    <summary className="text-muted-foreground hover:text-foreground transition-colors">
                      Ver resposta ({responsePaths.length} campos)
                    </summary>
                    <pre className="mt-1 text-[9px] font-mono bg-background/50 rounded p-1.5 max-h-32 overflow-auto whitespace-pre-wrap text-foreground/80">
                      {JSON.stringify(testResult.body, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* ── Response Mappings ── */}
          <div className="space-y-1 border-t border-border pt-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ArrowDownToLine className="h-3 w-3 text-node-webhook-accent" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Retorno → Variáveis
                </span>
              </div>
              {variables.length > 0 && (
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground"
                  onClick={() => {
                    const newMapping: WebhookResponseMapping = { id: crypto.randomUUID(), responsePath: '', variableId: '' };
                    onChange({ responseMappings: [...(nodeData.responseMappings || []), newMapping] });
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>

            {variables.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/70 italic">
                Crie variáveis no formulário para usar aqui.
              </p>
            ) : (nodeData.responseMappings || []).length === 0 ? (
              <button
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-[10px] text-muted-foreground hover:border-node-webhook-accent hover:text-node-webhook-accent transition-colors"
                onClick={() => {
                  const newMapping: WebhookResponseMapping = { id: crypto.randomUUID(), responsePath: '', variableId: '' };
                  onChange({ responseMappings: [newMapping] });
                }}
              >
                <Plus className="h-3 w-3" />
                Mapear campo da resposta
              </button>
            ) : (
              <div className="space-y-1.5">
                {(nodeData.responseMappings || []).map((mapping, idx) => {
                  const previewValue = responsePaths.length > 0 && mapping.responsePath && testResult?.body
                    ? getNestedValue(testResult.body, mapping.responsePath)
                    : undefined;

                  return (
                    <div key={mapping.id} className="space-y-1 bg-muted/40 rounded-lg p-2">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 space-y-0.5">
                          <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">Caminho JSON</span>
                          {responsePaths.length > 0 ? (
                            <Select
                              value={mapping.responsePath || '__empty__'}
                              onValueChange={val => {
                                const updated = [...(nodeData.responseMappings || [])];
                                updated[idx] = { ...updated[idx], responsePath: val === '__empty__' ? '' : val };
                                onChange({ responseMappings: updated });
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs font-mono">
                                <SelectValue placeholder="Selecionar campo..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-48 z-[200]">
                                {responsePaths.map(p => {
                                  const val = getNestedValue(testResult?.body, p);
                                  const preview = val !== undefined && typeof val !== 'object'
                                    ? String(val).slice(0, 30)
                                    : typeof val === 'object' ? (Array.isArray(val) ? `[${val.length}]` : '{...}') : '';
                                  return (
                                    <SelectItem key={p} value={p} className="text-xs">
                                      <span className="font-mono">{p}</span>
                                      {preview && (
                                        <span className="ml-2 text-muted-foreground text-[9px]">= {preview}</span>
                                      )}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          ) : (
                            <LocalInput
                              value={mapping.responsePath}
                              onCommit={v => {
                                const updated = [...(nodeData.responseMappings || [])];
                                updated[idx] = { ...updated[idx], responsePath: v };
                                onChange({ responseMappings: updated });
                              }}
                              placeholder="ex: data.token ou items[0].id"
                              className="h-7 text-xs font-mono"
                            />
                          )}
                        </div>
                        <Button variant="ghost" size="icon"
                          className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive mt-4"
                          onClick={() => onChange({ responseMappings: (nodeData.responseMappings || []).filter((_, i) => i !== idx) })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Preview value */}
                      {previewValue !== undefined && typeof previewValue !== 'object' && (
                        <div className="text-[9px] text-muted-foreground bg-background/50 rounded px-1.5 py-0.5 font-mono truncate">
                          Valor: {String(previewValue)}
                        </div>
                      )}

                      <div className="space-y-0.5">
                        <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">Salvar em variável</span>
                        <Select
                          value={mapping.variableId}
                          onValueChange={val => {
                            const updated = [...(nodeData.responseMappings || [])];
                            updated[idx] = { ...updated[idx], variableId: val };
                            onChange({ responseMappings: updated });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar variável..." /></SelectTrigger>
                          <SelectContent className="z-[200]">
                            {variables.map(v => (
                              <SelectItem key={v.id} value={v.id} className="text-xs">
                                <span className="font-mono text-node-webhook-accent">{`{{${v.name}}}`}</span>
                                <span className="ml-1.5 text-muted-foreground">{v.type}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fire once toggle */}
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Switch
              checked={nodeData.fireOnce !== false}
              onCheckedChange={v => onChange({ ...nodeData, fireOnce: v })}
              className="scale-75"
            />
            <span className="text-[10px] text-muted-foreground">Disparar apenas 1× por sessão</span>
          </div>

          {/* Info pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] bg-node-webhook text-node-webhook-accent">
            <Webhook className="h-3 w-3 flex-shrink-0" />
            Disparo HTTP com answers + variáveis + metadata
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default memo(IntegrationNode);
