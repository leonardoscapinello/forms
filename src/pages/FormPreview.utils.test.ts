import { describe, expect, it } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import type { FormData } from '@/types/form';
import {
  applyElementVariableBinding,
  applyPageVariableAssignments,
  buildDefaults,
  flattenPageElements,
  getRequiredFieldErrors,
  hasUnansweredInputFields,
  mergeLateContextDefaults,
  resolveUserData,
} from './FormPreview.utils';

function createForm(elements: ReturnType<typeof createDefaultPageElement>[]): FormData {
  return {
    id: 'form-1',
    title: 'Formulário de teste',
    questions: [],
    pages: [{ id: 'page-1', title: 'Página 1', elements }],
    style: { primaryColor: '#000000', backgroundColor: '#ffffff', fontFamily: 'Inter' },
    status: 'draft',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    responseCount: 0,
    completionRate: 0,
  };
}

function createNestedColumns() {
  const outer = createDefaultPageElement('columns');
  const inner = createDefaultPageElement('columns');
  const requiredText = createDefaultPageElement('input_text');
  requiredText.required = true;
  requiredText.requiredMessage = 'Nome obrigatório';
  inner.columnData![0].elements = [requiredText];
  outer.columnData![0].elements = [inner];
  return { outer, inner, requiredText };
}

