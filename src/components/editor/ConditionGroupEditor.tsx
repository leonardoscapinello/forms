import { useCallback } from 'react';
import { ConditionGroup, ConditionRule, ConditionOperator, Question, createDefaultConditionGroup } from '@/types/form';
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
  const isAnd = group.logic === 'and';

  // Colors based on depth to visually distinguish nesting
  const depthStyles = [
    { border: 'border-primary/30', bg: 'bg-primary/5', pill: 'bg-primary text-primary-foreground' },
    { border: 'border-warning/30', bg: 'bg-warning/5', pill: 'bg-warning text-warning-foreground' },
    { border: 'border-destructive/30', bg: 'bg-destructive/5', pill: 'bg-destructive text-destructive-foreground' },
  ];
  const style = depthStyles[depth % depthStyles.length];

  // Collect all items (rules + groups) to render separators between them
  const items: Array<{ type: 'rule'; rule: ConditionRule } | { type: 'group'; group: ConditionGroup }> = [
    ...group.rules.map(r => ({ type: 'rule' as const, rule: r })),
    ...group.groups.map(g => ({ type: 'group' as const, group: g })),
  ];

  const logicSeparator = (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="flex-1 h-px bg-border" />
      <button
        onClick={toggleLogic}
        className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full ${style.pill} hover:opacity-80 transition-opacity select-none`}
      >
        {isAnd ? 'E' : 'OU'}
      </button>
      <div className="flex-1 h-px bg-border" />
    </div>
  );

  return (
    <div className={`rounded-md ${depth > 0 ? `border ${style.border} ${style.bg} p-2` : ''}`}>
      {/* Logic toggle at top for root level */}
      {depth === 0 && totalItems > 1 && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[9px] text-muted-foreground">Lógica:</span>
          <button
            onClick={toggleLogic}
            className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full transition-colors ${
              isAnd ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            E
          </button>
          <button
            onClick={toggleLogic}
            className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full transition-colors ${
              !isAnd ? 'bg-warning text-warning-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            OU
          </button>
        </div>
      )}

      {/* Sub-group logic toggle */}
      {depth > 0 && totalItems > 1 && (
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleLogic}
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                isAnd ? style.pill : 'bg-muted text-muted-foreground'
              }`}
            >
              E
            </button>
            <button
              onClick={toggleLogic}
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                !isAnd ? style.pill : 'bg-muted text-muted-foreground'
              }`}
            >
              OU
            </button>
          </div>
          {onRemove && (
            <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-2.5 w-2.5" />
            </Button>
          )}
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.type === 'rule' ? item.rule.id : item.group.id}>
          {idx > 0 && logicSeparator}

          {item.type === 'rule' ? (
            <RuleRow
              rule={item.rule}
              questions={questions}
              canRemove={totalItems > 1}
              onUpdate={(patch) => updateRule(item.rule.id, patch)}
              onRemove={() => removeRule(item.rule.id)}
            />
          ) : (
            <ConditionGroupEditor
              group={item.group}
              questions={questions}
              onChange={updated => updateSubGroup(item.group.id, updated)}
              onRemove={() => removeSubGroup(item.group.id)}
              depth={depth + 1}
            />
          )}
        </div>
      ))}

      {/* Actions */}
      <div className="flex gap-1 mt-1.5">
        <Button variant="ghost" size="sm" className="h-5 text-[9px] text-muted-foreground px-1.5 hover:text-foreground" onClick={addRule}>
          <Plus className="mr-0.5 h-2 w-2" />
          Regra
        </Button>
        {depth < 2 && (
          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-muted-foreground px-1.5 hover:text-foreground" onClick={addSubGroup}>
            <Layers className="mr-0.5 h-2 w-2" />
            Grupo
          </Button>
        )}
        {depth > 0 && onRemove && totalItems <= 1 && (
          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-destructive px-1.5 ml-auto" onClick={onRemove}>
            <Trash2 className="mr-0.5 h-2 w-2" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Single rule row */
function RuleRow({
  rule,
  questions,
  canRemove,
  onUpdate,
  onRemove,
}: {
  rule: ConditionRule;
  questions: Question[];
  canRemove: boolean;
  onUpdate: (patch: Partial<ConditionRule>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded bg-card border border-border p-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <Select value={rule.questionId} onValueChange={v => onUpdate({ questionId: v })}>
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
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive flex-shrink-0" onClick={onRemove}>
            <Trash2 className="h-2 w-2" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Select value={rule.operator} onValueChange={v => onUpdate({ operator: v as ConditionOperator })}>
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
        {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
          <Input
            value={rule.value}
            onChange={e => onUpdate({ value: e.target.value })}
            placeholder="Valor"
            className="text-[10px] h-5 flex-1"
          />
        )}
      </div>
    </div>
  );
}
