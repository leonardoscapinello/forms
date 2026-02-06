import { ConditionGroup, ConditionRule, ConditionBranch, ConditionNodeData, FormData } from '@/types/form';

/**
 * Evaluates a single condition rule against the current answers.
 */
function evaluateRule(rule: ConditionRule, answers: Record<string, any>): boolean {
  const answer = answers[rule.questionId];
  const answerStr = answer !== undefined && answer !== null ? String(answer) : '';
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
      return answerStr === '' || answer === undefined || answer === null || (Array.isArray(answer) && answer.length === 0);
    case 'is_not_empty':
      return answerStr !== '' && answer !== undefined && answer !== null && !(Array.isArray(answer) && answer.length === 0);
    default:
      return false;
  }
}

/**
 * Evaluates a condition group (with nested groups) against the current answers.
 */
function evaluateGroup(group: ConditionGroup, answers: Record<string, any>): boolean {
  // Build results from rules
  const items: { result: boolean; logic: 'and' | 'or' }[] = [];

  for (const rule of group.rules) {
    items.push({
      result: evaluateRule(rule, answers),
      logic: rule.logicWithPrev || 'and',
    });
  }

  // Add nested groups
  for (const sub of group.groups) {
    items.push({
      result: evaluateGroup(sub, answers),
      logic: sub.logic || 'and',
    });
  }

  if (items.length === 0) return true;

  // Combine items: first item's result starts, then apply logic
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
export function evaluateBranch(branch: ConditionBranch, answers: Record<string, any>): boolean {
  if (branch.conditionGroup) {
    return evaluateGroup(branch.conditionGroup, answers);
  }
  // Legacy fallback
  if (branch.questionId && branch.operator) {
    return evaluateRule({
      id: '',
      questionId: branch.questionId,
      operator: branch.operator,
      value: branch.value || '',
    }, answers);
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
): string {
  for (const branch of condition.branches) {
    if (evaluateBranch(branch, answers)) {
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
): string | null {
  const matchedBranchId = resolveConditionBranch(condition, answers);
  const handleId = `branch-${matchedBranchId}`;
  
  const edge = flowEdges.find(e =>
    e.source === conditionNodeId && e.sourceHandle === handleId
  );
  
  return edge?.target || null;
}
