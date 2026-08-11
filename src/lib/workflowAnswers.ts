import type { FormVariable, WebhookResponseMapping } from '@/types/form';

function getNestedValue(value: unknown, path: string): unknown {
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return tokens.reduce<unknown>((current, key) => (
    current !== null && typeof current === 'object'
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

/** Store a full webhook response for conditions/tokens and apply configured mappings. */
export function applyWebhookResponse(
  answers: Record<string, any>,
  nodeId: string,
  responseBody: unknown,
  mappings: WebhookResponseMapping[] = [],
  variables: FormVariable[] = [],
): Record<string, any> {
  if (responseBody === null || responseBody === undefined) return answers;

  const updated = { ...answers, [`__webhook_${nodeId}`]: responseBody };
  for (const mapping of mappings) {
    if (!mapping.responsePath || !mapping.variableId) continue;
    const value = getNestedValue(responseBody, mapping.responsePath);
    if (value === undefined) continue;
    const variable = variables.find((candidate) => candidate.id === mapping.variableId);
    updated[variable ? `__var_${variable.name}` : `__var_${mapping.variableId}`] = value;
  }
  return updated;
}
