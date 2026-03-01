import { memo, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Variable, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { FormVariable, VariableOpNodeData, VariableOperation, VariableOpType, VariableOperandType, IntegrationNodeData } from '@/types/form';
import VariableSelect from './shared/VariableSelect';
import { LocalInput } from './shared/LocalInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InputElementGroup } from './VariableAssignPanel';
import { validateVariableOpNode } from './nodeValidation';


interface VariableOpNodeProps {
  nodeId: string;
  label: string;
  operations: VariableOperation[];
  variables: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements: InputElementGroup[];
  onChange: (patch: Partial<VariableOpNodeData>) => void;
  onDelete: () => void;
  onCreateVariable?: (variable: FormVariable) => void;
}

const OP_OPTIONS: { value: VariableOpType; label: string }[] = [
  { value: 'set',      label: 'Atribuir (=)' },
  { value: 'add',      label: 'Somar (+)' },
  { value: 'subtract', label: 'Subtrair (−)' },
  { value: 'multiply', label: 'Multiplicar (×)' },
  { value: 'divide',   label: 'Dividir (÷)' },
];

function VariableOpNode({ data, selected }: NodeProps & { data: VariableOpNodeProps }) {
  const { label, operations, variables, integrationNodes = [], allInputElements = [], onChange, onDelete, onCreateVariable } = data;

  const validation = useMemo(() => validateVariableOpNode(operations, variables), [operations, variables]);

  const addOp = useCallback(() => {
    if (variables.length === 0) return;
    const newOp: VariableOperation = {
      id: crypto.randomUUID(),
      variableId: variables[0].id,
      op: 'set',
      operandType: 'literal',
      operand: '',
    };
    onChange({ operations: [...operations, newOp] });
  }, [operations, variables, onChange]);

  const updateOp = useCallback((id: string, patch: Partial<VariableOperation>) => {
    onChange({ operations: operations.map(o => o.id === id ? { ...o, ...patch } : o) });
  }, [operations, onChange]);

  const removeOp = useCallback((id: string) => {
    onChange({ operations: operations.filter(o => o.id !== id) });
  }, [operations, onChange]);

  return (
    <TooltipProvider>
    <div
      className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
        !validation.isValid
          ? 'border-destructive shadow-destructive/20 shadow-md ring-1 ring-destructive/40'
          : selected
            ? 'border-node-variable-op-accent shadow-md ring-2 ring-node-variable-op-accent/20'
            : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-variable-op-accent !border-2 !border-card" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-variable-op-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-variable-op-accent/30 bg-node-variable-op rounded-t-xl">
        <Variable className="h-3.5 w-3.5 text-node-variable-op-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-variable-op-accent">
          Variáveis
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
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>


      {/* Node label */}
      <div className="px-3 pt-2.5 pb-1">
        <LocalInput
          value={label}
          onCommit={v => onChange({ label: v })}
          placeholder="Nome do nó"
          className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-8"
        />
      </div>

      {/* Operations list */}
      <div className="px-3 pb-3 space-y-2">
        {variables.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
            Crie variáveis primeiro no painel de páginas
          </p>
        ) : operations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-lg">
            Nenhuma operação configurada
          </p>
        ) : (
          operations.map(op => {
            const operandType = op.operandType ?? 'literal';

            return (
              <div key={op.id} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
                {/* Row 1: Variable picker + delete */}
                <div className="flex items-center gap-2">
                  <VariableSelect
                    value={op.variableId}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    onValueChange={val => updateOp(op.id, { variableId: val })}
                    onCreateVariable={onCreateVariable}
                    accentClass="text-node-variable-op-accent"
                  />
                  <button
                    onClick={() => removeOp(op.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Row 2: Operation picker */}
                <Select value={op.op} onValueChange={val => updateOp(op.id, { op: val as VariableOpType })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OP_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Row 3: Operand source toggle */}
                <div className="flex gap-1">
                  {(['literal', 'field'] as VariableOperandType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => updateOp(op.id, { operandType: t, operand: '', operandFieldId: undefined })}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${
                        operandType === t
                          ? 'bg-node-variable-op-accent text-card border-node-variable-op-accent font-medium'
                          : 'border-border text-muted-foreground hover:border-node-variable-op-accent/50'
                      }`}
                    >
                      {t === 'literal' ? 'Valor livre' : 'Campo do formulário'}
                    </button>
                  ))}
                </div>

                {/* Row 4: Operand value */}
                {operandType === 'field' ? (
                  allInputElements.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-1.5 border border-dashed border-border rounded">
                      Nenhum campo nas páginas anteriores
                    </p>
                  ) : (
                    <Select
                      value={op.operandFieldId || ''}
                      onValueChange={val => updateOp(op.id, { operandFieldId: val })}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Selecionar campo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allInputElements.map(group => (
                          <SelectGroup key={group.pageId}>
                            <SelectLabel className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5">
                              📄 {group.pageTitle}
                            </SelectLabel>
                            {group.elements.map(el => (
                              <SelectItem key={el.elementId} value={el.elementId} className="text-xs pl-5">
                                {el.elementLabel}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <LocalInput
                    value={op.operand}
                    onCommit={v => updateOp(op.id, { operand: v })}
                    placeholder={op.op === 'set' ? 'Valor ou {{var}}...' : 'Número ou {{var}}...'}
                    className="h-7 text-xs"
                  />
                )}
              </div>
            );
          })
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs h-7 text-muted-foreground border border-dashed border-border"
          onClick={addOp}
          disabled={variables.length === 0}
        >
          <Plus className="mr-1 h-3 w-3" />
          Adicionar operação
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
}

export default memo(VariableOpNode);

