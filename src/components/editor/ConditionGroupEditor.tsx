import { useCallback } from 'react';
import { ConditionGroup, ConditionRule, ConditionOperator, LogicOperator, Question } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Parentheses } from 'lucide-react';
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

type Item = { type: 'rule'; rule: ConditionRule } | { type: 'group'; group: ConditionGroup };

function getItemLogic(item: Item): LogicOperator {
  if (item.type === 'rule') return item.rule.logicWithPrev || 'and';
  // For groups, use the first rule's logicWithPrev or group logic
  return item.group.rules[0]?.logicWithPrev || item.group.logic || 'and';
}

function setItemLogic(item: Item, logic: LogicOperator, onChange: (group: ConditionGroup) => void, group: ConditionGroup) {
  if (item.type === 'rule') {
    onChange({
      ...group,
      rules: group.rules.map(r => r.id === item.rule.id ? { ...r, logicWithPrev: logic } : r),
    });
  } else {
    onChange({
      ...group,
      groups: group.groups.map(g => g.id === item.group.id ? { ...g, logic } : g),
    });
  }
}

export default function ConditionGroupEditor({ group, questions, onChange, onRemove, depth = 0 }: Props) {
  const updateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    onChange({ ...group, rules: group.rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)) });
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
      logicWithPrev: 'and',
    };
    onChange({ ...group, rules: [...group.rules, rule] });
  }, [group, questions, onChange]);

  const addSubGroup = useCallback(() => {
    const sub: ConditionGroup = {
      id: crypto.randomUUID(),
      logic: 'and',
      rules: [
        { id: crypto.randomUUID(), questionId: questions[0]?.id || '', operator: 'equals', value: '' },
        { id: crypto.randomUUID(), questionId: questions[0]?.id || '', operator: 'equals', value: '', logicWithPrev: 'and' },
      ],
      groups: [],
    };
    onChange({ ...group, groups: [...group.groups, sub] });
  }, [group, questions, onChange]);

  const updateSubGroup = useCallback((subId: string, updated: ConditionGroup) => {
    onChange({ ...group, groups: group.groups.map(g => (g.id === subId ? updated : g)) });
  }, [group, onChange]);

  const removeSubGroup = useCallback((subId: string) => {
    onChange({ ...group, groups: group.groups.filter(g => g.id !== subId) });
  }, [group, onChange]);

  // Build flat ordered list of items
  const items: Item[] = [
    ...group.rules.map(r => ({ type: 'rule' as const, rule: r })),
    ...group.groups.map(g => ({ type: 'group' as const, group: g })),
  ];

  const totalItems = items.length;

  const depthBorders = ['border-primary/20', 'border-warning/20', 'border-destructive/20'];
  const depthBgs = ['bg-primary/5', 'bg-warning/5', 'bg-destructive/5'];

  return (
    <div className={`${depth > 0 ? `rounded-lg border ${depthBorders[depth % 3]} ${depthBgs[depth % 3]} p-2` : ''}`}>
      {/* Group header for sub-groups */}
      {depth > 0 && onRemove && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Parentheses className="h-2.5 w-2.5" />
            Grupo
          </span>
          <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.type === 'rule' ? item.rule.id : item.group.id}>
          {/* Logic connector between items — clickable toggle */}
          {idx > 0 && (
            <LogicConnector
              logic={getItemLogic(item)}
              onToggle={(logic) => setItemLogic(item, logic, onChange, group)}
            />
          )}

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
            <Parentheses className="mr-0.5 h-2 w-2" />
            Grupo
          </Button>
        )}
      </div>
    </div>
  );
}

/** Clickable AND/OR toggle between rules */
function LogicConnector({ logic, onToggle }: { logic: LogicOperator; onToggle: (v: LogicOperator) => void }) {
  const isAnd = logic === 'and';
  return (
    <div className="flex items-center py-0.5 my-0.5">
      <div className="flex-1 h-px bg-border" />
      <button
        onClick={() => onToggle(isAnd ? 'or' : 'and')}
        className={`text-[8px] font-bold px-2.5 py-0.5 rounded-full select-none cursor-pointer transition-colors ${
          isAnd
            ? 'bg-primary/15 text-primary hover:bg-primary/25'
            : 'bg-warning/15 text-warning hover:bg-warning/25'
        }`}
      >
        {isAnd ? 'E' : 'OU'}
      </button>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function RuleRow({ rule, questions, canRemove, onUpdate, onRemove }: {
  rule: ConditionRule; questions: Question[]; canRemove: boolean;
  onUpdate: (patch: Partial<ConditionRule>) => void; onRemove: () => void;
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
              <SelectItem key={q.id} value={q.id} className="text-[10px]">{q.title || 'Sem título'}</SelectItem>
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
          <SelectTrigger className="h-5 text-[10px] flex-1"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[200] bg-popover">
            {OPERATORS.map(op => (
              <SelectItem key={op.value} value={op.value} className="text-[10px]">{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (
          <Input value={rule.value} onChange={e => onUpdate({ value: e.target.value })} placeholder="Valor" className="text-[10px] h-5 flex-1" />
        )}
      </div>
    </div>
  );
}
