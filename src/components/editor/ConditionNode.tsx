import { memo, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch, Plus, Trash2 } from 'lucide-react';
import { ConditionBranch, ConditionOperator, Question } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ConditionNodeDataProps {
  conditionId: string;
  label: string;
  branches: ConditionBranch[];
  questions: Question[];
  onChange: (patch: { label?: string; branches?: ConditionBranch[] }) => void;
  onDelete: () => void;
}

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: '= Igual a' },
  { value: 'not_equals', label: '≠ Diferente de' },
  { value: 'contains', label: '∋ Contém' },
  { value: 'not_contains', label: '∌ Não contém' },
  { value: 'greater_than', label: '> Maior que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'is_empty', label: '∅ Está vazio' },
  { value: 'is_not_empty', label: '✓ Não está vazio' },
];

function ConditionNode({ data, selected }: NodeProps & { data: ConditionNodeDataProps }) {
  const { label, branches, questions, onChange, onDelete } = data;

  const addBranch = useCallback(() => {
    const newBranch: ConditionBranch = {
      id: crypto.randomUUID(),
      label: `Caminho ${branches.length + 1}`,
      questionId: questions[0]?.id || '',
      operator: 'equals',
      value: '',
    };
    onChange({ branches: [...branches, newBranch] });
  }, [branches, questions, onChange]);

  const updateBranch = useCallback((branchId: string, patch: Partial<ConditionBranch>) => {
    onChange({
      branches: branches.map(b => (b.id === branchId ? { ...b, ...patch } : b)),
    });
  }, [branches, onChange]);

  const removeBranch = useCallback((branchId: string) => {
    onChange({ branches: branches.filter(b => b.id !== branchId) });
  }, [branches, onChange]);

  return (
    <div
      className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-node-condition-accent/30 bg-node-condition rounded-t-xl">
        <GitBranch className="h-3.5 w-3.5 text-node-condition-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-condition-accent">
          Condicional
        </span>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Label */}
      <div className="px-3 pt-2.5">
        <Input
          value={label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Nome da condição"
          className="text-sm font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-8"
        />
      </div>

      {/* Branches */}
      <div className="p-3 space-y-3">
        {branches.map((branch, idx) => (
          <div key={branch.id} className="relative border border-border rounded-lg p-2.5 space-y-1.5 bg-muted/20">
            {/* Branch output handle */}
            <Handle
              type="source"
              position={Position.Right}
              id={`branch-${branch.id}`}
              className="!w-3 !h-3 !bg-primary !border-2 !border-card"
              style={{ top: 'auto', right: -6 }}
            />

            <div className="flex items-center justify-between">
              <Input
                value={branch.label}
                onChange={e => updateBranch(branch.id, { label: e.target.value })}
                className="text-xs h-6 font-medium border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent"
                placeholder={`Caminho ${idx + 1}`}
              />
              {branches.length > 1 && (
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive" onClick={() => removeBranch(branch.id)}>
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>

            {/* Question selector */}
            <Select
              value={branch.questionId}
              onValueChange={v => updateBranch(branch.id, { questionId: v })}
            >
              <SelectTrigger className="h-6 text-[11px]">
                <SelectValue placeholder="Selecione uma pergunta" />
              </SelectTrigger>
              <SelectContent className="z-[200] bg-popover">
                {questions.map(q => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    {q.title || `Pergunta sem título`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={branch.operator}
              onValueChange={v => updateBranch(branch.id, { operator: v as ConditionOperator })}
            >
              <SelectTrigger className="h-6 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[200] bg-popover">
                {OPERATORS.map(op => (
                  <SelectItem key={op.value} value={op.value} className="text-xs">
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value — hidden for is_empty/is_not_empty */}
            {branch.operator !== 'is_empty' && branch.operator !== 'is_not_empty' && (
              <Input
                value={branch.value}
                onChange={e => updateBranch(branch.id, { value: e.target.value })}
                placeholder="Valor esperado"
                className="text-[11px] h-6"
              />
            )}
          </div>
        ))}

        {/* Default/else output */}
        <div className="relative flex items-center gap-2 text-[11px] text-muted-foreground px-2 py-1.5 rounded border border-dashed border-border">
          <Handle
            type="source"
            position={Position.Right}
            id="branch-default"
            className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card"
            style={{ top: 'auto', right: -6 }}
          />
          <span>Padrão (else)</span>
        </div>

        <Button variant="ghost" size="sm" className="w-full text-[11px] h-7 text-muted-foreground border border-dashed border-border" onClick={addBranch}>
          <Plus className="mr-1 h-3 w-3" />
          Adicionar caminho
        </Button>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
