import { describe, expect, it } from 'vitest';
import type { ConditionNodeData, FormVariable } from '@/types/form';
import { resolveConditionBranch } from './conditionEvaluator';

function condition(subject: Record<string, unknown>, value: string): ConditionNodeData {
  return {
    id: 'condition',
    label: 'Condição',
    branches: [{
      id: 'match',
      label: 'Corresponde',
      conditionGroup: {
        id: 'group',
        logic: 'and',
        groups: [],
        rules: [{
          id: 'rule',
          questionId: '',
          operator: 'equals',
          value,
          ...subject,
        }],
      },
    }],
  } as ConditionNodeData;
}

describe('condition variable resolution', () => {
  it('uses recursive defaults and explicit __var_ overrides in variable subjects', () => {
    const variables: FormVariable[] = [
      { id: 'expected', name: 'expected', type: 'text', defaultValue: '{{param.target}}' },
      { id: 'actual', name: 'actual', type: 'response', sourceElementId: 'address.city' },
    ];
    const node = condition({ subjectType: 'variable', variableId: 'actual' }, '{{expected}}');

    expect(resolveConditionBranch(node, {
      address: { city: 'Recife' },
      __param_target: 'Recife',
    }, variables)).toBe('match');
    expect(resolveConditionBranch(node, {
      address: { city: 'Recife' },
      __param_target: 'Recife',
      __var_actual: 'Fortaleza',
    }, variables)).toBe('default');
  });

  it('compares webhook bracket paths and blocks prototype traversal', () => {
    expect(resolveConditionBranch(condition({
      subjectType: 'webhook_response',
      webhookNodeId: 'hook',
      webhookResponsePath: 'items[0].status',
    }, 'approved'), {
      __webhook_hook: { items: [{ status: 'approved' }] },
    }, [])).toBe('match');

    expect(resolveConditionBranch(condition({
      subjectType: 'webhook_response',
      webhookNodeId: 'hook',
      webhookResponsePath: '__proto__.polluted',
    }, 'yes'), {
      __webhook_hook: {},
    }, [])).toBe('default');
  });
});
