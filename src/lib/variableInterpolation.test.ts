import { describe, expect, it } from 'vitest';
import type { FormVariable } from '@/types/form';
import {
  interpolateText,
  interpolateTextToHtml,
  readAnswerValue,
  resolveConfiguredVariableValue,
  resolveTemplateValue,
  resolveVariableValues,
  stringifyInterpolationValue,
} from './variableInterpolation';

const variables: FormVariable[] = [
  { id: 'var-first', name: 'primeiro', type: 'text', defaultValue: '{{segundo}}' },
  { id: 'var-second', name: 'segundo', type: 'text', defaultValue: '{{param.campaign}}' },
  { id: 'var-lead-city', name: 'cidade_lead', type: 'response', sourceElementId: 'address.city' },
];

describe('variable interpolation contract', () => {
  it('resolves variables by name/id, fields, GET params, context and webhook bracket paths', () => {
    const answers = {
      address: { city: 'São Paulo', street: 'Paulista', number: '1000' },
      __param_campaign: 'lançamento',
      __ctx_device: 'mobile',
      __webhook_hook: { items: [{ code: 'approved' }] },
    };

    expect(interpolateText(
      '{{primeiro}}|{{var-second}}|{{cidade_lead}}|{{field:address.city}}|{{param.campaign}}|{{ctx.device}}|{{webhook:hook:items[0].code}}',
      variables,
      answers,
    )).toBe('lançamento|lançamento|São Paulo|São Paulo|lançamento|mobile|approved');
  });

  it('gives explicit runtime overrides precedence, including false, zero and compound objects', () => {
    const vars: FormVariable[] = [
      { id: 'a', name: 'active', type: 'boolean', defaultValue: 'true' },
      { id: 'n', name: 'count', type: 'number', defaultValue: '10' },
      { id: 'p', name: 'phone', type: 'text', defaultValue: '' },
    ];
    const answers = {
      __var_active: false,
      __var_count: 0,
      __var_phone: { ddi: '+55', number: '(11) 99999-0000' },
    };

    expect(interpolateText('{{active}}/{{count}}/{{phone}}', vars, answers))
      .toBe('false/0/+5511999990000');
    expect(resolveVariableValues(vars, answers)).toEqual({
      active: 'false',
      count: '0',
      phone: '+5511999990000',
    });
  });

  it('preserves the original type for an exact token and produces readable mixed text', () => {
    const answers = { phone: { countryCode: 'BR', ddi: '+55', number: '11999990000' } };
    expect(resolveTemplateValue('{{field:phone}}', [], answers)).toBe(answers.phone);
    expect(interpolateText('Telefone: {{field:phone}}', [], answers)).toBe('Telefone: +5511999990000');
    expect(stringifyInterpolationValue({ nested: true })).toBe('{"nested":true}');
  });

  it('reads compound response sources from objects or an exact flattened key', () => {
    expect(readAnswerValue({ address: { city: 'Recife' } }, 'address.city')).toBe('Recife');
    expect(readAnswerValue({ 'address.city': 'Curitiba', address: { city: 'Recife' } }, 'address.city'))
      .toBe('Curitiba');
    expect(resolveConfiguredVariableValue(variables[2], variables, { address: { city: 'Recife' } }))
      .toBe('Recife');
  });

  it('blocks prototype-pollution path segments in every nested source', () => {
    const answers = {
      address: { city: 'Recife' },
      __webhook_hook: { safe: { value: 'ok' } },
    };
    expect(readAnswerValue(answers, 'address.__proto__.polluted')).toBeUndefined();
    expect(interpolateText(
      '{{field:address.constructor.name}}/{{webhook:hook:safe.__proto__.polluted}}',
      [],
      answers,
    )).toBe('/');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('resolves recursive defaults independent of declaration order and terminates cycles safely', () => {
    expect(interpolateText('{{primeiro}}', variables, { __param_campaign: 'meta' })).toBe('meta');

    const cyclic: FormVariable[] = [
      { id: 'a', name: 'a', type: 'text', defaultValue: '{{b}}' },
      { id: 'b', name: 'b', type: 'text', defaultValue: '{{a}}' },
    ];
    expect(interpolateText('{{a}}/{{b}}', cyclic, {})).toBe('/');
  });

  it('keeps unknown plain-text tokens visible but removes them from sanitized rich text', () => {
    expect(interpolateText('valor={{nao_configurada}}', [], {})).toBe('valor={{nao_configurada}}');
    expect(interpolateTextToHtml('<strong>{{nao_configurada}}</strong>', [], {})).toBe('<strong></strong>');
  });

  it('escapes every supported runtime source in rich HTML', () => {
    expect(interpolateTextToHtml(
      '<p>{{field:name}} {{param.campaign}} {{ctx.device}} {{webhook:hook:value}}</p>',
      [],
      {
        name: '<img src=x onerror=alert(1)>',
        __param_campaign: '<script>param</script>',
        __ctx_device: '<b>mobile</b>',
        __webhook_hook: { value: '<svg onload=alert(1)>' },
      },
    )).toBe(
      '<p>&lt;img src=x onerror=alert(1)&gt; &lt;script&gt;param&lt;/script&gt; &lt;b&gt;mobile&lt;/b&gt; &lt;svg onload=alert(1)&gt;</p>',
    );
  });
});
