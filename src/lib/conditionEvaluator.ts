import { ConditionGroup, ConditionRule, ConditionBranch, ConditionNodeData, FormData, FormVariable } from '@/types/form';

/** Get a value from an object using dot/bracket path */
function getNestedValue(obj: any, path: string): any {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return tokens.reduce((acc, key) => acc != null ? acc[key] : undefined, obj);
}

/**
 * Resolves the subject value for a rule — either a question answer, variable value, or webhook response field.
 */
function resolveSubjectValue(rule: ConditionRule, answers: Record<string, any>, variables?: FormVariable[]): string {
  if (rule.subjectType === 'context' && rule.contextKey) {
    const val = answers[`__ctx_${rule.contextKey}`];
    return val !== undefined && val !== null ? String(val) : '';
  }
  if (rule.subjectType === 'param' && rule.paramKey) {
    const val = answers[`__param_${rule.paramKey}`];
    return val !== undefined && val !== null ? String(val) : '';
  }
  if (rule.subjectType === 'webhook_response' && rule.webhookNodeId && rule.webhookResponsePath) {
    const webhookData = answers[`__webhook_${rule.webhookNodeId}`];
    if (webhookData) {
      const val = getNestedValue(webhookData, rule.webhookResponsePath);
      return val !== undefined && val !== null ? String(val) : '';
    }
    return '';
  }
  if (rule.subjectType === 'variable' && rule.variableId && variables) {
    const variable = variables.find(v => v.id === rule.variableId);
    if (variable) {
      const storeKey = `__var_${variable.name}`;
      const val = answers[storeKey] ?? answers[variable.sourceElementId || ''] ?? variable.defaultValue ?? '';
      return String(val);
    }
    return '';
  }
  // Default: question answer
  const answer = answers[rule.questionId];
  return answer !== undefined && answer !== null ? String(answer) : '';
}

/**
 * Evaluates a single condition rule against the current answers.
 */
function evaluateRule(rule: ConditionRule, answers: Record<string, any>, variables?: FormVariable[]): boolean {
  const answerStr = resolveSubjectValue(rule, answers, variables);
  const ruleValue = rule.value ?? '';

  switch (rule.operator) {
    case 'equals':
      return answerStr === ruleValue;
    case 'not_equals':
      return answerStr !== ruleValue;
    case 'contains':
      return answerStr.toLowerCase().includes(ruleValue.toLowerCase());
    case 'not_contains':
      return !answerStr.toLowerCase().includes(ruleValue.toLowerCase());
    case 'greater_than':
      return parseFloat(answerStr) > parseFloat(ruleValue);
    case 'less_than':
      return parseFloat(answerStr) < parseFloat(ruleValue);
    case 'is_empty':
      return answerStr === '' || answerStr === undefined;
    case 'is_not_empty':
      return answerStr !== '' && answerStr !== undefined;
    default:
      return false;
  }
}

/**
 * Evaluates a condition group (with nested groups) against the current answers.
 */
function evaluateGroup(group: ConditionGroup, answers: Record<string, any>, variables?: FormVariable[]): boolean {
  const items: { result: boolean; logic: 'and' | 'or' }[] = [];

  for (const rule of group.rules) {
    items.push({
      result: evaluateRule(rule, answers, variables),
      logic: rule.logicWithPrev || 'and',
    });
  }

  for (const sub of group.groups) {
    items.push({
      result: evaluateGroup(sub, answers, variables),
      logic: sub.logic || 'and',
    });
  }

  if (items.length === 0) return true;

  let combined = items[0].result;
  for (let i = 1; i < items.length; i++) {
    if (items[i].logic === 'and') {
      combined = combined && items[i].result;
    } else {
      combined = combined || items[i].result;
    }
  }

  return combined;
}

/**
 * Evaluates a condition branch.
 */
export function evaluateBranch(branch: ConditionBranch, answers: Record<string, any>, variables?: FormVariable[]): boolean {
  if (branch.conditionGroup) {
    return evaluateGroup(branch.conditionGroup, answers, variables);
  }
  // Legacy fallback
  if (branch.questionId && branch.operator) {
    return evaluateRule({
      id: '',
      questionId: branch.questionId,
      operator: branch.operator,
      value: branch.value || '',
    }, answers, variables);
  }
  return false;
}

/**
 * Given a condition node and the current answers, resolves which branch matches.
 * Returns the branch ID or 'default' if no branch matches.
 */
export function resolveConditionBranch(
  condition: ConditionNodeData,
  answers: Record<string, any>,
  variables?: FormVariable[],
): string {
  for (const branch of condition.branches) {
    if (evaluateBranch(branch, answers, variables)) {
      return branch.id;
    }
  }
  return 'default';
}

/**
 * Resolves the next node ID from a condition node by evaluating branches
 * and following the matching branch's edge.
 */
export function resolveConditionNextNode(
  conditionNodeId: string,
  condition: ConditionNodeData,
  answers: Record<string, any>,
  flowEdges: { source: string; sourceHandle?: string; target: string }[],
  variables?: FormVariable[],
): string | null {
  const matchedBranchId = resolveConditionBranch(condition, answers, variables);
  const handleId = `branch-${matchedBranchId}`;
  
  const edge = flowEdges.find(e =>
    e.source === conditionNodeId && e.sourceHandle === handleId
  );
  
  return edge?.target || null;
}
