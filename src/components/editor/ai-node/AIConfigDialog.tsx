import { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, Zap, Clock, Brain, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import type { AINodeData, AIObjective, FormVariable, IntegrationNodeData, FormVariableType } from '@/types/form';
import { VariableInput } from '../shared';
import VariableSelect from '../shared/VariableSelect';
import { LocalInput } from '../shared/LocalInput';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { InputElementGroup } from '../VariableAssignPanel';

const OBJECTIVES: { value: AIObjective; label: string; icon: string; description: string }[] = [
  { value: 'summarize', label: 'Resumir', icon: '📝', description: 'Gera um resumo das respostas coletadas' },
  { value: 'classify', label: 'Classificar', icon: '🏷️', description: 'Categoriza as respostas em grupos' },
  { value: 'generate', label: 'Gerar texto', icon: '✨', description: 'Cria texto personalizado baseado nos dados' },
  { value: 'extract', label: 'Extrair dados', icon: '🔍', description: 'Extrai informações específicas das respostas' },
  { value: 'custom', label: 'Personalizado', icon: '⚙️', description: 'Escreva seu próprio prompt do zero' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeData: AINodeData;
  onChange: (patch: Partial<AINodeData>) => void;
  variables: FormVariable[];
  allInputElements: InputElementGroup[];
  onCreateVariable?: (variable: FormVariable) => void;
}

export default function AIConfigDialog({ open, onOpenChange, nodeData, onChange, variables, allInputElements, onCreateVariable }: Props) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local state for input sources to avoid re-render lag on each toggle
  const [localSources, setLocalSources] = useState<string[]>(nodeData.inputSources || []);
  const commitTimer = useRef<ReturnType<typeof setTimeout>>();

  // Sync from parent when dialog opens
  useEffect(() => {
    if (open) setLocalSources(nodeData.inputSources || []);
  }, [open]);

  const toggleSource = useCallback((elementId: string) => {
    setLocalSources(prev => {
      const next = prev.includes(elementId)
        ? prev.filter(id => id !== elementId)
        : [...prev, elementId];
      // Debounce the commit to parent
      clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => onChange({ inputSources: next }), 150);
      return next;
    });
  }, [onChange]);

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
        toast.success('IA respondeu com sucesso', { description: (d.result || '').slice(0, 200) });
      } else {
        throw new Error(d?.error || 'Erro desconhecido');
      }
    } catch (err: any) {
      setTestResult('error');
      toast.error('Erro ao testar IA', { description: err.message });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  }, [nodeData]);

  const outputVariable = variables.find(v => v.id === nodeData.outputVariableId);
  const selectedInputCount = (nodeData.inputSources || []).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-node-ai">
              <Sparkles className="h-4 w-4 text-node-ai-accent" />
            </div>
            Configurar Inteligência Artificial
          </DialogTitle>
        </DialogHeader>

        <Separator />

        <div className="px-5 py-4 space-y-5">
          {/* Objective selector — card grid */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Objetivo</label>
            <div className="grid grid-cols-2 gap-2">
              {OBJECTIVES.map(o => {
                const isActive = (nodeData.objective || 'custom') === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange({ objective: o.value })}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
                      isActive
                        ? 'border-node-ai-accent bg-node-ai shadow-sm'
                        : 'border-border hover:border-node-ai-accent/40 hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-lg leading-none mt-0.5">{o.icon}</span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${isActive ? 'text-node-ai-accent' : 'text-foreground'}`}>{o.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{o.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Input sources */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Campos de entrada
              {localSources.length > 0 && (
                <span className="ml-1.5 text-[10px] font-normal text-node-ai-accent">
                  {localSources.length} selecionado(s)
                </span>
              )}
            </label>
            {allInputElements.length > 0 ? (
              <div className="grid grid-cols-2 gap-1.5 max-h-[120px] overflow-y-auto">
                {allInputElements.map(group =>
                  group.elements.map(el => {
                    const isSelected = localSources.includes(el.elementId);
                    return (
                      <button
                        key={el.elementId}
                        type="button"
                        onClick={() => toggleSource(el.elementId)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-xs text-left ${
                          isSelected
                            ? 'border-node-ai-accent bg-node-ai text-foreground font-medium'
                            : 'border-border hover:border-node-ai-accent/40 text-muted-foreground'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-node-ai-accent bg-node-ai-accent' : 'border-muted-foreground/30'
                        }`}>
                          {isSelected && (
                            <svg className="w-2 h-2 text-card" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{el.elementLabel}</span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                <Brain className="h-4 w-4 flex-shrink-0" />
                Conecte páginas anteriores ao nó para selecionar campos de entrada
              </div>
            )}
          </div>

          <Separator />

          {/* Prompt */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {nodeData.objective === 'custom' ? 'Prompt personalizado' : 'Instruções adicionais'}
            </label>
            <VariableInput
              as="textarea"
              value={nodeData.prompt || ''}
              onChange={v => onChange({ prompt: v })}
              variables={variables}
              integrationNodes={[]}
              allInputElements={allInputElements}
              placeholder={
                nodeData.objective === 'summarize' ? 'Ex: Faça um resumo em 3 frases...'
                : nodeData.objective === 'classify' ? 'Ex: Classifique em: Quente, Morno, Frio...'
                : nodeData.objective === 'generate' ? 'Ex: Gere uma mensagem de boas-vindas...'
                : nodeData.objective === 'extract' ? 'Ex: Extraia o nome e a principal dor...'
                : 'Escreva o prompt usando {{variáveis}}...'
              }
              className="min-h-[80px] text-sm"
            />
          </div>

          {/* Output + Execution side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Salvar resultado em</label>
              <VariableSelect
                value={nodeData.outputVariableId || ''}
                variables={variables.filter(v => v.type === 'text')}
                onValueChange={v => onChange({ outputVariableId: v })}
                onCreateVariable={onCreateVariable}
                placeholder="Selecione variável"
                accentClass="text-node-ai-accent"
                className="h-9 text-sm"
              />
              {outputVariable && (
                <p className="text-[10px] text-muted-foreground">
                  Resultado → <span className="font-semibold text-node-ai-accent">{`{{${outputVariable.name}}}`}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Modo de execução</label>
              <Select value={nodeData.executionMode || 'sync'} onValueChange={v => onChange({ executionMode: v as 'sync' | 'async' })}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sync">
                    <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Síncrono</span>
                  </SelectItem>
                  <SelectItem value="async">
                    <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> Assíncrono</span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {(nodeData.executionMode || 'sync') === 'sync'
                  ? 'Aguarda a resposta antes de prosseguir'
                  : 'Dispara em background, sem bloquear'
                }
              </p>
            </div>
          </div>

          {/* Fire once toggle */}
          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-xs font-medium text-foreground">Disparar apenas uma vez</p>
              <p className="text-[10px] text-muted-foreground">Ignora execuções subsequentes para o mesmo respondente</p>
            </div>
            <Switch
              checked={nodeData.fireOnce !== false}
              onCheckedChange={v => onChange({ fireOnce: v })}
            />
          </div>

          {/* Advanced settings */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Configurações avançadas
              <span className="text-[10px]">{showAdvanced ? '▾' : '▸'}</span>
            </button>

            {showAdvanced && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Modelo</label>
                  <LocalInput
                    value={nodeData.model || ''}
                    onCommit={v => onChange({ model: v || undefined })}
                    placeholder="Padrão (Gemini Flash)"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Temperatura</label>
                  <LocalInput
                    value={String(nodeData.temperature ?? 0.7)}
                    onCommit={v => onChange({ temperature: parseFloat(v) || 0.7 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Max tokens</label>
                  <LocalInput
                    value={String(nodeData.maxTokens ?? 500)}
                    onCommit={v => onChange({ maxTokens: parseInt(v) || 500 })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Footer with test */}
        <div className="flex items-center justify-between px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-node-ai-accent/30 hover:bg-node-ai text-xs"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : testResult === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              : testResult === 'error' ? <XCircle className="h-3.5 w-3.5 text-destructive" />
              : <Sparkles className="h-3.5 w-3.5" />}
            {testing ? 'Testando...' : testResult === 'success' ? 'Sucesso!' : testResult === 'error' ? 'Erro' : 'Testar IA'}
          </Button>

          <Button size="sm" onClick={() => onOpenChange(false)} className="px-6">
            Concluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
