import { ConditionGroup, ConditionRule, ConditionBranch, ConditionNodeData, FormVariable } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import {
  interpolateText,
  readAnswerValue,
  resolveConfiguredVariableValue,
  resolveInterpolationToken,
  stringifyInterpolationValue,
} from '@/lib/variableInterpolation';

/** Option-based field types where the stored answer is an option ID, not the label */
const OPTION_FIELD_TYPES = new Set([
  'input_select', 'input_radio', 'input_quiz_icon', 'input_quiz_image', 'input_multi_select',
]);

/**
 * Given an element and the raw answer value (option ID), resolves the human-readable label.
 * For multi_select, resolves each ID in the array to its label.
 * Returns the original value unchanged if no resolution is possible.
 */
function resolveOptionLabel(element: PageElement | undefined, rawValue: any): string {
  if (!element || !rawValue) return stringifyInterpolationValue(rawValue);

  if (!OPTION_FIELD_TYPES.has(element.type)) {
    return stringifyInterpolationValue(rawValue);
  }

  const options = element.options || [];

  // multi_select: array of IDs → joined labels
  if (element.type === 'input_multi_select' && Array.isArray(rawValue)) {
    return rawValue.map(id => {
      const opt = options.find(o => o.id === id);
      return opt ? opt.label : String(id);
    }).join(', ');
  }

  // Single-select: ID → label
  const opt = options.find(o => o.id === rawValue);
  return opt ? opt.label : String(rawValue);
}

/**
 * Resolves the subject value for a rule — either a question answer, variable value, or webhook response field.
 * When `allElements` is provided and the answer is an option ID, the label is also resolved for comparison.
 */
function resolveSubjectValue(
  rule: ConditionRule,
  answers: Record<string, any>,
  variables?: FormVariable[],
  allElements?: PageElement[],
): { raw: string; label: string } {
  if (rule.subjectType === 'context' && rule.contextKey) {
    const val = readAnswerValue(answers, `__ctx_${rule.contextKey}`);
    const s = stringifyInterpolationValue(val);
    return { raw: s, label: s };
  }
  if (rule.subjectType === 'param' && rule.paramKey) {
    const val = readAnswerValue(answers, `__param_${rule.paramKey}`);
    const s = stringifyInterpolationValue(val);
    return { raw: s, label: s };
  }
  if (rule.subjectType === 'webhook_response' && rule.webhookNodeId && rule.webhookResponsePath) {
    const val = resolveInterpolationToken(
      `webhook:${rule.webhookNodeId}:${rule.webhookResponsePath}`,
      variables || [],
      answers,
    ).value;
    const s = stringifyInterpolationValue(val);
    return { raw: s, label: s };
  }
  if (rule.subjectType === 'variable' && rule.variableId && variables) {
    const variable = variables.find(v => v.id === rule.variableId);
    if (variable) {
      const val = resolveConfiguredVariableValue(variable, variables, answers);
      const s = stringifyInterpolationValue(val);
      return { raw: s, label: s };
    }
    return { raw: '', label: '' };
  }
  // Default: question answer
  const answer = answers[rule.questionId];
  const rawStr = stringifyInterpolationValue(answer);

  // Resolve option label if element info is available
  const element = allElements?.find(el => el.id === rule.questionId);
  const labelStr = element ? resolveOptionLabel(element, answer) : rawStr;

  return { raw: rawStr, label: labelStr };
}

/**
 * Evaluates a single condition rule against the current answers.
 * Compares against BOTH the raw answer (option ID) and the resolved label,
 * so conditions work whether the user typed the label or the ID.
 */
function evaluateRule(
  rule: ConditionRule,
  answers: Record<string, any>,
  variables?: FormVariable[],
  allElements?: PageElement[],
): boolean {
  const { raw: rawStr, label: labelStr } = resolveSubjectValue(rule, answers, variables, allElements);
  const ruleValue = interpolateText(rule.value ?? '', variables || [], answers);

  // Helper: check match against both raw and label
  const matchAny = (check: (val: string) => boolean): boolean => {
    return check(rawStr) || (labelStr !== rawStr && check(labelStr));
  };

  switch (rule.operator) {
    case 'equals':
      return matchAny(v => v === ruleValue);
    case 'not_equals':
      // not_equals: both raw AND label must differ
      return rawStr !== ruleValue && labelStr !== ruleValue;
    case 'contains':
      return matchAny(v => v.toLowerCase().includes(ruleValue.toLowerCase()));
    case 'not_contains':
      return !rawStr.toLowerCase().includes(ruleValue.toLowerCase()) &&
             !labelStr.toLowerCase().includes(ruleValue.toLowerCase());
    case 'greater_than':
      return parseFloat(rawStr) > parseFloat(ruleValue);
    case 'less_than':
      return parseFloat(rawStr) < parseFloat(ruleValue);
    case 'is_empty':
      return rawStr === '' || rawStr === undefined;
    case 'is_not_empty':
      return rawStr !== '' && rawStr !== undefined;
    default:
      return false;
  }
}

/**
 * Evaluates a condition group (with nested groups) against the current answers.
 */
function evaluateGroup(
  group: ConditionGroup,
  answers: Record<string, any>,
  variables?: FormVariable[],
  allElements?: PageElement[],
): boolean {
  const items: { result: boolean; logic: 'and' | 'or' }[] = [];

  for (const rule of group.rules) {
    items.push({
      result: evaluateRule(rule, answers, variables, allElements),
      logic: rule.logicWithPrev || 'and',
    });
  }

  for (const sub of group.groups) {
    items.push({
      result: evaluateGroup(sub, answers, variables, allElements),
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
export function evaluateBranch(
  branch: ConditionBranch,
  answers: Record<string, any>,
  variables?: FormVariable[],
  allElements?: PageElement[],
): boolean {
  if (branch.conditionGroup) {
    return evaluateGroup(branch.conditionGroup, answers, variables, allElements);
  }
  // Legacy fallback
  if (branch.questionId && branch.operator) {
    return evaluateRule({
      id: '',
      questionId: branch.questionId,
      operator: branch.operator,
      value: branch.value || '',
    }, answers, variables, allElements);
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
  allElements?: PageElement[],
): string {
  for (const branch of condition.branches) {
    if (evaluateBranch(branch, answers, variables, allElements)) {
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
  allElements?: PageElement[],
): string | null {
  const matchedBranchId = resolveConditionBranch(condition, answers, variables, allElements);
  const handleId = `branch-${matchedBranchId}`;
  
  const edge = flowEdges.find(e =>
    e.source === conditionNodeId && e.sourceHandle === handleId
  );
  
  return edge?.target || null;
}
