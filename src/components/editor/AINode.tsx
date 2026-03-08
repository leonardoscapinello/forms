import { memo, useState, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles, Trash2, ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AINodeData, AIObjective, FormVariable, IntegrationNodeData } from '@/types/form';
import { VariableInput } from './shared';
import { LocalInput } from './shared/LocalInput';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { InputElementGroup } from './VariableAssignPanel';
import { NodeToggleSwitch, DisabledBadge } from './NodeDisabledOverlay';

const OBJECTIVES: { value: AIObjective; label: string; description: string }[] = [
  { value: 'summarize', label: '📝 Resumir', description: 'Gera um resumo das respostas coletadas' },
  { value: 'classify', label: '🏷️ Classificar', description: 'Categoriza as respostas em grupos' },
  { value: 'generate', label: '✨ Gerar texto', description: 'Cria um texto personalizado baseado nos dados' },
  { value: 'extract', label: '🔍 Extrair dados', description: 'Extrai informações específicas das respostas' },
  { value: 'custom', label: '⚙️ Personalizado', description: 'Escreva seu próprio prompt' },
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
  const [expanded, setExpanded] = useState(true);
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

  return (
    <div className={`nodrag nopan nowheel relative rounded-xl border-2 bg-card shadow-sm min-w-[280px] max-w-[340px] transition-all ${
      isNodeDisabled ? 'opacity-50 grayscale'
      : selected
        ? 'border-node-ai-accent shadow-md ring-2 ring-node-ai-accent/20'
        : 'border-border'
    }`}>
      {isNodeDisabled && <DisabledBadge />}

      <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-node-ai-accent !border-2 !border-card" />
      <Handle type="source" position={Position.Right} id="default" className="!w-3 !h-3 !bg-node-ai-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-ai-accent/30 bg-node-ai rounded-t-xl">
        <Sparkles className="h-3.5 w-3.5 text-node-ai-accent flex-shrink-0" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-ai-accent flex-1">Inteligência Artificial</span>

        <div className="flex items-center gap-0.5">
          {data.onToggleDisabled && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center" onClick={e => { e.stopPropagation(); data.onToggleDisabled?.(); }}>
                    <Switch checked={!isNodeDisabled} className="scale-[0.6] origin-center" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">{isNodeDisabled ? 'Ativar' : 'Desativar'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-node-ai-accent hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-node-ai-accent" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 text-xs" onClick={e => e.stopPropagation()}>
          {/* Objective wizard */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Objetivo</label>
            <Select value={nodeData.objective || 'custom'} onValueChange={v => onChange({ objective: v as AIObjective })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div>
                      <span className="font-medium">{o.label}</span>
                      <span className="text-muted-foreground ml-1.5">{o.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input sources */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Campos de entrada</label>
            <div className="space-y-1.5">
              {allInputElements.map(group => (
                group.elements.map(el => {
                  const isSelected = (nodeData.inputSources || []).includes(el.elementId);
                  return (
                    <button
                      key={el.elementId}
                      type="button"
                      onClick={() => {
                        const current = nodeData.inputSources || [];
                        const next = isSelected
                          ? current.filter(id => id !== el.elementId)
                          : [...current, el.elementId];
                        onChange({ inputSources: next });
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded-md border transition-colors text-xs ${
                        isSelected
                          ? 'border-node-ai-accent bg-node-ai text-foreground'
                          : 'border-border hover:border-node-ai-accent/40 text-muted-foreground'
                      }`}
                    >
                      <span className="text-[10px] text-muted-foreground">{group.pageTitle} →</span> {el.elementLabel}
                    </button>
                  );
                })
              ))}
              {allInputElements.length === 0 && (
                <p className="text-muted-foreground/60 text-[10px] italic">Conecte páginas anteriores para selecionar campos</p>
              )}
            </div>
          </div>

          {/* Custom prompt */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              {nodeData.objective === 'custom' ? 'Prompt personalizado' : 'Instruções adicionais (opcional)'}
            </label>
            <VariableInput
              value={nodeData.prompt || ''}
              onChange={v => onChange({ prompt: v })}
              variables={variables}
              integrationNodes={[]}
              allInputElements={allInputElements}
              placeholder={
                nodeData.objective === 'summarize' ? 'Ex: Faça um resumo em 3 frases...'
                : nodeData.objective === 'classify' ? 'Ex: Classifique em: Quente, Morno, Frio...'
                : nodeData.objective === 'generate' ? 'Ex: Gere uma mensagem personalizada de boas-vindas...'
                : nodeData.objective === 'extract' ? 'Ex: Extraia o nome e a principal dor do lead...'
                : 'Escreva o prompt usando {{variáveis}}...'
              }
              multiline
            />
          </div>

          {/* Output variable */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Salvar resultado em</label>
            <Select
              value={nodeData.outputVariableId || ''}
              onValueChange={v => onChange({ outputVariableId: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione uma variável" />
              </SelectTrigger>
              <SelectContent>
                {variables.filter(v => v.type === 'text').map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
                {variables.filter(v => v.type === 'text').length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Crie uma variável de texto primeiro</div>
                )}
              </SelectContent>
            </Select>
            {outputVariable && (
              <p className="text-[10px] text-muted-foreground">
                Resultado salvo em <span className="font-semibold text-node-ai-accent">{`{{${outputVariable.name}}}`}</span>
              </p>
            )}
          </div>

          {/* Execution mode */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Execução</label>
            <Select value={nodeData.executionMode || 'sync'} onValueChange={v => onChange({ executionMode: v as 'sync' | 'async' })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sync">⏳ Síncrono (aguarda resposta)</SelectItem>
                <SelectItem value="async">⚡ Assíncrono (background)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground/70">
              {(nodeData.executionMode || 'sync') === 'sync'
                ? 'O fluxo pausa até a IA responder — o resultado estará disponível na próxima página'
                : 'Dispara em background — não bloqueia o fluxo mas o resultado pode não estar pronto imediatamente'
              }
            </p>
          </div>

          {/* Advanced settings: model, temperature, maxTokens */}
          <details className="group">
            <summary className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium cursor-pointer hover:text-foreground transition-colors">
              Avançado ▸
            </summary>
            <div className="mt-2 space-y-2 pl-1">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Modelo</label>
                <LocalInput
                  value={nodeData.model || ''}
                  onCommit={v => onChange({ model: v || undefined })}
                  placeholder="Padrão (Gemini Flash)"
                  className="h-7 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Temperatura</label>
                  <LocalInput
                    value={String(nodeData.temperature ?? 0.7)}
                    onCommit={v => onChange({ temperature: parseFloat(v) || 0.7 })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Max tokens</label>
                  <LocalInput
                    value={String(nodeData.maxTokens ?? 500)}
                    onCommit={v => onChange({ maxTokens: parseInt(v) || 500 })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            </div>
          </details>

          {/* Test button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5 border-node-ai-accent/30 hover:bg-node-ai"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : testResult === 'success' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : testResult === 'error' ? <XCircle className="h-3 w-3 text-destructive" /> : <Sparkles className="h-3 w-3" />}
            {testing ? 'Testando...' : testResult === 'success' ? 'Sucesso!' : testResult === 'error' ? 'Erro' : 'Testar IA'}
          </Button>
        </div>
      )}

      {/* Footer: fire once */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 rounded-b-xl">
        <span className="text-[10px] text-muted-foreground">Disparar apenas 1×</span>
        <Switch
          checked={nodeData.fireOnce !== false}
          onCheckedChange={v => onChange({ fireOnce: v })}
          className="scale-[0.6] origin-right"
        />
      </div>
    </div>
  );
}

export default memo(AINode);
