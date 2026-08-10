import { describe, expect, it } from 'vitest';
import { createDefaultPageElement } from '@/types/pageElements';
import { flattenPageElements, getRequiredFieldErrors } from './FormPreview.utils';

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
});
