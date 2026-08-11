import type { FormVariable, VariableOperation } from '@/types/form';
import {
  readAnswerValue,
  resolveConfiguredVariableValue,
  resolveTemplateValue,
  stringifyInterpolationValue,
} from '@/lib/variableInterpolation';

/** Apply one workflow variable-operation node against the latest answer state. */
export function applyVariableOperations(
  operations: VariableOperation[],
  variables: FormVariable[],
  answers: Record<string, any>,
): Record<string, any> {
  const updated = { ...answers };
  for (const operation of operations) {
    const variable = variables.find(candidate => candidate.id === operation.variableId);
    if (!variable) continue;

    let operand: string;
    if ((operation.operandType ?? 'literal') === 'field') {
      if (!operation.operandFieldId) continue;
      const fieldValue = readAnswerValue(updated, operation.operandFieldId);
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') continue;
      operand = stringifyInterpolationValue(fieldValue);
    } else {
      const resolvedOperand = resolveTemplateValue(
        operation.operand ?? '',
        variables,
        updated,
      );
      // A typo in a template must not silently mutate workflow state. Known
      // variables with an empty value still resolve to an empty string, while
      // unknown placeholders remain visible and make this operation a no-op.
      if (typeof resolvedOperand === 'string' && /\{\{[^{}]+\}\}/.test(resolvedOperand)) continue;
      operand = stringifyInterpolationValue(resolvedOperand);
      if (operation.op === 'set' && operand === '' && (operation.operand ?? '') === '') continue;
    }

    const storageKey = `__var_${variable.name}`;
    if (operation.op === 'set') {
      updated[storageKey] = operand;
      continue;
    }

    const currentValue = resolveConfiguredVariableValue(variable, variables, updated);
    const currentNumber = Number.parseFloat(stringifyInterpolationValue(currentValue)) || 0;
    const operandNumber = Number.parseFloat(operand) || 0;
    switch (operation.op) {
      case 'add':
        updated[storageKey] = String(currentNumber + operandNumber);
        break;
      case 'subtract':
        updated[storageKey] = String(currentNumber - operandNumber);
        break;
      case 'multiply':
        updated[storageKey] = String(currentNumber * operandNumber);
        break;
      case 'divide':
        updated[storageKey] = operandNumber !== 0
          ? String(currentNumber / operandNumber)
          : String(currentNumber);
        break;
    }
  }
  return updated;
}
