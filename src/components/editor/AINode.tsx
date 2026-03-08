import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AINodeData, AIObjective, FormVariable, IntegrationNodeData, FormVariableType } from '@/types/form';
import type { InputElementGroup } from './VariableAssignPanel';
import { DisabledBadge } from './NodeDisabledOverlay';
import AIConfigDialog from './ai-node/AIConfigDialog';

const OBJECTIVE_LABELS: Record<AIObjective, string> = {
  summarize: '📝 Resumir',
  classify: '🏷️ Classificar',
  generate: '✨ Gerar',
  extract: '🔍 Extrair',
  custom: '⚙️ Custom',
};

export interface AINodeProps {
  nodeData: AINodeData;
  onChange: (patch: Partial<AINodeData>) => void;
  onDelete: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  onCreateVariable?: (variable: FormVariable) => void;
}

function AINode({ data, selected }: NodeProps & { data: AINodeProps & { isNodeDisabled?: boolean; onToggleDisabled?: () => void } }) {
  const { nodeData, onChange, onDelete, variables = [], allInputElements = [], isNodeDisabled = false, onCreateVariable } = data;
  const [dialogOpen, setDialogOpen] = useState(false);

  const outputVariable = variables.find(v => v.id === nodeData.outputVariableId);
  const selectedInputCount = (nodeData.inputSources || []).length;
  const objective = (nodeData.objective || 'custom') as AIObjective;
  const objectiveLabel = OBJECTIVE_LABELS[objective] || '⚙️ Custom';
  const hasConfig = selectedInputCount > 0 || nodeData.prompt || outputVariable;

  return (
    <>
      <div className={`relative rounded-xl border-2 bg-card shadow-sm w-[200px] transition-all ${
        isNodeDisabled ? 'opacity-50 grayscale'
        : selected
          ? 'border-node-ai-accent shadow-md ring-2 ring-node-ai-accent/20'
          : 'border-border hover:border-node-ai-accent/40'
      }`}>
        {isNodeDisabled && <DisabledBadge />}

        <Handle type="target" position={Position.Left} style={{ top: '50%' }} className="!w-2.5 !h-2.5 !bg-node-ai-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} id="default" style={{ top: '50%' }} className="!w-2.5 !h-2.5 !bg-node-ai-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-node-ai-accent/20 bg-node-ai rounded-t-xl">
          <Sparkles className="h-3 w-3 text-node-ai-accent flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-node-ai-accent flex-1">IA</span>

          <div className="flex items-center gap-0">
            {data.onToggleDisabled && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center" onClick={e => { e.stopPropagation(); data.onToggleDisabled?.(); }}>
                      <Switch checked={!isNodeDisabled} className="scale-[0.5] origin-center" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">{isNodeDisabled ? 'Ativar' : 'Desativar'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button variant="ghost" size="icon" className="h-5 w-5 text-node-ai-accent hover:text-destructive" onClick={e => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          </div>
        </div>

        {/* Body — compact summary + config button */}
        <div className="px-2 py-2 space-y-1.5" onClick={e => e.stopPropagation()}>
          {/* Objective chip */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-foreground">{objectiveLabel}</span>
            {(nodeData.executionMode || 'sync') === 'async' && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-node-ai text-node-ai-accent font-medium leading-none">ASYNC</span>
            )}
          </div>

          {/* Config summary */}
          {hasConfig ? (
            <div className="space-y-0.5 text-[9px] text-muted-foreground">
              {selectedInputCount > 0 && <p>{selectedInputCount} campo(s) de entrada</p>}
              {nodeData.prompt && <p className="truncate">💬 {nodeData.prompt.slice(0, 40)}{nodeData.prompt.length > 40 ? '...' : ''}</p>}
              {outputVariable && <p>→ <span className="text-node-ai-accent font-semibold">{`{{${outputVariable.name}}}`}</span></p>}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground/60 italic">Não configurado</p>
          )}

          {/* Configure button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px] gap-1 border-node-ai-accent/30 hover:bg-node-ai hover:text-node-ai-accent mt-1"
            onClick={() => setDialogOpen(true)}
          >
            <Settings className="h-2.5 w-2.5" />
            Configurar
          </Button>
        </div>

        {/* Footer: fire once */}
        <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/30 rounded-b-xl">
          <span className="text-[9px] text-muted-foreground">1× apenas</span>
          <Switch
            checked={nodeData.fireOnce !== false}
            onCheckedChange={v => onChange({ fireOnce: v })}
            className="scale-[0.5] origin-right"
          />
        </div>
      </div>

      {/* Configuration dialog */}
      <AIConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        nodeData={nodeData}
        onChange={onChange}
        variables={variables}
        allInputElements={allInputElements}
        onCreateVariable={onCreateVariable}
      />
    </>
  );
}

export default memo(AINode);
