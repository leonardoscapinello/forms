import { describe, expect, it } from 'vitest';
import type { FormData } from '@/types/form';
import { createDefaultPageElement } from '@/types/pageElements';
import { buildFieldNameMap, buildWebhookPayload } from './webhookPayload';

function createForm(elements: ReturnType<typeof createDefaultPageElement>[]): FormData {
  return {
    id: 'form-webhook',
    title: 'Webhook',
    questions: [],
    pages: [{ id: 'page-1', title: 'Página 1', elements }],
    style: { primaryColor: '#000000', backgroundColor: '#ffffff', fontFamily: 'Inter' },
    status: 'published',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    responseCount: 0,
    completionRate: 0,
  };
}

describe('webhook payload', () => {
  it('mantém nomes duplicados únicos e estáveis, inclusive dentro de colunas', () => {
    const first = createDefaultPageElement('input_text');
    first.fieldName = 'contato';
    const second = createDefaultPageElement('input_email');
    second.fieldName = 'contato';
    const columns = createDefaultPageElement('columns');
    columns.columnData![0].elements = [second];
    const form = createForm([first, columns]);

    expect(buildFieldNameMap(form)).toMatchObject({
      [first.id]: 'contato',
      [second.id]: 'contato_2',
    });

    // Answer insertion order must not decide which field keeps the base name.
    const { payload } = buildWebhookPayload({
      form,
      answers: {
        [second.id]: 'segundo@example.com',
        [first.id]: 'Primeiro',
      },
    });

    expect(payload.answers).toEqual({
      contato_2: 'segundo@example.com',
      contato: 'Primeiro',
    });
    expect(payload.fields.map((field: any) => field.field_name)).toEqual(['contato_2', 'contato']);
  });

  it('gera telefone internacional com apenas um sinal de mais', () => {
    const phone = createDefaultPageElement('input_phone');
    phone.fieldName = 'telefone';
    const form = createForm([phone]);

    const { payload, userData } = buildWebhookPayload({
      form,
      answers: {
        [phone.id]: { countryCode: 'BR', ddi: '+55', number: '(11) 98765-4321' },
      },
    });

    expect(payload.answers.telefone).toMatchObject({
      country_code: 'BR',
      ddi: '+55',
      number: '(11) 98765-4321',
      full_number: '+5511987654321',
    });
    expect(userData.phone).toBe('+5511987654321');
  });

  it('inclui somente variáveis configuradas e preserva tipos em todas as fontes', () => {
    const name = createDefaultPageElement('input_text');
    const address = createDefaultPageElement('input_address');
    const unanswered = createDefaultPageElement('input_text');
    const form = createForm([name, address, unanswered]);
    form.variables = [
      { id: 'var-name', name: 'nome', type: 'response', sourceElementId: name.id },
      { id: 'var-address', name: 'endereco', type: 'response', sourceElementId: address.id },
      { id: 'var-city', name: 'cidade', type: 'response', sourceElementId: `${address.id}.city` },
      {
        id: 'var-fallback',
        name: 'resposta_ausente',
        type: 'response',
        sourceElementId: unanswered.id,
        defaultValue: 'fallback',
      },
      { id: 'var-default', name: 'padrao', type: 'text', defaultValue: 'texto padrão' },
      { id: 'var-zero', name: 'zero', type: 'number', defaultValue: '10' },
      { id: 'var-false', name: 'negativo', type: 'boolean', defaultValue: 'true' },
      { id: 'var-empty', name: 'vazio', type: 'text', defaultValue: 'não usar' },
      { id: 'var-param', name: 'campanha', type: 'text', defaultValue: '{{param.utm_source}}' },
      { id: 'var-context', name: 'dispositivo', type: 'text', defaultValue: '{{ctx.device}}' },
      { id: 'var-dangerous', name: 'constructor', type: 'text', defaultValue: 'não vazar' },
    ];

    const addressValue = {
      country: 'BR',
      cep: '01310-100',
      street: 'Avenida Paulista',
      city: 'São Paulo',
      state: 'SP',
    };
    const { payload } = buildWebhookPayload({
      form,
      answers: {
        [name.id]: 'Leonardo',
        [address.id]: addressValue,
        __var_zero: 0,
        __var_negativo: false,
        __var_vazio: '',
        __var_admin: 'não configurada',
        __param_utm_source: 'meta',
        __ctx_device: 'mobile',
      },
    });

    expect(payload.variables).toEqual({
      nome: 'Leonardo',
      endereco: addressValue,
      cidade: 'São Paulo',
      resposta_ausente: 'fallback',
      padrao: 'texto padrão',
      zero: 0,
      negativo: false,
      vazio: '',
      campanha: 'meta',
      dispositivo: 'mobile',
    });
    expect(payload.variables).not.toHaveProperty('admin');
    expect(payload.variables).not.toHaveProperty('constructor');
  });
});
