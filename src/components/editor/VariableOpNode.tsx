import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Variable, Plus, Trash2 } from 'lucide-react';
import { FormVariable, VariableOpNodeData, VariableOperation, VariableOpType, VariableOperandType } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface InputElement {
  elementId: string;
  elementLabel: string;
  pageTitle: string;
}

interface VariableOpNodeProps {
  nodeId: string;
  label: string;
  operations: VariableOperation[];
  variables: FormVariable[];
  allInputElements: InputElement[];
  onChange: (patch: Partial<VariableOpNodeData>) => void;
  onDelete: () => void;
}

const OP_OPTIONS: { value: VariableOpType; label: string; symbol: string }[] = [
  { value: 'set',      label: 'Atribuir (=)',      symbol: '=' },
  { value: 'add',      label: 'Somar (+)',          symbol: '+' },
  { value: 'subtract', label: 'Subtrair (−)',       symbol: '−' },
  { value: 'multiply', label: 'Multiplicar (×)',    symbol: '×' },
  { value: 'divide',   label: 'Dividir (÷)',        symbol: '÷' },
];

function VariableOpNode({ data, selected }: NodeProps & { data: VariableOpNodeProps }) {
  const { label, operations, variables, allInputElements = [], onChange, onDelete } = data;

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
    <div
      className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
        selected ? 'border-node-variable-op-accent shadow-md ring-2 ring-node-variable-op-accent/20' : 'border-border'
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

      {/* Node label */}
      <div className="px-3 pt-2.5">
        <Input
          value={label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Nome do nó"
          className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-8"
        />
      </div>

      {/* Operations list */}
      <div className="p-3 space-y-2">
        {variables.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2">
            Crie variáveis primeiro no painel de páginas
          </p>
        ) : operations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-2 border border-dashed border-border rounded-lg">
            Nenhuma operação
          </p>
        ) : (
          operations.map(op => {
            const variable = variables.find(v => v.id === op.variableId);
            const opDef = OP_OPTIONS.find(o => o.value === op.op);
            const operandType = op.operandType ?? 'literal';
            const selectedField = allInputElements.find(e => e.elementId === op.operandFieldId);

            // Preview label for operand
            const operandPreview = operandType === 'field'
              ? (selectedField ? selectedField.elementLabel : '?')
              : (op.operand || '?');

            return (
              <div key={op.id} className="bg-muted/30 rounded-lg border border-border/60 p-2 space-y-1.5">
                {/* Summary row */}
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-node-variable-op-accent font-semibold px-1 bg-node-variable-op rounded text-[10px]">
                    {variable ? `{{${variable.name}}}` : '—'}
                  </span>
                  <span className="text-muted-foreground font-bold">{opDef?.symbol}</span>
                  <span className="text-foreground truncate max-w-[80px]">{operandPreview}</span>
                  <button
                    onClick={() => removeOp(op.id)}
                    className="ml-auto p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {/* Variable picker */}
                <Select value={op.variableId} onValueChange={val => updateOp(op.id, { variableId: val })}>
                  <SelectTrigger className="h-6 text-[11px]">
                    <SelectValue placeholder="Variável..." />
                  </SelectTrigger>
                  <SelectContent>
                    {variables.map(v => (
                      <SelectItem key={v.id} value={v.id} className="text-xs">
                        <span className="font-mono text-node-variable-op-accent">{`{{${v.name}}}`}</span>
                        <span className="ml-1.5 text-muted-foreground">({v.type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operation picker */}
                <Select value={op.op} onValueChange={val => updateOp(op.id, { op: val as VariableOpType })}>
                  <SelectTrigger className="h-6 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OP_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operand source type toggle */}
                <div className="flex gap-1">
                  {(['literal', 'field'] as VariableOperandType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => updateOp(op.id, { operandType: t, operand: '', operandFieldId: undefined })}
                      className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                        operandType === t
                          ? 'bg-node-variable-op-accent text-card border-node-variable-op-accent'
                          : 'border-border text-muted-foreground hover:border-node-variable-op-accent/50'
                      }`}
                    >
                      {t === 'literal' ? 'Valor livre' : 'Campo'}
                    </button>
                  ))}
                </div>

                {/* Operand value */}
                {operandType === 'field' ? (
                  allInputElements.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-1">
                      Nenhum campo de entrada encontrado nas páginas
                    </p>
                  ) : (
                    <Select
                      value={op.operandFieldId || ''}
                      onValueChange={val => updateOp(op.id, { operandFieldId: val })}
                    >
                      <SelectTrigger className="h-6 text-[11px]">
                        <SelectValue placeholder="Selecionar campo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allInputElements.map(el => (
                          <SelectItem key={el.elementId} value={el.elementId} className="text-xs">
                            <span>{el.elementLabel}</span>
                            <span className="ml-1.5 text-muted-foreground text-[10px]">({el.pageTitle})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <Input
                    value={op.operand}
                    onChange={e => updateOp(op.id, { operand: e.target.value })}
                    placeholder={op.op === 'set' ? 'Valor ou {{var}}...' : 'Número ou {{var}}...'}
                    className="h-6 text-[11px]"
                  />
                )}
              </div>
            );
          })
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full text-[11px] h-7 text-muted-foreground border border-dashed border-border"
          onClick={addOp}
          disabled={variables.length === 0}
        >
          <Plus className="mr-1 h-3 w-3" />
          Adicionar operação
        </Button>
      </div>
    </div>
  );
}

export default memo(VariableOpNode);
