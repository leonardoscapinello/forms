import { describe, expect, it } from 'vitest';
import type { FormVariable, VariableOperation } from '@/types/form';
import { applyVariableOperations } from './variableOperations';

const variables: FormVariable[] = [
  { id: 'total', name: 'total', type: 'number', defaultValue: '{{param.initial}}' },
  { id: 'factor', name: 'factor', type: 'number', defaultValue: '{{ctx.factor}}' },
  { id: 'result', name: 'result', type: 'number', defaultValue: '0' },
];

describe('workflow variable math', () => {
  it('resolves GET/context variables and applies operations sequentially', () => {
    const operations: VariableOperation[] = [
      { id: 'add', variableId: 'total', op: 'add', operandType: 'literal', operand: '{{factor}}' },
      { id: 'multiply', variableId: 'total', op: 'multiply', operandType: 'literal', operand: '2' },
      { id: 'copy', variableId: 'result', op: 'set', operandType: 'literal', operand: '{{total}}' },
    ];
    expect(applyVariableOperations(operations, variables, {
      __param_initial: '10',
      __ctx_factor: '5',
    })).toMatchObject({
      __var_total: '30',
      __var_result: '30',
    });
  });

  it('reads compound field operands and keeps an explicit override as the starting value', () => {
    const operations: VariableOperation[] = [{
      id: 'add',
      variableId: 'total',
      op: 'add',
      operandType: 'field',
      operandFieldId: 'pricing.amount',
      operand: '',
    }];
    expect(applyVariableOperations(operations, variables, {
      __var_total: '7',
      pricing: { amount: 3 },
    }).__var_total).toBe('10');
  });

  it('does not divide by zero or mutate the input answer object', () => {
    const answers = { __var_total: '10' };
    const result = applyVariableOperations([{
      id: 'divide',
      variableId: 'total',
      op: 'divide',
      operand: '0',
    }], variables, answers);
    expect(result.__var_total).toBe('10');
    expect(result).not.toBe(answers);
    expect(answers.__var_total).toBe('10');
  });

  it('does not corrupt a variable when an operation contains an unknown token', () => {
    const result = applyVariableOperations([{
      id: 'invalid-set',
      variableId: 'total',
      op: 'set',
      operand: '{{variavel_inexistente}}',
    }], variables, { __var_total: '12' });

    expect(result.__var_total).toBe('12');
  });
});