describe('nested page elements', () => {
  it('flattens arbitrarily nested column elements', () => {
    const { outer, inner, requiredText } = createNestedColumns();
    expect(flattenPageElements([outer]).map((element) => element.id)).toEqual([
      outer.id,
      inner.id,
      requiredText.id,
    ]);
  });

  it('validates required fields nested in columns', () => {
    const { outer, requiredText } = createNestedColumns();
    expect(getRequiredFieldErrors([outer], {})).toEqual({
      [requiredText.id]: 'Nome obrigatório',
    });
    expect(getRequiredFieldErrors([outer], { [requiredText.id]: 'Leonardo' })).toEqual({});
  });

  it('does not accept empty compound field shells as required answers', () => {
    const phone = createDefaultPageElement('input_phone');
    phone.required = true;
    const document = createDefaultPageElement('input_document');
    document.required = true;

    expect(getRequiredFieldErrors([phone, document], {
      [phone.id]: { countryCode: 'BR', ddi: '+55', number: '' },
      [document.id]: { documentType: 'cpf', value: '' },
    })).toEqual({
      [phone.id]: 'Preencha este campo',
      [document.id]: 'Preencha este campo',
    });
  });

  it('keeps e-mail and phone format errors active until their values are complete', () => {
    const email = createDefaultPageElement('input_email');
    const phone = createDefaultPageElement('input_phone');

    expect(getRequiredFieldErrors([email, phone], {
      [email.id]: 'sem-arroba',
      [phone.id]: { countryCode: 'BR', ddi: '+55', number: '(11) 9876' },
    })).toEqual({
      [email.id]: 'Formato de e-mail inválido',
      [phone.id]: 'Preencha todos os 11 dígitos do telefone',
    });

    expect(getRequiredFieldErrors([email, phone], {
      [email.id]: 'lead@example.com',
      [phone.id]: { countryCode: 'BR', ddi: '+55', number: '(11) 98765-4321' },
    })).toEqual({});
  });

  it('blocks invalid CPF values and accepts a valid one', () => {
    const document = createDefaultPageElement('input_document');
    document.required = true;
    expect(getRequiredFieldErrors([document], {
      [document.id]: { documentType: 'cpf', value: '111.111.111-11' },
    })[document.id]).toBe('Documento inválido');
    expect(getRequiredFieldErrors([document], {
      [document.id]: { documentType: 'cpf', value: '529.982.247-25' },
    })).toEqual({});
  });

  it('bloqueia CNPJ com 14 dígitos quando os dígitos verificadores são inválidos', () => {
    const company = createDefaultPageElement('input_company');
    company.required = true;

    expect(getRequiredFieldErrors([company], {
      [company.id]: { cnpj: '11.111.111/1111-11' },
    })).toEqual({
      [company.id]: 'CNPJ inválido',
    });
    expect(getRequiredFieldErrors([company], {
      [company.id]: { cnpj: '04.252.011/0001-10' },
    })).toEqual({});
  });

  it('normaliza defaults para os formatos emitidos pelos campos públicos', () => {
    const height = createDefaultPageElement('input_height');
    const phone = createDefaultPageElement('input_phone');
    phone.defaultValue = '{{telefone_padrao}}';
    const select = createDefaultPageElement('input_select');
    select.options = [
      { id: 'choice-a', label: 'Opção A' },
      { id: 'choice-b', label: 'Opção B' },
    ];
    select.defaultValue = 'Opção B';
    const multi = createDefaultPageElement('input_multi_select');
    multi.options = select.options;
    multi.defaultValue = 'Opção A, choice-b, inexistente';
    const company = createDefaultPageElement('input_company');
    company.defaultValue = '04.252.011/0001-10';

    const form = createForm([height, phone, select, multi, company]);
    form.variables = [{ id: 'var-phone', name: 'telefone_padrao', type: 'text', defaultValue: '+5511987654321' }];

    expect(buildDefaults(form)).toMatchObject({
      __var_telefone_padrao: '+5511987654321',
      [height.id]: { value: 170, unit: 'cm' },
      [phone.id]: { countryCode: 'BR', ddi: '+55', number: '(11) 98765-4321' },
      [select.id]: 'choice-b',
      [multi.id]: ['choice-a', 'choice-b'],
      [company.id]: { cnpj: '04.252.011/0001-10' },
    });
  });

  it('descarta defaults incompatíveis em vez de validar respostas invisíveis', () => {
    const select = createDefaultPageElement('input_select');
    select.options = [{ id: 'valid-option', label: 'Válida' }];
    select.defaultValue = 'opção removida';
    const rating = createDefaultPageElement('input_rating');
    rating.defaultValue = 0;

    expect(buildDefaults(createForm([select, rating]))).toEqual({});
  });

  it('pré-popula data por variável, parâmetro GET, contexto e campo anterior', () => {
    const dateFromVariable = createDefaultPageElement('input_date');
    dateFromVariable.defaultValue = '{{data_inicial}}';
    const dateFromParam = createDefaultPageElement('input_date');
    dateFromParam.defaultValue = '{{param.start_date}}';
    const contextText = createDefaultPageElement('input_text');
    contextText.defaultValue = '{{ctx.device}}';
    const previous = createDefaultPageElement('input_text');
    previous.defaultValue = '{{param.name}}';
    const copied = createDefaultPageElement('input_text');
    copied.defaultValue = `{{field:${previous.id}}}`;
    const form = createForm([dateFromVariable, dateFromParam, contextText, copied, previous]);
    form.variables = [{
      id: 'date-variable',
      name: 'data_inicial',
      type: 'text',
      defaultValue: '{{param.birth_date}}',
    }];

    const defaults = buildDefaults(form, {
      __param_birth_date: '1990-04-19',
      __param_start_date: '2026-08-11',
      __param_name: 'Leonardo',
      __ctx_device: 'desktop',
    });

    expect(String(defaults[dateFromVariable.id])).toContain('1990-04-19');
    expect(String(defaults[dateFromParam.id])).toContain('2026-08-11');
    expect(defaults[contextText.id]).toBe('desktop');
    expect(defaults[previous.id]).toBe('Leonardo');
    expect(defaults[copied.id]).toBe('Leonardo');
    expect(defaults.__var_data_inicial).toBe('1990-04-19');
  });

  it('resolve variáveis de resposta a partir de defaults compostos e respeita overrides explícitos', () => {
    const address = createDefaultPageElement('input_address');
    address.defaultValue = '{"street":"Paulista","number":"1000","city":"São Paulo"}';
    const copiedCity = createDefaultPageElement('input_text');
    copiedCity.defaultValue = '{{cidade}}';
    const overridden = createDefaultPageElement('input_text');
    overridden.defaultValue = '{{origem}}';
    const form = createForm([copiedCity, overridden, address]);
    form.variables = [
      { id: 'city', name: 'cidade', type: 'response', sourceElementId: `${address.id}.city` },
      { id: 'source', name: 'origem', type: 'text', defaultValue: 'orgânico' },
    ];

    expect(buildDefaults(form, { __var_origem: 'campanha' })).toMatchObject({
      [address.id]: expect.objectContaining({ city: 'São Paulo' }),
      [copiedCity.id]: 'São Paulo',
      [overridden.id]: 'campanha',
    });
    expect(buildDefaults(form, { __var_origem: 'campanha' })).not.toHaveProperty('__var_cidade');
  });

  it('sincroniza Salvar em variável quando o campo nasce pré-populado', () => {
    const field = createDefaultPageElement('input_text');
    field.variableId = 'bound';
    field.defaultValue = '{{param.name}}';
    const form = createForm([field]);
    form.variables = [{ id: 'bound', name: 'nome_salvo', type: 'text' }];

    expect(buildDefaults(form, { __param_name: 'Leonardo' })).toMatchObject({
      [field.id]: 'Leonardo',
      __var_nome_salvo: 'Leonardo',
    });
  });

  it('aplica contexto geo tardio sem sobrescrever resposta tocada ou retomada', () => {
    const city = createDefaultPageElement('input_text');
    city.defaultValue = '{{ctx.geoCity}}';
    city.variableId = 'city-variable';
    const country = createDefaultPageElement('input_text');
    country.defaultValue = 'País: {{ctx.geoCountry}}';
    const form = createForm([city, country]);
    form.variables = [{
      id: 'city-variable',
      name: 'cidade',
      type: 'text',
      defaultValue: '{{ctx.geoCity}}',
    }];
    const syncContext = { __ctx_geoCity: '', __ctx_geoCountry: '' };
    const initialDefaults = buildDefaults(form, syncContext);
    const current = {
      ...syncContext,
      ...initialDefaults,
      [country.id]: 'Valor retomado',
    };
    const protectedKeys = new Set([country.id]);

    const next = mergeLateContextDefaults(form, current, initialDefaults, {
      __ctx_geoCity: 'São Paulo',
      __ctx_geoCountry: 'Brasil',
      __ctx_geoSource: 'ip',
    }, protectedKeys);

    expect(next[city.id]).toBe('São Paulo');
    expect(next.__var_cidade).toBe('São Paulo');
    expect(next[country.id]).toBe('Valor retomado');
    expect(next.__ctx_geoSource).toBe('ip');
  });

  it('encerra ciclos entre defaults sem preencher tokens literais no formulário', () => {
    const first = createDefaultPageElement('input_text');
    first.defaultValue = '{{a}}';
    const form = createForm([first]);
    form.variables = [
      { id: 'a', name: 'a', type: 'text', defaultValue: '{{b}}' },
      { id: 'b', name: 'b', type: 'text', defaultValue: '{{a}}' },
    ];

    expect(buildDefaults(form)).toEqual({});
  });

  it('resolve uma cadeia reversa de defaults maior que 64 sem depender da ordem visual', () => {
    const chain = Array.from({ length: 80 }, (_, index) => {
      const element = createDefaultPageElement('input_text');
      element.id = `chain-${index}`;
      element.defaultValue = index === 0
        ? '{{param.seed}}'
        : `{{field:chain-${index - 1}}}`;
      return element;
    });
    const form = createForm([...chain].reverse());

    const defaults = buildDefaults(form, { __param_seed: 'resolvido' });
    expect(defaults['chain-0']).toBe('resolvido');
    expect(defaults['chain-79']).toBe('resolvido');
  });

  it('resolve telefone composto para analytics sem gerar [object Object]', () => {
    const phone = createDefaultPageElement('input_phone');
    const form = createForm([phone]);

    expect(resolveUserData(undefined, {
      [phone.id]: { countryCode: 'BR', ddi: '+55', number: '(11) 98765-4321' },
    }, form)).toEqual({ phone: '+5511987654321' });
  });

  it('valida limites dinâmicos mesmo quando o campo de data é opcional', () => {
    const date = createDefaultPageElement('input_date');
    date.dateMaxRule = { mode: 'today' };
    date.dateConstraintMessage = 'Não selecione uma data futura';
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);

    expect(getRequiredFieldErrors([date], {
      [date.id]: future.toISOString(),
    })).toEqual({
      [date.id]: 'Não selecione uma data futura',
    });

    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(getRequiredFieldErrors([date], {
      [date.id]: past.toISOString(),
    })).toEqual({});
  });
});

