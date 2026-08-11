import { describe, expect, it } from 'vitest';
import {
  collectAllowedWebhookResponsePaths,
  parseWebhookResponsePath,
  projectWebhookResponse,
} from '../../supabase/functions/_shared/webhookResponseProjection';
import { buildAuthoritativeWebhookPayload } from '../../supabase/functions/_shared/webhookRequestPayload';

describe('webhook response projection boundary', () => {
  it('derives a minimal allowlist from persisted mappings, conditions and downstream tokens', () => {
    const form = {
      integrationNodes: [
        {
          id: 'hook-1',
          platform: 'webhook',
          responseMappings: [
            { responsePath: 'data.lead.id' },
            { responsePath: '__proto__.polluted' },
          ],
          responseFields: ['entire.private.payload'],
          lastTestResponse: { text: '{{webhook:hook-1:test.sample.secret}}' },
        },
        {
          id: 'hook-2',
          platform: 'webhook',
          webhookBodyParams: [
            { value: '{{webhook:hook-1:result.code}}' },
          ],
          lastTestResponse: { token: '{{webhook:hook-1:sample.must_not_leak}}' },
        },
      ],
      conditions: [{
        id: 'condition-1',
        branches: [{
          conditionGroup: {
            rules: [],
            groups: [{
              rules: [{
                subjectType: 'webhook_response',
                webhookNodeId: 'hook-1',
                webhookResponsePath: 'account.status',
              }, {
                subjectType: 'webhook_response',
                webhookNodeId: 'hook-2',
                webhookResponsePath: 'other.secret',
              }],
              groups: [],
            }],
          },
        }],
      }],
      pages: [
        {
          id: 'downstream',
          elements: [{ text: 'Olá {{webhook:hook-1:items[0].name}}' }],
        },
        {
          id: 'upstream',
          elements: [{ text: '{{webhook:hook-1:unreachable.secret}}' }],
        },
      ],
      flowEdges: [
        { source: 'p-upstream', target: 'int-hook-1' },
        { source: 'int-hook-1', target: 'p-downstream' },
        { source: 'p-downstream', target: 'int-hook-2' },
        { source: 'int-hook-2', target: 'end' },
      ],
      thankYouDescription: '{{webhook:hook-1:completion.message}}',
    };

    expect(collectAllowedWebhookResponsePaths(form, 'hook-1')).toEqual([
      'data.lead.id',
      'account.status',
      'items[0].name',
      'result.code',
      'completion.message',
    ]);
  });

  it('keeps the nested client contract while omitting every unrequested field', () => {
    const upstream = {
      data: { lead: { id: 'lead-1', email: 'private@example.com' } },
      items: [{ name: 'Primeiro', secret: 'hidden' }, { name: 'Segundo' }],
      bearerToken: 'must-not-cross-the-boundary',
    };

    expect(projectWebhookResponse(upstream, [
      'data.lead.id',
      'items[0].name',
    ])).toEqual({
      data: { lead: { id: 'lead-1' } },
      items: [{ name: 'Primeiro' }],
    });
    expect(projectWebhookResponse(
      [{ id: 'root-array-id', secret: 'hidden' }],
      ['[0].id'],
    )).toEqual([{ id: 'root-array-id' }]);
  });

  it('rejects dangerous paths and strips dangerous keys inside an allowed subtree', () => {
    expect(parseWebhookResponsePath('__proto__.polluted')).toBeNull();
    expect(parseWebhookResponsePath('data.constructor.secret')).toBeNull();
    expect(parseWebhookResponsePath('items[50].id')).toBeNull();

    const upstream = JSON.parse(
      '{"data":{"safe":"yes","__proto__":{"polluted":true},"constructor":"secret"}}',
    );
    expect(projectWebhookResponse(upstream, ['data'])).toEqual({
      data: { safe: 'yes' },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('returns an empty object without an allowlist and rejects oversized selected values', () => {
    expect(projectWebhookResponse({ secret: 'never returned' }, [])).toEqual({});
    expect(() => projectWebhookResponse(
      { selected: 'x'.repeat(16_385) },
      ['selected'],
    )).toThrowError('webhook_response_string_too_large');
    expect(() => projectWebhookResponse(
      { selected: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`k${index}`, index])) },
      ['selected'],
    )).toThrowError('webhook_response_object_too_large');
  });
});

describe('authoritative public webhook request body', () => {
  it('rebuilds identity and field data from the persisted form allowlist', () => {
    const maliciousRaw = JSON.parse(
      '{"name-id":"Leonardo","choice-id":"option-1","unknown":"exfiltrate","__proto__":{"polluted":true}}',
    );
    const payload = buildAuthoritativeWebhookPayload({
      formData: {
        title: 'Formulário oficial',
        status: 'published',
        pages: [{
          id: 'page-1',
          elements: [{
            id: 'name-id',
            type: 'input_text',
            fieldName: 'name',
            label: 'Nome',
          }, {
            id: 'choice-id',
            type: 'input_select',
            fieldName: 'choice',
            options: [{ id: 'option-1', label: 'Opção oficial' }],
          }],
        }],
        variables: [{ id: 'variable-1', name: 'score' }],
      },
      formId: 'form-authoritative',
      responseId: 'response-authoritative',
      eventId: 'client-event',
      clientPayload: {
        event: { id: 'forged', form_id: 'victim', landed_at: '2026-08-11T12:00:00.000Z' },
        respondent: { ip: 'forged-ip' },
        answers: { name: 'forged typed answer' },
        answers_raw: maliciousRaw,
        variables: { score: 9, admin: true },
        fields: [{ field_id: 'forged' }],
        meta: { Authorization: 'attacker' },
        webhookUrl: 'https://attacker.example',
        arbitrary: 'must disappear',
      },
      queryParams: { utm_source: 'campaign' },
      configuredMeta: { tenant: 'persisted-config' },
      sourceUrl: 'https://forms.example/f/form-authoritative',
      requestIp: '203.0.113.10',
      requestUserAgent: 'Server-observed UA',
      nowMs: Date.parse('2026-08-11T12:01:00.000Z'),
    });

    expect(payload.event).toMatchObject({
      id: 'response-authoritative',
      form_id: 'form-authoritative',
      form_name: 'Formulário oficial',
    });
    expect(payload.respondent).toEqual({
      ip: '203.0.113.10',
      user_agent: 'Server-observed UA',
      geolocation: null,
    });
    expect(payload.answers_raw).toEqual({
      'name-id': 'Leonardo',
      'choice-id': 'option-1',
    });
    expect(payload.answers).toEqual({
      name: 'Leonardo',
      choice: { id: 'option-1', label: 'Opção oficial' },
    });
    expect(payload.variables).toEqual({ score: 9 });
    expect(payload.meta).toEqual({ tenant: 'persisted-config' });
    expect(payload.fields).toEqual([
      expect.objectContaining({ field_id: 'name-id', answer: 'Leonardo' }),
      expect.objectContaining({
        field_id: 'choice-id',
        answer: { id: 'option-1', label: 'Opção oficial' },
      }),
    ]);
    expect(payload).not.toHaveProperty('arbitrary');
    expect(payload).not.toHaveProperty('webhookUrl');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('fails closed when an allowed answer exceeds the payload limits', () => {
    expect(() => buildAuthoritativeWebhookPayload({
      formData: {
        pages: [{ elements: [{ id: 'answer-id', type: 'input_text' }] }],
      },
      formId: 'form-1',
      clientPayload: {
        answers_raw: { 'answer-id': 'x'.repeat(50_001) },
      },
    })).toThrowError('webhook_payload_string_too_large');
  });

  it('recalcula todas as variáveis configuradas sem aceitar campos informativos forjados', () => {
    const address = {
      country: 'BR',
      cep: '01310-100',
      street: 'Avenida Paulista',
      city: 'São Paulo',
      state: 'SP',
    };
    const payload = buildAuthoritativeWebhookPayload({
      formData: {
        pages: [{ elements: [{
          id: 'name-id',
          type: 'input_text',
        }, {
          id: 'address-id',
          type: 'input_address',
        }, {
          id: 'unanswered-id',
          type: 'input_text',
        }] }],
        variables: [
          { id: 'name-var', name: 'name', type: 'response', sourceElementId: 'name-id' },
          { id: 'address-var', name: 'address', type: 'response', sourceElementId: 'address-id' },
          { id: 'city-var', name: 'city', type: 'response', sourceElementId: 'address-id.city' },
          {
            id: 'missing-var',
            name: 'missing',
            type: 'response',
            sourceElementId: 'unanswered-id',
            defaultValue: 'fallback',
          },
          { id: 'default-var', name: 'defaulted', type: 'text', defaultValue: 'persisted' },
          { id: 'zero-var', name: 'zero', type: 'number', defaultValue: '10' },
          { id: 'false-var', name: 'disabled', type: 'boolean', defaultValue: 'true' },
          { id: 'empty-var', name: 'empty', type: 'text', defaultValue: 'fallback' },
          { id: 'param-var', name: 'campaign', type: 'text', defaultValue: '{{param.utm_source}}' },
          { id: 'context-var', name: 'device', type: 'text', defaultValue: '{{ctx.device}}' },
          { id: 'dangerous-var', name: 'constructor', type: 'text', defaultValue: 'drop' },
        ],
      },
      formId: 'form-variables',
      clientPayload: {
        answers_raw: { 'name-id': 'Leonardo', 'address-id': address },
        variables: {
          name: 'forged',
          city: 'forged',
          defaulted: 'forged',
          admin: 'not-allowlisted',
        },
      },
      fallbackAnswers: {
        __var_zero: 0,
        __var_disabled: false,
        __var_empty: '',
        __var_admin: 'not-allowlisted',
        __ctx_device: 'mobile',
      },
      queryParams: { utm_source: 'meta' },
    });

    expect(payload.variables).toEqual({
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
    expect(payload.variables).not.toHaveProperty('admin');
    expect(payload.variables).not.toHaveProperty('constructor');
  });
});
