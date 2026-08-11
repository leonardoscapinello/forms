import { describe, expect, it } from 'vitest';
import { resolveConditionBranch } from './conditionEvaluator';
import { interpolateText } from './variableInterpolation';
import { applyWebhookResponse } from './workflowAnswers';

describe('webhook workflow answers', () => {
  it('keeps the complete response available to conditions, tokens and mappings', () => {
    const variables = [{ id: 'token-variable', name: 'token', type: 'text' as const }];
    const response = { data: { status: 'approved', token: 'abc-123' } };
    const answers = applyWebhookResponse(
      {},
      'webhook-node',
      response,
      [{ id: 'mapping', responsePath: 'data.token', variableId: 'token-variable' }],
      variables,
    );

    expect(answers['__webhook_webhook-node']).toBe(response);
    expect(answers.__var_token).toBe('abc-123');
    expect(interpolateText('{{webhook:webhook-node:data.token}}', variables, answers)).toBe('abc-123');
    expect(resolveConditionBranch({
      id: 'condition',
      label: 'Webhook response',
      branches: [{
        id: 'approved',
        label: 'Aprovado',
        conditionGroup: {
          id: 'group',
          logic: 'and',
          groups: [],
          rules: [{
            id: 'rule',
            subjectType: 'webhook_response',
            questionId: '',
            webhookNodeId: 'webhook-node',
            webhookResponsePath: 'data.status',
            operator: 'equals',
            value: 'approved',
          }],
        },
      }],
    }, answers, variables)).toBe('approved');
  });
});