describe('workflow answer helpers', () => {
  it('keeps auto-advance blocked while another optional input is unanswered', () => {
    const choice = createDefaultPageElement('input_radio');
    const optionalText = createDefaultPageElement('input_text');
    optionalText.required = false;

    expect(hasUnansweredInputFields([choice, optionalText], {
      [choice.id]: choice.options?.[0]?.id || 'selected',
    })).toBe(true);
    expect(hasUnansweredInputFields([choice, optionalText], {
      [choice.id]: choice.options?.[0]?.id || 'selected',
      [optionalText.id]: 'respondido',
    })).toBe(false);
  });

  it('synchronises Salvar em variável without coercing structured answers', () => {
    const field = createDefaultPageElement('input_phone');
    field.variableId = 'variable-phone';
    const value = { ddi: '+55', number: '11999999999' };
    const form = {
      id: 'form',
      pages: [{ id: 'page', title: 'Page', elements: [field] }],
      variables: [{ id: 'variable-phone', name: 'telefone', type: 'custom' as const }],
    } as any;

    expect(applyElementVariableBinding(form, field.id, value, {})).toEqual({
      __var_telefone: value,
    });
  });

  it('applies field, context, GET param and interpolated page assignments in order', () => {
    const variables = [
      { id: 'v-field', name: 'campo', type: 'custom' as const },
      { id: 'v-context', name: 'dispositivo', type: 'custom' as const },
      { id: 'v-param', name: 'origem', type: 'custom' as const },
      { id: 'v-free', name: 'resumo', type: 'custom' as const },
    ];
    const page = {
      id: 'page',
      title: 'Page',
      elements: [],
      variableAssignments: [
        { id: 'a1', variableId: 'v-field', sourceType: 'field' as const, sourceElementId: 'field' },
        { id: 'a2', variableId: 'v-context', sourceType: 'context' as const, value: 'device' },
        { id: 'a3', variableId: 'v-param', sourceType: 'param' as const, value: 'utm_source' },
        { id: 'a4', variableId: 'v-free', sourceType: 'free' as const, value: '{{campo}}/{{dispositivo}}/{{origem}}' },
      ],
    };
    const form = { id: 'form', pages: [page], variables } as any;

    expect(applyPageVariableAssignments(form, page, {
      field: { nested: true },
      __ctx_device: 'mobile',
      __param_utm_source: 'newsletter',
    })).toEqual({
      field: { nested: true },
      __ctx_device: 'mobile',
      __param_utm_source: 'newsletter',
      __var_campo: { nested: true },
      __var_dispositivo: 'mobile',
      __var_origem: 'newsletter',
      __var_resumo: '{"nested":true}/mobile/newsletter',
    });
  });

  it('preserva o tipo de um valor composto em atribuição livre de token único', () => {
    const variables = [
      { id: 'source', name: 'telefone', type: 'text' as const },
      { id: 'target', name: 'copia', type: 'text' as const },
    ];
    const page = {
      id: 'page',
      title: 'Page',
      elements: [],
      variableAssignments: [{
        id: 'assignment',
        variableId: 'target',
        sourceType: 'free' as const,
        value: '{{telefone}}',
      }],
    };
    const phone = { ddi: '+55', number: '11999990000' };
    expect(applyPageVariableAssignments({ id: 'form', variables } as any, page, {
      __var_telefone: phone,
    })).toMatchObject({ __var_copia: phone });
  });
});
