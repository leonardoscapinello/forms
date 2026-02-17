import { ConditionBranch, VariableOperation, FormVariable } from '@/types/form';

export interface NodeValidationResult {
  isValid: boolean;
  errors: string[];
}

/** Validates a condition node — checks every branch has at least one properly configured rule */
export function validateConditionNode(branches: ConditionBranch[], variables: FormVariable[]): NodeValidationResult {
  const errors: string[] = [];

  if (branches.length === 0) {
    errors.push('Nenhum caminho configurado');
    return { isValid: false, errors };
  }

  for (const branch of branches) {
    const rules = branch.conditionGroup?.rules ?? [];
    if (rules.length === 0) {
      errors.push(`Caminho "${branch.label}" sem regras`);
      continue;
    }
    for (const rule of rules) {
      if (rule.subjectType === 'variable') {
        if (!rule.variableId) {
          errors.push(`Caminho "${branch.label}": variável não escolhida`);
        }
      } else {
        if (!rule.questionId) {
          errors.push(`Caminho "${branch.label}": campo não escolhido`);
        }
      }
      const needsValue = rule.operator !== 'is_empty' && rule.operator !== 'is_not_empty';
      if (needsValue && !rule.value?.trim()) {
        errors.push(`Caminho "${branch.label}": valor de comparação vazio`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}

/** Validates a variable-op node — checks every operation has a variable and operand configured */
export function validateVariableOpNode(operations: VariableOperation[], variables: FormVariable[]): NodeValidationResult {
  const errors: string[] = [];

  if (operations.length === 0) {
    errors.push('Nenhuma operação configurada');
    return { isValid: false, errors };
  }

  for (const op of operations) {
    if (!op.variableId) {
      errors.push('Operação sem variável definida');
      continue;
    }
    const variable = variables.find(v => v.id === op.variableId);
    if (!variable) {
      errors.push('Operação com variável inexistente');
      continue;
    }
    if (op.op !== 'set' && variable.type === 'text') {
      // arithmetic on text variable — warn but not block
    }
    if (op.operandType === 'field') {
      if (!op.operandFieldId) {
        errors.push(`Operação em "${variable.name}": campo não selecionado`);
      }
    } else {
      if (op.operand === undefined || op.operand === '') {
        errors.push(`Operação em "${variable.name}": valor vazio`);
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
