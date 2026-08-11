import { describe, expect, it } from 'vitest';
import type { FormData } from '@/types/form';
import { createDefaultPageElement } from '@/types/pageElements';
import { validateFormIntegrity } from './formIntegrityValidator';

function createForm(): { form: FormData; nestedFieldId: string } {
  const nestedField = createDefaultPageElement('input_email');
  nestedField.label = 'E-mail em coluna';
  const columns = createDefaultPageElement('columns');
  columns.columnData![0].elements = [nestedField];

  const form: FormData = {
    id: 'form-integrity',
    title: 'Integridade',
    questions: [],
    pages: [
      { id: 'field-page', title: 'Campos', elements: [columns] },
      { id: 'other-page', title: 'Outra', elements: [] },
    ],
    conditions: [{
      id: 'condition-1',
      label: 'Tem e-mail',
      branches: [{
        id: 'branch-1',
        label: 'Sim',
        conditionGroup: {
          id: 'group-1',
          logic: 'and',
          groups: [],
          rules: [{
            id: 'rule-1',
            subjectType: 'question',
            questionId: nestedField.id,
            operator: 'is_not_empty',
            value: '',
          }],
        },
      }],
    }],
    flowEdges: [
      { id: 'edge-1', source: 'start', target: 'p-other-page' },
      { id: 'edge-2', source: 'p-other-page', target: 'c-condition-1' },
    ],
    style: { primaryColor: '#000000', backgroundColor: '#ffffff', fontFamily: 'Inter' },
    status: 'draft',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    responseCount: 0,
    completionRate: 0,
  };

  return { form, nestedFieldId: nestedField.id };
}

describe('form integrity with nested elements', () => {
  it('detecta referência fora de ordem para campo aninhado em colunas', () => {
    const { form, nestedFieldId } = createForm();

    expect(validateFormIntegrity(form)).toContainEqual(expect.objectContaining({
      nodeId: 'c-condition-1',
      elementId: nestedFieldId,
      elementLabel: 'E-mail em coluna',
      elementPageId: 'field-page',
      category: 'condition',
    }));
  });

  it('aceita o mesmo campo aninhado quando sua página está antes da condição', () => {
    const { form } = createForm();
    form.flowEdges = [
      { id: 'edge-1', source: 'start', target: 'p-field-page' },
      { id: 'edge-2', source: 'p-field-page', target: 'c-condition-1' },
    ];

    expect(validateFormIntegrity(form)).toEqual([]);
  });
});
