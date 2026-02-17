import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Webhook, Trash2, Plus, X, ArrowDownToLine } from 'lucide-react';
import { IntegrationNodeData, IntegrationPlatform, WebhookParam, WebhookResponseMapping } from '@/types/form';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';

const WEBHOOK_METHODS = ['GET', 'POST', 'PUT', 'PATCH'] as const;

interface IntegrationNodeProps {
  nodeData: IntegrationNodeData;
  onChange: (patch: Partial<IntegrationNodeData>) => void;
  onDelete: () => void;
  variables?: import('@/types/form').FormVariable[];
}

function IntegrationNode({ data, selected }: NodeProps & { data: IntegrationNodeProps }) {
  const { nodeData, onChange, onDelete, variables = [] } = data;

  return (
    <TooltipProvider>
      <div
        className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
          selected
            ? 'border-node-webhook-accent shadow-md ring-2 ring-node-webhook-accent/20'
            : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left}  className="!w-3 !h-3 !bg-node-webhook-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-webhook-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-node-webhook-accent/30 bg-node-webhook rounded-t-xl">
          <Webhook className="h-3.5 w-3.5 text-node-webhook-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-node-webhook-accent">
            Integração
          </span>
          <div className="ml-auto">
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="px-3 py-3 space-y-2.5">
          {/* URL */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              URL de destino <span className="text-destructive">*</span>
            </span>
            <Input
              value={nodeData.webhookUrl || ''}
              onChange={e => onChange({ webhookUrl: e.target.value })}
              placeholder="https://hooks.example.com/..."
              className={`h-8 text-xs ${!nodeData.webhookUrl ? 'border-destructive/50' : ''}`}
            />
          </div>

          {/* Method */}
          <div className="space-y-1">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Método</span>
            <Select
              value={nodeData.webhookMethod || 'POST'}
              onValueChange={val => onChange({ webhookMethod: val as any })}
            >
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBHOOK_METHODS.map(m => (
                  <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Extra params */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parâmetros extras</span>
              <Button
                variant="ghost" size="icon"
                className="h-5 w-5 text-muted-foreground"
                onClick={() => {
                  const newParam: WebhookParam = { id: crypto.randomUUID(), key: '', value: '' };
                  onChange({ webhookParams: [...(nodeData.webhookParams || []), newParam] });
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {(nodeData.webhookParams || []).map((param, idx) => (
              <div key={param.id} className="flex items-center gap-1">
                <Input
                  value={param.key}
                  onChange={e => {
                    const updated = [...(nodeData.webhookParams || [])];
                    updated[idx] = { ...updated[idx], key: e.target.value };
                    onChange({ webhookParams: updated });
                  }}
                  placeholder="chave"
                  className="h-7 text-xs w-0 flex-1 font-mono"
                />
                <Input
                  value={param.value}
                  onChange={e => {
                    const updated = [...(nodeData.webhookParams || [])];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    onChange({ webhookParams: updated });
                  }}
                  placeholder="valor"
                  className="h-7 text-xs w-0 flex-1"
                />
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const updated = (nodeData.webhookParams || []).filter((_, i) => i !== idx);
                    onChange({ webhookParams: updated });
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
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
                <Button
                  variant="ghost" size="icon"
                  className="h-5 w-5 text-muted-foreground"
                  onClick={() => {
                    const newMapping: WebhookResponseMapping = {
                      id: crypto.randomUUID(),
                      responsePath: '',
                      variableId: '',
                    };
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
                  const newMapping: WebhookResponseMapping = {
                    id: crypto.randomUUID(),
                    responsePath: '',
                    variableId: '',
                  };
                  onChange({ responseMappings: [newMapping] });
                }}
              >
                <Plus className="h-3 w-3" />
                Mapear campo da resposta
              </button>
            ) : (
              <div className="space-y-1.5">
                {(nodeData.responseMappings || []).map((mapping, idx) => (
                  <div key={mapping.id} className="space-y-1 bg-muted/40 rounded-lg p-2">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 space-y-0.5">
                        <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">Caminho JSON</span>
                        <Input
                          value={mapping.responsePath}
                          onChange={e => {
                            const updated = [...(nodeData.responseMappings || [])];
                            updated[idx] = { ...updated[idx], responsePath: e.target.value };
                            onChange({ responseMappings: updated });
                          }}
                          placeholder="ex: data.token"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive mt-4"
                        onClick={() => {
                          const updated = (nodeData.responseMappings || []).filter((_, i) => i !== idx);
                          onChange({ responseMappings: updated });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
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
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Selecionar variável..." />
                        </SelectTrigger>
                        <SelectContent>
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
                ))}
              </div>
            )}
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
