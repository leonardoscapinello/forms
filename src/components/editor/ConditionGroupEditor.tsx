import { useCallback } from 'react';
import { ConditionGroup, ConditionRule, ConditionOperator, LogicOperator, Question } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Layers } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: '= Igual a' },
  { value: 'not_equals', label: '≠ Diferente' },
  { value: 'contains', label: '∋ Contém' },
  { value: 'not_contains', label: '∌ Não contém' },
  { value: 'greater_than', label: '> Maior que' },
  { value: 'less_than', label: '< Menor que' },
  { value: 'is_empty', label: '∅ Vazio' },
  { value: 'is_not_empty', label: '✓ Não vazio' },
];

interface Props {
  group: ConditionGroup;
  questions: Question[];
  onChange: (group: ConditionGroup) => void;
  onRemove?: () => void;
  depth?: number;
}

export default function ConditionGroupEditor({ group, questions, onChange, onRemove, depth = 0 }: Props) {
  const toggleLogic = useCallback(() => {
    onChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' });
  }, [group, onChange]);

  const updateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    onChange({
      ...group,
      rules: group.rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)),
    });
  }, [group, onChange]);

  const removeRule = useCallback((ruleId: string) => {
    onChange({ ...group, rules: group.rules.filter(r => r.id !== ruleId) });
  }, [group, onChange]);

  const addRule = useCallback(() => {
    const rule: ConditionRule = {
      id: crypto.randomUUID(),
      questionId: questions[0]?.id || '',
      operator: 'equals',
      value: '',
    };
    onChange({ ...group, rules: [...group.rules, rule] });
  }, [group, questions, onChange]);

  const addSubGroup = useCallback(() => {
    const sub: ConditionGroup = {
      id: crypto.randomUUID(),
      logic: group.logic === 'and' ? 'or' : 'and',
      rules: [{
        id: crypto.randomUUID(),
        questionId: questions[0]?.id || '',
        operator: 'equals',
        value: '',
      }],
      groups: [],
    };
    onChange({ ...group, groups: [...group.groups, sub] });
  }, [group, questions, onChange]);

  const updateSubGroup = useCallback((subId: string, updated: ConditionGroup) => {
    onChange({
      ...group,
      groups: group.groups.map(g => (g.id === subId ? updated : g)),
    });
  }, [group, onChange]);

  const removeSubGroup = useCallback((subId: string) => {
    onChange({ ...group, groups: group.groups.filter(g => g.id !== subId) });
  }, [group, onChange]);

  const totalItems = group.rules.length + group.groups.length;
  const logicLabel = group.logic === 'and' ? 'E' : 'OU';
  const logicColor = group.logic === 'and' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning';

  return (
    <div className={`space-y-1.5 ${depth > 0 ? 'ml-2 pl-2 border-l-2 border-border/60' : ''}`}>
      {/* Rules */}
      {group.rules.map((rule, idx) => (
        <div key={rule.id}>
          {idx > 0 || group.groups.length > 0 ? (
            <div className="flex justify-center my-0.5">
              <button
                onClick={toggleLogic}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${logicColor} hover:opacity-80 transition-opacity`}
              >
                {logicLabel}
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 p-1.5 rounded bg-muted/20 border border-border/50">
            <div className="flex items-center gap-1">
              {/* Question selector */}
              <Select value={rule.questionId} onValueChange={v => updateRule(rule.id, { questionId: v })}>
                <SelectTrigger className="h-5 text-[10px] flex-1 min-w-0">
                  <SelectValue placeholder="Pergunta" />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-popover">
                  {questions.map(q => (
                    <SelectItem key={q.id} value={q.id} className="text-[10px]">
                      {q.title || 'Sem título'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {totalItems > 1 && (
                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={() => removeRule(rule.id)}>
                  <Trash2 className="h-2 w-2" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Operator */}
              <Select value={rule.operator} onValueChange={v => updateRule(rule.id, { operator: v as ConditionOperator })}>
                <SelectTrigger className="h-5 text-[10px] flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[200] bg-popover">
                  {OPERATORS.map(op => (
                    <SelectItem key={op.value} value={op.value} className="text-[10px]">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Value */}
              {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
                <Input
                  value={rule.value}
                  onChange={e => updateRule(rule.id, { value: e.target.value })}
                  placeholder="Valor"
                  className="text-[10px] h-5 flex-1"
                />
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Sub-groups */}
      {group.groups.map((sub, idx) => (
        <div key={sub.id}>
          {(group.rules.length > 0 || idx > 0) && (
            <div className="flex justify-center my-0.5">
              <button
                onClick={toggleLogic}
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${logicColor} hover:opacity-80 transition-opacity`}
              >
                {logicLabel}
              </button>
            </div>
          )}
          <ConditionGroupEditor
            group={sub}
            questions={questions}
            onChange={updated => updateSubGroup(sub.id, updated)}
            onRemove={() => removeSubGroup(sub.id)}
            depth={depth + 1}
          />
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-1 pt-0.5">
        <Button variant="ghost" size="sm" className="h-5 text-[9px] text-muted-foreground px-1.5" onClick={addRule}>
          <Plus className="mr-0.5 h-2 w-2" />
          Regra
        </Button>
        {depth < 2 && (
          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-muted-foreground px-1.5" onClick={addSubGroup}>
            <Layers className="mr-0.5 h-2 w-2" />
            Grupo
          </Button>
        )}
        {onRemove && (
          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-destructive px-1.5 ml-auto" onClick={onRemove}>
            <Trash2 className="mr-0.5 h-2 w-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
