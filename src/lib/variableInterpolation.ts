import { FormVariable } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { FunnelPage } from '@/types/form';

/**
 * Resolves all {{varName}} placeholders in a string using the current variable values.
 * Variable assignment overrides are stored in answers as `__var_<name>`.
 */
export function interpolateText(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): string {
  if (!text || variables.length === 0) return text;

  return text.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const variable = variables.find(v => v.name === varName);
    if (!variable) return `{{${varName}}}`;

    // Check if a variable assignment override exists (set at runtime)
    const assignOverride = answers[`__var_${varName}`];
    if (assignOverride !== undefined && assignOverride !== null) {
      return String(assignOverride);
    }

    if (variable.type === 'response' && variable.sourceElementId) {
      const val = answers[variable.sourceElementId];
      return val !== undefined && val !== null ? String(val) : variable.defaultValue || '';
    }

    return variable.defaultValue || '';
  });
}

/**
 * Builds a map of variable values from answers + variables config.
 */
export function resolveVariableValues(
  variables: FormVariable[],
  answers: Record<string, any>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const v of variables) {
    if (v.type === 'response' && v.sourceElementId) {
      const val = answers[v.sourceElementId];
      result[v.name] = val !== undefined && val !== null ? String(val) : v.defaultValue || '';
    } else {
      result[v.name] = v.defaultValue || '';
    }
  }
  return result;
}

/**
 * Validates that a variable name is valid (alphanumeric + underscore, no spaces).
 */
export function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_]\w*$/.test(name);
}
