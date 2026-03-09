import { FormVariable } from '@/types/form';
import { PageElement } from '@/types/pageElements';
import { FunnelPage } from '@/types/form';
import { createElement, Fragment, ReactNode } from 'react';

/** Stringify an object field value into a human-readable string (e.g. phone → ddi+number) */
function stringifyFieldValue(val: any): string {
  if (Array.isArray(val)) return val.map(v => typeof v === 'object' ? stringifyFieldValue(v) : String(v)).join(', ');
  // Phone field: { ddi, number, countryCode }
  if (val.ddi && val.number) return `${val.ddi}${val.number.replace(/\D/g, '')}`;
  // Address: { street, number, city, state, zip, ... }
  if (val.street !== undefined || val.city !== undefined) {
    return [val.street, val.number, val.complement, val.neighborhood, val.city, val.state, val.zip].filter(Boolean).join(', ');
  }
  // Height/Weight: { height, weight }
  if (val.height !== undefined || val.weight !== undefined) {
    return [val.height && `${val.height}cm`, val.weight && `${val.weight}kg`].filter(Boolean).join(' / ');
  }
  // Full name: { first, last }
  if (val.first !== undefined || val.last !== undefined) {
    return [val.first, val.last].filter(Boolean).join(' ');
  }
  // Fallback: JSON
  return JSON.stringify(val);
}

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
  result = result.replace(/\{\{param\.([^}]+)\}\}/g, (_match, key: string) => {
    const val = answers[`__param_${key}`];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // Handle field references: {{field:elementId}}
  result = result.replace(/\{\{field:([^}]+)\}\}/g, (_match, elementId: string) => {
    const val = answers[elementId];
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return stringifyFieldValue(val);
    return String(val);
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

/**
 * Like interpolateText but returns an HTML string with variable values wrapped
 * in `<mark class="var-highlight ...">` badges — safe for dangerouslySetInnerHTML
 * in rich_text elements on the public preview.
 */
export function interpolateTextToHtml(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): string {
  if (!text) return text;

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const VAR_HTML: Record<VarType, string> = {
    variable: 'var-highlight var-highlight-variable',
    webhook: 'var-highlight var-highlight-webhook',
    field: 'var-highlight var-highlight-field',
    param: 'var-highlight var-highlight-param',
    context: 'var-highlight var-highlight-context',
  };

  const resolve = (token: string): { value: string; type: VarType } | null => {
    const inner = token.slice(2, -2); // remove {{ and }}

    if (inner.startsWith('webhook:')) {
      const parts = inner.split(':');
      const nodeId = parts[1];
      const path = parts.slice(2).join(':');
      const data = answers[`__webhook_${nodeId}`];
      const val = data ? String(getNestedValue(data, path) ?? '') : '';
      return val ? { value: val, type: 'webhook' } : null;
    }
    if (inner.startsWith('ctx.')) {
      const val = String(answers[`__ctx_${inner.slice(4)}`] ?? '');
      return val ? { value: val, type: 'context' } : null;
    }
    if (inner.startsWith('param.')) {
      const val = String(answers[`__param_${inner.slice(6)}`] ?? '');
      return val ? { value: val, type: 'param' } : null;
    }
    if (inner.startsWith('field:')) {
      const raw = answers[inner.slice(6)];
      const val = raw !== undefined && raw !== null ? (typeof raw === 'object' ? stringifyFieldValue(raw) : String(raw)) : '';
      return val ? { value: val, type: 'field' } : null;
    }

    const variable = variables.find(v => v.name === inner);
    if (!variable) return null;
    const override = answers[`__var_${inner}`];
    let val = '';
    if (override !== undefined && override !== null) {
      val = String(override);
    } else if (variable.type === 'response' && variable.sourceElementId) {
      val = String(answers[variable.sourceElementId] ?? variable.defaultValue ?? '');
    } else {
      val = variable.defaultValue || '';
    }
    return val ? { value: val, type: 'variable' } : null;
  };

  return text.replace(/\{\{(?:webhook:[^}]+|ctx\.\w+|param\.[^}]+|field:[^}]+|\w+)\}\}/g, (token) => {
    const resolved = resolve(token);
    if (!resolved) return '';
    return esc(resolved.value);
  });
}

type VarType = 'variable' | 'webhook' | 'field' | 'param' | 'context';

const VAR_TYPE_CLASS: Record<VarType, string> = {
  variable: 'var-highlight var-highlight-variable',
  webhook: 'var-highlight var-highlight-webhook',
  field: 'var-highlight var-highlight-field',
  param: 'var-highlight var-highlight-param',
  context: 'var-highlight var-highlight-context',
};

/**
 * Like interpolateText but returns React nodes with styled variable value spans.
 * Variable values are wrapped in colored <mark> elements matching the editor highlight style.
 * Wrap the result container with className="var-highlight-readable" for proper visible text.
 */
export function interpolateTextToNodes(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): ReactNode {
  if (!text) return text;

  // Split on all {{...}} tokens
  const regex = /(\{\{(?:webhook:[^}]+|ctx\.\w+|param\.[^}]+|field:[^}]+|\w+)\}\})/g;
  const parts = text.split(regex);

  if (parts.length === 1) return text; // no variables

  const nodes: ReactNode[] = [];
  let hasVar = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const tokenMatch = part.match(/^\{\{(.+)\}\}$/);
    if (!tokenMatch) {
      nodes.push(part);
      continue;
    }

    const inner = tokenMatch[1];
    let value = '';
    let varType: VarType = 'variable';

    if (inner.startsWith('webhook:')) {
      varType = 'webhook';
      const colonParts = inner.split(':');
      const nodeId = colonParts[1];
      const path = colonParts.slice(2).join(':');
      const data = answers[`__webhook_${nodeId}`];
      value = data ? String(getNestedValue(data, path) ?? '') : '';
    } else if (inner.startsWith('ctx.')) {
      varType = 'context';
      value = String(answers[`__ctx_${inner.slice(4)}`] ?? '');
    } else if (inner.startsWith('param.')) {
      varType = 'param';
      value = String(answers[`__param_${inner.slice(6)}`] ?? '');
    } else if (inner.startsWith('field:')) {
      varType = 'field';
      value = String(answers[inner.slice(6)] ?? '');
    } else {
      const variable = variables.find(v => v.name === inner);
      if (!variable) {
        nodes.push(part);
        continue;
      }
      const override = answers[`__var_${inner}`];
      if (override !== undefined && override !== null) {
        value = String(override);
      } else if (variable.type === 'response' && variable.sourceElementId) {
        value = String(answers[variable.sourceElementId] ?? variable.defaultValue ?? '');
      } else {
        value = variable.defaultValue || '';
      }
    }

    if (!value) {
      continue;
    }

    hasVar = true;
    nodes.push(value);
  }

  // If no variables were found, return plain text (avoids unnecessary wrapper)
  if (!hasVar) return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : createElement(Fragment, null, ...nodes);

  return createElement(Fragment, null, ...nodes);
}
