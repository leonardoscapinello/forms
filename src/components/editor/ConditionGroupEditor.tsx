import { useCallback } from 'react';
import { ConditionGroup, ConditionRule, ConditionOperator, LogicOperator, FormVariable, IntegrationNodeData } from '@/types/form';
import VariableSelect from './shared/VariableSelect';
import { LocalInput } from './shared/LocalInput';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Group } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InputElementGroup } from './VariableAssignPanel';
import { CONTEXT_KEYS } from '@/lib/sessionContext';

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals',      label: '= igual' },
  { value: 'not_equals',  label: '≠ diferente' },
  { value: 'contains',    label: '∋ contém' },
  { value: 'not_contains',label: '∌ não contém' },
  { value: 'greater_than',label: '> maior que' },
  { value: 'less_than',   label: '< menor que' },
  { value: 'is_empty',    label: '∅ vazio' },
  { value: 'is_not_empty',label: '≠∅ preenchido' },
];

interface Props {
  group: ConditionGroup;
  allInputElements: InputElementGroup[];
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  onChange: (group: ConditionGroup) => void;
  depth?: number;
  onRemove?: () => void;
  onCreateVariable?: (variable: FormVariable) => void;
}

export default function ConditionGroupEditor({ group, allInputElements = [], variables = [], integrationNodes = [], onChange, depth = 0, onRemove, onCreateVariable }: Props) {
  // Webhook nodes that have response fields from a successful test
  const webhookNodesWithFields = integrationNodes.filter(n => (n.responseFields?.length ?? 0) > 0);

  // Build subject type options dynamically
  const subjectTypes: { value: string; label: string }[] = [
    { value: 'question', label: 'Campo' },
    { value: 'context', label: 'Contexto' },
    { value: 'param', label: 'Parâmetro' },
  ];
  // Always show 'variable' option since user can create inline
  subjectTypes.push({ value: 'variable', label: 'Variável' });
  if (webhookNodesWithFields.length > 0) subjectTypes.push({ value: 'webhook_response', label: 'Webhook' });

  const updateRule = useCallback((ruleId: string, patch: Partial<ConditionRule>) => {
    onChange({ ...group, rules: group.rules.map(r => (r.id === ruleId ? { ...r, ...patch } : r)) });
  }, [group, onChange]);

  const removeRule = useCallback((ruleId: string) => {
    onChange({ ...group, rules: group.rules.filter(r => r.id !== ruleId) });
  }, [group, onChange]);

  const firstElementId = allInputElements[0]?.elements[0]?.elementId || '';

  const addRule = useCallback(() => {
    const rule: ConditionRule = {
      id: crypto.randomUUID(),
      subjectType: 'question',
      questionId: firstElementId,
      operator: 'equals',
      value: '',
      logicWithPrev: group.rules.length > 0 || group.groups.length > 0 ? 'and' : undefined,
    };
    onChange({ ...group, rules: [...group.rules, rule] });
  }, [group, firstElementId, onChange]);

  const addSubGroup = useCallback(() => {
    const subGroup: ConditionGroup = {
      id: crypto.randomUUID(),
      logic: 'or',
      rules: [{
        id: crypto.randomUUID(),
        subjectType: 'question',
        questionId: firstElementId,
        operator: 'equals',
        value: '',
      }],
      groups: [],
    };
    onChange({ ...group, groups: [...group.groups, subGroup] });
  }, [group, firstElementId, onChange]);

  const updateSubGroup = useCallback((subGroupId: string, updatedSubGroup: ConditionGroup) => {
    onChange({ ...group, groups: group.groups.map(g => g.id === subGroupId ? updatedSubGroup : g) });
  }, [group, onChange]);

  const removeSubGroup = useCallback((subGroupId: string) => {
    onChange({ ...group, groups: group.groups.filter(g => g.id !== subGroupId) });
  }, [group, onChange]);

  const toggleLogic = useCallback((ruleId: string, current: LogicOperator) => {
    onChange({
      ...group,
      rules: group.rules.map(r => r.id === ruleId ? { ...r, logicWithPrev: current === 'and' ? 'or' : 'and' } : r),
    });
  }, [group, onChange]);

  const toggleGroupLogic = useCallback(() => {
    onChange({ ...group, logic: group.logic === 'and' ? 'or' : 'and' });
  }, [group, onChange]);

  // Total items count (rules + sub-groups) for determining if we show connectors
  const totalItems = group.rules.length + group.groups.length;

  // Determine the connector logic between rules and sub-groups at this level
  // For root: each rule has its own logicWithPrev
  // For sub-groups connecting to previous items: use the sub-group's logic property
  const isRoot = depth === 0;

  return (
    <div className={`space-y-1.5 ${depth > 0 ? 'pl-2 border-l-2 border-primary/20 ml-1' : ''}`}>
      {/* Sub-group header for non-root */}
      {depth > 0 && (
        <div className="flex items-center gap-1.5 mb-1">
          <button
            onClick={toggleGroupLogic}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full select-none cursor-pointer transition-colors ${
              group.logic === 'and'
                ? 'bg-primary/15 text-primary hover:bg-primary/25'
                : 'bg-warning/15 text-warning hover:bg-warning/25'
            }`}
          >
            {group.logic === 'and' ? 'E (todas)' : 'OU (qualquer)'}
          </button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="ml-auto p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Rules */}
      {group.rules.map((rule, idx) => {
        const subjectType = rule.subjectType ?? 'question';
        const logic = rule.logicWithPrev ?? 'and';
        const showConnector = idx > 0;

        return (
          <div key={rule.id}>
            {/* Logic connector between rules */}
            {showConnector && (
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
              {/* Subject type selector */}
              {(variables.length > 0 || webhookNodesWithFields.length > 0) && (
                <div className="flex gap-0.5 bg-muted/50 rounded-md p-0.5">
                  {subjectTypes.map(t => (
                    <button
                      key={t.value}
                      onClick={() => updateRule(rule.id, {
                        subjectType: t.value as any,
                        variableId: undefined,
                        webhookNodeId: undefined,
                        webhookResponsePath: undefined,
                      })}
                      className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${
                        subjectType === t.value
                          ? 'bg-background text-foreground shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Subject selector */}
              <div className="flex items-center gap-1.5">
                {subjectType === 'webhook_response' ? (
                  <div className="flex-1 space-y-1">
                    <Select value={rule.webhookNodeId || ''} onValueChange={v => updateRule(rule.id, { webhookNodeId: v, webhookResponsePath: '' })}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="Webhook..." />
                      </SelectTrigger>
                      <SelectContent className="z-[200]">
                        {webhookNodesWithFields.map(wn => (
                          <SelectItem key={wn.id} value={wn.id} className="text-xs">
                            <span className="font-mono text-node-webhook-accent">🔗 {wn.webhookUrl ? (() => { try { return new URL(wn.webhookUrl).hostname; } catch { return wn.id.slice(0, 8); } })() : wn.id.slice(0, 8)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {rule.webhookNodeId && (() => {
                      const wn = webhookNodesWithFields.find(w => w.id === rule.webhookNodeId);
                      const fields = wn?.responseFields || [];
                      return fields.length > 0 ? (
                        <Select value={rule.webhookResponsePath || ''} onValueChange={v => updateRule(rule.id, { webhookResponsePath: v })}>
                          <SelectTrigger className="h-7 text-xs font-mono">
                            <SelectValue placeholder="Campo da resposta..." />
                          </SelectTrigger>
                          <SelectContent className="z-[200] max-h-48">
                            {fields.map(f => (
                              <SelectItem key={f} value={f} className="text-xs font-mono">{f}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-[9px] text-muted-foreground italic">Teste o webhook primeiro para ver os campos</p>
                      );
                    })()}
                  </div>
                ) : subjectType === 'variable' ? (
                  <VariableSelect
                    value={rule.variableId || ''}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    onValueChange={v => updateRule(rule.id, { variableId: v })}
                    onCreateVariable={onCreateVariable}
                    placeholder="Escolha a variável..."
                    accentClass="text-node-variable-op-accent"
                  />
                ) : subjectType === 'context' ? (
                  <Select value={rule.contextKey || ''} onValueChange={v => updateRule(rule.id, { contextKey: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Fator de contexto..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200] max-h-56">
                      {(() => {
                        const categories = [...new Set(CONTEXT_KEYS.map(c => c.category))];
                        return categories.map(cat => (
                          <SelectGroup key={cat}>
                            <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">{cat}</SelectLabel>
                            {CONTEXT_KEYS.filter(c => c.category === cat).map(c => (
                              <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                            ))}
                          </SelectGroup>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                ) : subjectType === 'param' ? (
                  <LocalInput
                    value={rule.paramKey || ''}
                    onCommit={v => updateRule(rule.id, { paramKey: v })}
                    placeholder="ex: utm_source"
                    className="h-7 text-xs flex-1 font-mono"
                  />
                ) : (
                  <Select value={rule.questionId} onValueChange={v => updateRule(rule.id, { questionId: v })}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Escolha o campo..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      {allInputElements.map(pg => (
                        <SelectGroup key={pg.pageId}>
                          <SelectLabel className="text-[9px] uppercase tracking-wider text-muted-foreground">{pg.pageTitle}</SelectLabel>
                          {pg.elements.map(el => (
                            <SelectItem key={el.elementId} value={el.elementId} className="text-xs">
                              {el.elementLabel}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {totalItems > 1 && (
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
                {rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty' && (() => {
                  // Check if selected field has options (radio/select/quiz) — show dropdown instead of free text
                  const OPTION_TYPES = ['input_select', 'input_radio', 'input_quiz_icon', 'input_quiz_image', 'input_multi_select'];
                  const selectedElement = subjectType === 'question'
                    ? allInputElements.flatMap(g => g.elements).find(el => el.elementId === rule.questionId)
                    : null;
                  const fieldOptions = selectedElement?.options;
                  const isOptionField = selectedElement && OPTION_TYPES.includes(selectedElement.elementType || '');

                  if (isOptionField && fieldOptions && fieldOptions.length > 0) {
                    return (
                      <Select value={rule.value || ''} onValueChange={v => updateRule(rule.id, { value: v })}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Escolha a opção..." />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          {fieldOptions.map((opt: any) => (
                            <SelectItem key={opt.id} value={opt.label} className="text-xs">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }

                  // Yes/No field
                  if (selectedElement?.elementType === 'input_yes_no') {
                    return (
                      <Select value={rule.value || ''} onValueChange={v => updateRule(rule.id, { value: v })}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Valor..." />
                        </SelectTrigger>
                        <SelectContent className="z-[200]">
                          <SelectItem value="yes" className="text-xs">Sim (yes)</SelectItem>
                          <SelectItem value="no" className="text-xs">Não (no)</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                  }

                  return (
                    <LocalInput
                      value={rule.value}
                      onCommit={v => updateRule(rule.id, { value: v })}
                      placeholder="Valor..."
                      className="h-7 text-xs flex-1"
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })}

      {/* Nested sub-groups */}
      {group.groups.map((subGroup, idx) => {
        const showConnector = group.rules.length > 0 || idx > 0;
        return (
          <div key={subGroup.id}>
            {showConnector && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-border" />
                <button
                  onClick={() => updateSubGroup(subGroup.id, { ...subGroup, logic: subGroup.logic === 'and' ? 'or' : 'and' })}
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full select-none cursor-pointer transition-colors ${
                    subGroup.logic === 'and'
                      ? 'bg-primary/15 text-primary hover:bg-primary/25'
                      : 'bg-warning/15 text-warning hover:bg-warning/25'
                  }`}
                >
                  {subGroup.logic === 'and' ? 'E' : 'OU'}
                </button>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <ConditionGroupEditor
              group={subGroup}
              allInputElements={allInputElements}
              variables={variables}
              integrationNodes={integrationNodes}
              onChange={updated => updateSubGroup(subGroup.id, updated)}
              depth={depth + 1}
              onRemove={() => removeSubGroup(subGroup.id)}
              onCreateVariable={onCreateVariable}
            />
          </div>
        );
      })}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] text-muted-foreground px-2 hover:text-foreground flex-1 border border-dashed border-border"
          onClick={addRule}
        >
          <Plus className="mr-1 h-2.5 w-2.5" />
          Condição
        </Button>
        {depth < 2 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-muted-foreground px-2 hover:text-foreground flex-1 border border-dashed border-border"
            onClick={addSubGroup}
          >
            <Group className="mr-1 h-2.5 w-2.5" />
            Grupo
          </Button>
        )}
      </div>
    </div>
  );
}
