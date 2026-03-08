import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles, Trash2, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AINodeData, AIObjective, FormVariable, IntegrationNodeData } from '@/types/form';
import { VariableInput } from './shared';
import { LocalInput } from './shared/LocalInput';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { InputElementGroup } from './VariableAssignPanel';
import { DisabledBadge } from './NodeDisabledOverlay';

const OBJECTIVES: { value: AIObjective; label: string }[] = [
  { value: 'summarize', label: '📝 Resumir' },
  { value: 'classify', label: '🏷️ Classificar' },
  { value: 'generate', label: '✨ Gerar texto' },
  { value: 'extract', label: '🔍 Extrair dados' },
  { value: 'custom', label: '⚙️ Personalizado' },
];

export interface AINodeProps {
  nodeData: AINodeData;
  onChange: (patch: Partial<AINodeData>) => void;
  onDelete: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
}

function AINode({ data, selected }: NodeProps & { data: AINodeProps & { isNodeDisabled?: boolean; onToggleDisabled?: () => void } }) {
  const { nodeData, onChange, onDelete, variables = [], allInputElements = [], isNodeDisabled = false } = data;
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await supabase.functions.invoke('ai-process', {
        body: {
          objective: nodeData.objective || 'custom',
          prompt: nodeData.prompt || '',
          systemPrompt: nodeData.systemPrompt || '',
          inputData: {},
          model: nodeData.model,
          maxTokens: nodeData.maxTokens,
          temperature: nodeData.temperature,
          test: true,
        },
      });
      if (res.error) throw res.error;
      const d = res.data as any;
      if (d?.success) {
        setTestResult('success');
        toast.success('IA respondeu com sucesso', { description: (d.result || '').slice(0, 120) });
      } else {
        throw new Error(d?.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      setTestResult('error');
      toast.error('Erro ao testar IA', { description: err.message });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  }, [nodeData]);

  const outputVariable = variables.find(v => v.id === nodeData.outputVariableId);
  const selectedInputCount = (nodeData.inputSources || []).length;
  const objectiveLabel = OBJECTIVES.find(o => o.value === (nodeData.objective || 'custom'))?.label || '⚙️ Personalizado';

  return (
    <div className={`nodrag nopan nowheel relative rounded-xl border-2 bg-card shadow-sm min-w-[220px] max-w-[260px] transition-all ${
      isNodeDisabled ? 'opacity-50 grayscale'
      : selected
        ? 'border-node-ai-accent shadow-md ring-2 ring-node-ai-accent/20'
        : 'border-border'
    }`}>
      {isNodeDisabled && <DisabledBadge />}

      <Handle type="target" position={Position.Left} style={{ top: 14 }} className="!w-2.5 !h-2.5 !bg-node-ai-accent !border-2 !border-card" />
      <Handle type="source" position={Position.Right} id="default" className="!w-2.5 !h-2.5 !bg-node-ai-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-node-ai-accent/30 bg-node-ai rounded-t-xl">
        <Sparkles className="h-3 w-3 text-node-ai-accent flex-shrink-0" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-node-ai-accent flex-1 truncate">IA</span>

        {/* Collapsed summary chips */}
        {!expanded && (
          <span className="text-[9px] text-node-ai-accent/70 truncate max-w-[80px]">{objectiveLabel.replace(/^.+\s/, '')}</span>
        )}

        <div className="flex items-center gap-0">
          {data.onToggleDisabled && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center" onClick={e => { e.stopPropagation(); data.onToggleDisabled?.(); }}>
                    <Switch checked={!isNodeDisabled} className="scale-[0.55] origin-center" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{isNodeDisabled ? 'Ativar' : 'Desativar'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="ghost" size="icon" className="h-5 w-5 text-node-ai-accent hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-node-ai-accent" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
          </Button>
        </div>
      </div>

      {/* Collapsed preview */}
      {!expanded && (
        <div className="px-2 py-1.5 space-y-0.5 text-[9px] text-muted-foreground">
          {selectedInputCount > 0 && <p>{selectedInputCount} campo(s) de entrada</p>}
          {outputVariable && <p>→ <span className="text-node-ai-accent font-medium">{`{{${outputVariable.name}}}`}</span></p>}
          {!selectedInputCount && !outputVariable && <p className="italic">Clique ▾ para configurar</p>}
        </div>
      )}

      {expanded && (
        <div className="p-2 space-y-2 text-[10px]" onClick={e => e.stopPropagation()}>
          {/* Objective */}
          <div className="space-y-0.5">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Objetivo</label>
            <Select value={nodeData.objective || 'custom'} onValueChange={v => onChange({ objective: v as AIObjective })}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input sources — compact checklist */}
          <div className="space-y-0.5">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Entradas ({selectedInputCount})</label>
            <div className="max-h-[72px] overflow-y-auto space-y-0.5">
              {allInputElements.map(group =>
                group.elements.map(el => {
                  const isSelected = (nodeData.inputSources || []).includes(el.elementId);
                  return (
                    <button
                      key={el.elementId}
                      type="button"
                      onClick={() => {
                        const current = nodeData.inputSources || [];
                        const next = isSelected ? current.filter(id => id !== el.elementId) : [...current, el.elementId];
                        onChange({ inputSources: next });
                      }}
                      className={`w-full text-left px-1.5 py-1 rounded border transition-colors text-[10px] leading-tight ${
                        isSelected
                          ? 'border-node-ai-accent bg-node-ai text-foreground'
                          : 'border-transparent hover:border-node-ai-accent/30 text-muted-foreground'
                      }`}
                    >
                      {el.elementLabel}
                    </button>
                  );
                })
              )}
              {allInputElements.length === 0 && (
                <p className="text-muted-foreground/60 text-[9px] italic">Conecte páginas anteriores</p>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-0.5">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
              {nodeData.objective === 'custom' ? 'Prompt' : 'Instruções extras'}
            </label>
            <VariableInput
              as="textarea"
              value={nodeData.prompt || ''}
              onChange={v => onChange({ prompt: v })}
              variables={variables}
              integrationNodes={[]}
              allInputElements={allInputElements}
              placeholder="Use {{variáveis}}..."
              className="min-h-[40px] max-h-[60px] text-[10px]"
            />
          </div>

          {/* Output variable */}
          <div className="space-y-0.5">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Salvar em</label>
            <Select value={nodeData.outputVariableId || ''} onValueChange={v => onChange({ outputVariableId: v })}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue placeholder="Variável" />
              </SelectTrigger>
              <SelectContent>
                {variables.filter(v => v.type === 'text').map(v => (
                  <SelectItem key={v.id} value={v.id} className="text-xs">{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Execution mode */}
          <div className="space-y-0.5">
            <label className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">Execução</label>
            <Select value={nodeData.executionMode || 'sync'} onValueChange={v => onChange({ executionMode: v as 'sync' | 'async' })}>
              <SelectTrigger className="h-6 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sync" className="text-xs">⏳ Síncrono</SelectItem>
                <SelectItem value="async" className="text-xs">⚡ Assíncrono</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Advanced — collapsed */}
          <details className="group">
            <summary className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium cursor-pointer hover:text-foreground">
              Avançado ▸
            </summary>
            <div className="mt-1.5 space-y-1.5 pl-0.5">
              <div className="space-y-0.5">
                <label className="text-[9px] text-muted-foreground">Modelo</label>
                <LocalInput value={nodeData.model || ''} onCommit={v => onChange({ model: v || undefined })} placeholder="Padrão" className="h-6 text-[10px]" />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-0.5">
                  <label className="text-[9px] text-muted-foreground">Temp.</label>
                  <LocalInput value={String(nodeData.temperature ?? 0.7)} onCommit={v => onChange({ temperature: parseFloat(v) || 0.7 })} className="h-6 text-[10px]" />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[9px] text-muted-foreground">Tokens</label>
                  <LocalInput value={String(nodeData.maxTokens ?? 500)} onCommit={v => onChange({ maxTokens: parseInt(v) || 500 })} className="h-6 text-[10px]" />
                </div>
              </div>
            </div>
          </details>

          {/* Test */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px] gap-1 border-node-ai-accent/30 hover:bg-node-ai"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : testResult === 'success' ? <CheckCircle2 className="h-2.5 w-2.5 text-green-600" /> : testResult === 'error' ? <XCircle className="h-2.5 w-2.5 text-destructive" /> : <Sparkles className="h-2.5 w-2.5" />}
            {testing ? 'Testando...' : testResult === 'success' ? 'OK!' : testResult === 'error' ? 'Erro' : 'Testar'}
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/30 rounded-b-xl">
        <span className="text-[9px] text-muted-foreground">1× apenas</span>
        <Switch
          checked={nodeData.fireOnce !== false}
          onCheckedChange={v => onChange({ fireOnce: v })}
          className="scale-[0.55] origin-right"
        />
      </div>
    </div>
  );
}

export default memo(AINode);
