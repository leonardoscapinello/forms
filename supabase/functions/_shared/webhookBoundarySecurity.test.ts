import {
  collectAllowedWebhookResponsePaths,
  parseWebhookResponsePath,
  projectWebhookResponse,
} from './webhookResponseProjection.ts';
import { buildAuthoritativeWebhookPayload } from './webhookRequestPayload.ts';

function assert(condition: unknown, message = 'assertion_failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`expected ${right}, received ${left}`);
}

Deno.test('webhook response allowlist only includes persisted consumers downstream', () => {
  const form = {
    integrationNodes: [{
      id: 'hook',
      responseMappings: [
        { responsePath: 'lead.id' },
        { responsePath: 'constructor.secret' },
      ],
      responseFields: ['private.token'],
      lastTestResponse: { token: '{{webhook:hook:sample.secret}}' },
    }],
    conditions: [{
      branches: [{
        conditionGroup: {
          rules: [{
            subjectType: 'webhook_response',
            webhookNodeId: 'hook',
            webhookResponsePath: 'lead.status',
          }],
          groups: [],
        },
      }],
    }],
    pages: [
      { id: 'after', elements: [{ text: '{{webhook:hook:items[0].name}}' }] },
      { id: 'before', elements: [{ text: '{{webhook:hook:upstream.secret}}' }] },
    ],
    flowEdges: [
      { source: 'p-before', target: 'int-hook' },
      { source: 'int-hook', target: 'p-after' },
    ],
  };
  assertEquals(collectAllowedWebhookResponsePaths(form, 'hook'), [
    'lead.id',
    'lead.status',
    'items[0].name',
  ]);
});

Deno.test('webhook response projection preserves nested paths without leaking siblings', () => {
  const projected = projectWebhookResponse({
    lead: { id: 'lead-1', email: 'private@example.com' },
    items: [{ name: 'First', secret: 'hidden' }],
    access_token: 'hidden',
  }, ['lead.id', 'items[0].name']);
  assertEquals(projected, {
    lead: { id: 'lead-1' },
    items: [{ name: 'First' }],
  });
  assert(parseWebhookResponsePath('__proto__.polluted') === null);
  assertEquals(projectWebhookResponse({ secret: 'hidden' }, []), {});
});

Deno.test('public webhook body ignores forged structure and filters values by form ids', () => {
  const payload = buildAuthoritativeWebhookPayload({
    formData: {
      title: 'Official',
      status: 'published',
      pages: [{ elements: [{ id: 'field-1', type: 'input_text', fieldName: 'name' }] }],
      variables: [{ id: 'var-1', name: 'score' }],
    },
    formId: 'form-1',
    responseId: 'response-1',
    clientPayload: {
      event: { form_id: 'forged', id: 'forged' },
      answers_raw: { 'field-1': 'Leo', unknown: 'drop' },
      answers: { name: 'forged' },
      variables: { score: 10, admin: true },
      meta: { forged: true },
      arbitrary: true,
    },
    configuredMeta: { source: 'persisted-node' },
    nowMs: Date.parse('2026-08-11T12:00:00.000Z'),
  });
  assertEquals(payload.answers_raw, { 'field-1': 'Leo' });
  assertEquals(payload.answers, { name: 'Leo' });
  assertEquals(payload.variables, { score: 10 });
  assertEquals(payload.meta, { source: 'persisted-node' });
  assertEquals((payload.event as Record<string, unknown>).form_id, 'form-1');
  assert(!Object.prototype.hasOwnProperty.call(payload, 'arbitrary'));
});

Deno.test('public webhook variables are canonically resolved and configuration-allowlisted', () => {
  const address = { street: 'Paulista', city: 'São Paulo', state: 'SP' };
  const payload = buildAuthoritativeWebhookPayload({
    formData: {
      pages: [{ elements: [
        { id: 'name-id', type: 'input_text' },
        { id: 'address-id', type: 'input_address' },
        { id: 'missing-id', type: 'input_text' },
      ] }],
      variables: [
        { id: 'name-var', name: 'name', type: 'response', sourceElementId: 'name-id' },
        { id: 'address-var', name: 'address', type: 'response', sourceElementId: 'address-id' },
        { id: 'city-var', name: 'city', type: 'response', sourceElementId: 'address-id.city' },
        {
          id: 'missing-var',
          name: 'missing',
          type: 'response',
          sourceElementId: 'missing-id',
          defaultValue: 'fallback',
        },
        { id: 'default-var', name: 'defaulted', type: 'text', defaultValue: 'persisted' },
        { id: 'zero-var', name: 'zero', type: 'number', defaultValue: '10' },
        { id: 'false-var', name: 'disabled', type: 'boolean', defaultValue: 'true' },
        { id: 'empty-var', name: 'empty', type: 'text', defaultValue: 'fallback' },
        { id: 'param-var', name: 'campaign', type: 'text', defaultValue: '{{param.utm}}' },
        { id: 'context-var', name: 'device', type: 'text', defaultValue: '{{ctx.device}}' },
      ],
    },
    formId: 'form-variables',
    clientPayload: {
      answers_raw: { 'name-id': 'Leonardo', 'address-id': address },
      variables: { name: 'forged', defaulted: 'forged', admin: true },
    },
    fallbackAnswers: {
      __var_zero: 0,
      __var_disabled: false,
      __var_empty: '',
      __var_admin: 'drop',
      __ctx_device: 'mobile',
    },
    queryParams: { utm: 'meta' },
  });
  assertEquals(payload.variables, {
    name: 'Leonardo',
    address,
    city: 'São Paulo',
    missing: 'fallback',
    defaulted: 'persisted',
    zero: 0,
    disabled: false,
    empty: '',
    campaign: 'meta',
    device: 'mobile',
  });
});
