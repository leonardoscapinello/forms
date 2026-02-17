import { useCallback } from 'react';
import { ConditionGroup, ConditionRule, ConditionOperator, LogicOperator, Question, FormVariable } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals',      label: 'igual a' },
  { value: 'not_equals',  label: 'diferente de' },
  { value: 'contains',    label: 'contém' },
  { value: 'not_contains',label: 'não contém' },
  { value: 'greater_than',label: 'maior que' },
  { value: 'less_than',   label: 'menor que' },
  { value: 'is_empty',    label: 'está vazio' },
  { value: 'is_not_empty',label: 'não está vazio' },
];

interface Props {
  group: ConditionGroup;
  questions: Question[];
  variables?: FormVariable[];
  onChange: (group: ConditionGroup) => void;
}

export default function ConditionGroupEditor({ group, questions, variables = [], onChange }: Props) {
  const updateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    onChange({ ...group, rules: group.rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)) });
  }, [group, onChange]);

  const removeRule = useCallback((ruleId: string) => {
    onChange({ ...group, rules: group.rules.filter(r => r.id !== ruleId) });
  }, [group, onChange]);

  const addRule = useCallback(() => {
    const rule: ConditionRule = {
      id: crypto.randomUUID(),
      subjectType: 'question',
      questionId: questions[0]?.id || '',
      operator: 'equals',
      value: '',
      logicWithPrev: 'and',
    };
    onChange({ ...group, rules: [...group.rules, rule] });
  }, [group, questions, onChange]);

  const toggleLogic = useCallback((ruleId: string, current: LogicOperator) => {
    onChange({
      ...group,
      rules: group.rules.map(r => r.id === ruleId ? { ...r, logicWithPrev: current === 'and' ? 'or' : 'and' } : r),
    });
  }, [group, onChange]);

  return (
    <div className="space-y-1.5">
      {group.rules.map((rule, idx) => {
        const subjectType = rule.subjectType ?? 'question';
        const logic = rule.logicWithPrev ?? 'and';

        return (
          <div key={rule.id}>
            {/* Logic connector between rules */}
            {idx > 0 && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-border" />
                <button
                  onClick={() => toggleLogic(rule.id, logic)}
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full select-none cursor-pointer transition-colors ${
                    logic === 'and'
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'bg-warning/15 text-warning hover:bg-warning/25'
                  }`}
                >
                  {logic === 'and' ? 'E' : 'OU'}
                </button>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Rule card */}
            <div className="rounded-lg bg-background border border-border p-2 space-y-1.5">
              {/* Subject: question or variable toggle */}
              {variables.length > 0 && (
                <div className="flex gap-1">
                  {(['question', 'variable'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => updateRule(rule.id, { subjectType: t, variableId: undefined })}
                      className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${
                        subjectType === t
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {t === 'question' ? 'Campo' : 'Variável'}
                    </button>
                  ))}
                </div>
              )}

              {/* Subject selector */}
              <div className="flex items-center gap-1.5">
                {subjectType === 'variable' ? (
                  <Select value={rule.variableId || ''} onValueChange={v => updateRule(rule.id, { variableId: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Escolha a variável..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {variables.map(v => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          <span className="font-mono text-node-variable-op-accent">{`{{${v.name}}}`}</span>
                          <span className="ml-1.5 text-muted-foreground">({v.type})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={rule.questionId} onValueChange={v => updateRule(rule.id, { questionId: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Escolha o campo..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {questions.map(q => (
                        <SelectItem key={q.id} value={q.id} className="text-xs">
                          {q.title || 'Sem título'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {group.rules.length > 1 && (
                  <button
                    onClick={() => removeRule(rule.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Operator + value */}
              <div className="flex items-center gap-1.5">
                <Select value={rule.operator} onValueChange={v => updateRule(rule.id, { operator: v as ConditionOperator })}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[200]">
                    {OPERATORS.map(op => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
                  <Input
                    value={rule.value}
                    onChange={e => updateRule(rule.id, { value: e.target.value })}
                    placeholder="Valor..."
                    className="h-7 text-xs flex-1"
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] text-muted-foreground px-2 hover:text-foreground w-full border border-dashed border-border"
        onClick={addRule}
      >
        <Plus className="mr-1 h-2.5 w-2.5" />
        Adicionar regra
      </Button>
    </div>
  );
}
