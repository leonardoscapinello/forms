import { memo, useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ConditionBranch, ConditionGroup, FormVariable, IntegrationNodeData, createDefaultConditionGroup } from '@/types/form';
import { LocalInput } from './shared/LocalInput';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ConditionGroupEditor from './ConditionGroupEditor';
import { NodeToggleSwitch } from './NodeDisabledOverlay';
import { validateConditionNode } from './nodeValidation';
import { InputElementGroup } from './VariableAssignPanel';

interface ConditionNodeDataProps {
  conditionId: string;
  label: string;
  branches: ConditionBranch[];
  allInputElements: InputElementGroup[];
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  isNodeDisabled?: boolean;
  onToggleDisabled?: () => void;
  onChange: (patch: { label?: string; branches?: ConditionBranch[] }) => void;
  onDelete: () => void;
  onCreateVariable?: (variable: FormVariable) => void;
}

function ConditionNode({ data, selected }: NodeProps & { data: ConditionNodeDataProps }) {
  const { label, branches, allInputElements = [], variables = [], integrationNodes = [], isNodeDisabled = false, onToggleDisabled, onChange, onDelete, onCreateVariable } = data;
  const [expandedBranch, setExpandedBranch] = useState<string | null>(branches[0]?.id ?? null);

  const validation = useMemo(() => validateConditionNode(branches, variables), [branches, variables]);

  const firstElementId = allInputElements[0]?.elements[0]?.elementId || '';

  const addBranch = useCallback(() => {
    const newBranch: ConditionBranch = {
      id: crypto.randomUUID(),
      label: `Se ${branches.length + 1}`,
      conditionGroup: createDefaultConditionGroup(firstElementId),
    };
    onChange({ branches: [...branches, newBranch] });
    setExpandedBranch(newBranch.id);
  }, [branches, firstElementId, onChange]);

  const updateBranch = useCallback((branchId: string, patch: Partial<ConditionBranch>) => {
    onChange({ branches: branches.map(b => (b.id === branchId ? { ...b, ...patch } : b)) });
  }, [branches, onChange]);

  const removeBranch = useCallback((branchId: string) => {
    const next = branches.filter(b => b.id !== branchId);
    onChange({ branches: next });
    if (expandedBranch === branchId) setExpandedBranch(next[0]?.id ?? null);
  }, [branches, onChange, expandedBranch]);

  return (
    <TooltipProvider>
      <div
        className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
          isNodeDisabled
            ? 'opacity-50 grayscale'
            : !validation.isValid
              ? 'border-destructive shadow-destructive/20 shadow-md ring-1 ring-destructive/40'
              : selected
                ? 'border-node-condition-accent shadow-md ring-2 ring-node-condition-accent/20'
                : 'border-border'
        }`}
      >
        <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-node-condition-accent/30 bg-node-condition rounded-t-xl">
          <GitBranch className="h-3.5 w-3.5 text-node-condition-accent" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-node-condition-accent">
            Condição
          </span>
          <div className="ml-auto flex items-center gap-1">
            {!validation.isValid && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  <ul className="space-y-0.5">
                    {validation.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </TooltipContent>
              </Tooltip>
            )}
            {onToggleDisabled && <NodeToggleSwitch isDisabled={isNodeDisabled} onToggle={onToggleDisabled} />}
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Label */}
        <div className="px-3 pt-2.5 pb-1 nodrag nopan nowheel">
          <LocalInput
            value={label}
            onCommit={v => onChange({ label: v })}
            placeholder="Nome do nó"
            className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-8"
          />
        </div>

        {/* Branches */}
        <div className="px-3 pb-3 space-y-1.5 nodrag nopan nowheel" onPointerDown={e => e.stopPropagation()}>
          {branches.map((branch, idx) => {
            const group: ConditionGroup = branch.conditionGroup || {
              id: crypto.randomUUID(),
              logic: 'and',
              rules: [{
                id: crypto.randomUUID(),
                questionId: branch.questionId || firstElementId,
                operator: branch.operator || 'equals',
                value: branch.value || '',
              }],
              groups: [],
            };

            const isExpanded = expandedBranch === branch.id;

            // Check if this specific branch has errors
            const branchRules = branch.conditionGroup?.rules ?? [];
            const branchHasError = branchRules.length === 0 || branchRules.some(r => {
              if (r.subjectType === 'webhook_response') return !r.webhookNodeId || !r.webhookResponsePath;
              if (r.subjectType === 'variable') return !r.variableId;
              if (!r.questionId) return true;
              const needsValue = r.operator !== 'is_empty' && r.operator !== 'is_not_empty';
              return needsValue && !r.value?.trim();
            });

            return (
              <div
                key={branch.id}
                className={`relative rounded-lg border transition-colors ${
                  branchHasError ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/20'
                }`}
              >
                {/* Branch output handle - positioned at the branch header row */}
                <Handle
                  type="source"
                  position={Position.Right}
                  id={`branch-${branch.id}`}
                  className="!w-3 !h-3 !bg-node-condition-accent !border-2 !border-card !absolute !right-[-18px]"
                  style={{ top: 14, position: 'absolute' }}
                />

                {/* Branch header */}
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedBranch(isExpanded ? null : branch.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  }
                  <span className="text-[11px] font-medium text-node-condition-accent flex-shrink-0 w-5">{idx + 1}.</span>
                  <LocalInput
                    value={branch.label}
                    onCommit={v => updateBranch(branch.id, { label: v })}
                    onClick={e => e.stopPropagation()}
                    className="text-xs h-6 font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent flex-1"
                    placeholder={`Se ${idx + 1}`}
                  />
                  {branchHasError && (
                    <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                  )}
                  {branches.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); removeBranch(branch.id); }}
                      className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>

                {/* Branch conditions */}
                {isExpanded && (
                  <div className="px-2.5 pb-2.5">
                    <ConditionGroupEditor
                      group={group}
                      allInputElements={allInputElements}
                      variables={variables}
                      integrationNodes={integrationNodes}
                      onChange={updatedGroup => updateBranch(branch.id, { conditionGroup: updatedGroup })}
                      onCreateVariable={onCreateVariable}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Default/else output */}
          <div className="relative flex items-center gap-2 text-xs text-muted-foreground px-2.5 py-1.5 rounded-lg border border-dashed border-border">
            <Handle
              type="source"
              position={Position.Right}
              id="branch-default"
              className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card !absolute !right-[-18px]"
              style={{ top: '50%', transform: 'translateY(-50%)', position: 'absolute' }}
            />
            <span className="italic text-[11px]">Senão</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-7 text-muted-foreground border border-dashed border-border"
            onClick={addBranch}
          >
            <Plus className="mr-1 h-3 w-3" />
            Novo caminho
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default memo(ConditionNode);

