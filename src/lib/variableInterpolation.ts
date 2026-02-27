import { FormVariable } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { FunnelPage } from '@/types/form';

/** Get a value from an object using dot/bracket path */
function getNestedValue(obj: any, path: string): any {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return tokens.reduce((acc, key) => acc != null ? acc[key] : undefined, obj);
}

/**
 * Resolves all {{varName}} and {{webhook:nodeId:path}} placeholders in a string.
 * Variable assignment overrides are stored in answers as `__var_<name>`.
 * Webhook responses are stored in answers as `__webhook_<nodeId>`.
 */
export function interpolateText(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): string {
  if (!text) return text;

  // First handle webhook references: {{webhook:nodeId:dotPath}}
  let result = text.replace(/\{\{webhook:([^:}]+):([^}]+)\}\}/g, (_match, nodeId: string, path: string) => {
    const webhookData = answers[`__webhook_${nodeId}`];
    if (webhookData) {
      const val = getNestedValue(webhookData, path);
      return val !== undefined && val !== null ? String(val) : '';
    }
    return '';
  });

  // Handle context references: {{ctx.device}}, {{ctx.browser}}, etc.
  result = result.replace(/\{\{ctx\.(\w+)\}\}/g, (_match, key: string) => {
    const val = answers[`__ctx_${key}`];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Handle GET param references: {{param.utm_source}}, etc.
  result = result.replace(/\{\{param\.(\w+)\}\}/g, (_match, key: string) => {
    const val = answers[`__param_${key}`];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Then handle variable references: {{varName}}
  if (variables.length === 0) return result;

  return result.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
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
