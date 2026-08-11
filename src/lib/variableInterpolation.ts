import type { FormVariable } from '@/types/form';
import { createElement, Fragment, type ReactNode } from 'react';
import { sanitizeRichTextHtml } from '@/lib/sanitize';

type VarType = 'variable' | 'webhook' | 'field' | 'param' | 'context' | 'answer';

export interface InterpolationTokenResolution {
  /** False means that the token does not match any configured/runtime value. */
  recognized: boolean;
  type: VarType;
  value: unknown;
}

const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;
const EXACT_TOKEN_PATTERN = /^\s*\{\{([^{}]+)\}\}\s*$/;
const MAX_VARIABLE_DEPTH = 32;
const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Get a value from an object using a safe dot/bracket path. */
function getNestedValue(value: unknown, path: string): unknown {
  if (!path) return value;
  const tokens = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  if (tokens.some(token => DANGEROUS_PATH_SEGMENTS.has(token.toLowerCase()))) return undefined;
  return tokens.reduce<unknown>((current, key) => (
    current !== null && typeof current === 'object'
      ? (current as Record<string, unknown>)[key]
      : undefined
  ), value);
}

/**
 * Reads an answer by exact key first and then supports a compound path such as
 * `address.city`. Exact matching is important because generated element IDs may
 * themselves contain punctuation.
 */
export function readAnswerValue(
  answers: Record<string, any>,
  keyOrPath: string,
): unknown {
  const candidateParts = keyOrPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  if (candidateParts.some(part => DANGEROUS_PATH_SEGMENTS.has(part.toLowerCase()))) return undefined;
  if (hasOwn(answers, keyOrPath)) return answers[keyOrPath];

  const pathParts = candidateParts;
  for (let prefixLength = pathParts.length - 1; prefixLength > 0; prefixLength -= 1) {
    const prefix = pathParts.slice(0, prefixLength).join('.');
    if (!hasOwn(answers, prefix)) continue;
    return getNestedValue(answers[prefix], pathParts.slice(prefixLength).join('.'));
  }
  return undefined;
}

/** Stringify a field/variable value without leaking `[object Object]` into UI or integrations. */
export function stringifyInterpolationValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyInterpolationValue).filter(part => part !== '').join(', ');
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  // Phone field: { ddi, number, countryCode }
  if (record.ddi !== undefined && record.number !== undefined) {
    const ddi = String(record.ddi ?? '');
    const number = String(record.number ?? '').replace(/\D/g, '');
    return `${ddi}${number}`;
  }
  // Address field.
  if (record.street !== undefined || record.city !== undefined) {
    return [
      record.street,
      record.number,
      record.complement,
      record.neighborhood,
      record.city,
      record.state,
      record.cep ?? record.zip,
      record.country,
    ].filter(part => part !== undefined && part !== null && part !== '')
      .map(String)
      .join(', ');
  }
  // Height/weight fields use either a generic value+unit shape or legacy keys.
  if (record.value !== undefined && record.unit !== undefined) {
    return `${stringifyInterpolationValue(record.value)}${String(record.unit)}`;
  }
  if (record.height !== undefined || record.weight !== undefined) {
    return [
      record.height !== undefined ? `${stringifyInterpolationValue(record.height)}cm` : '',
      record.weight !== undefined ? `${stringifyInterpolationValue(record.weight)}kg` : '',
    ].filter(Boolean).join(' / ');
  }
  // Full name.
  if (record.first !== undefined || record.last !== undefined) {
    return [record.first, record.last].filter(Boolean).map(String).join(' ');
  }

  try {
    return JSON.stringify(record);
  } catch {
    return '';
  }
}

function variableIdentity(variable: FormVariable): string {
  return variable.name || variable.id;
}

function resolveVariableRawValue(
  variable: FormVariable,
  variables: FormVariable[],
  answers: Record<string, any>,
  stack: Set<string>,
  depth: number,
): unknown {
  const identity = variableIdentity(variable);
  if (!identity || stack.has(identity) || depth >= MAX_VARIABLE_DEPTH) return '';
  const nextStack = new Set(stack).add(identity);
  const overrideKey = `__var_${variable.name}`;

  let rawValue: unknown;
  if (hasOwn(answers, overrideKey)) {
    // An explicit runtime override always wins, including false, zero and empty.
    rawValue = answers[overrideKey];
  } else if (variable.type === 'response' && variable.sourceElementId) {
    rawValue = readAnswerValue(answers, variable.sourceElementId);
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      rawValue = variable.defaultValue ?? '';
    }
  } else {
    rawValue = variable.defaultValue ?? '';
  }

  if (typeof rawValue !== 'string' || !rawValue.includes('{{')) return rawValue;
  return resolveTemplateValueInternal(rawValue, variables, answers, nextStack, depth + 1, 'empty');
}

/** Resolve one configured variable while respecting runtime overrides and response bindings. */
export function resolveConfiguredVariableValue(
  variable: FormVariable,
  variables: FormVariable[],
  answers: Record<string, any>,
): unknown {
  return resolveVariableRawValue(variable, variables, answers, new Set(), 0);
}

function resolveTokenInternal(
  rawToken: string,
  variables: FormVariable[],
  answers: Record<string, any>,
  stack: Set<string>,
  depth: number,
): InterpolationTokenResolution {
  const token = rawToken.trim();

  if (token.startsWith('webhook:')) {
    const separatorIndex = token.indexOf(':', 'webhook:'.length);
    if (separatorIndex < 0) return { recognized: false, type: 'webhook', value: undefined };
    const nodeId = token.slice('webhook:'.length, separatorIndex);
    const path = token.slice(separatorIndex + 1);
    const dataKey = `__webhook_${nodeId}`;
    return {
      recognized: true,
      type: 'webhook',
      value: hasOwn(answers, dataKey) ? getNestedValue(answers[dataKey], path) : undefined,
    };
  }
  if (token.startsWith('ctx.')) {
    return {
      recognized: true,
      type: 'context',
      value: readAnswerValue(answers, `__ctx_${token.slice('ctx.'.length)}`),
    };
  }
  if (token.startsWith('param.')) {
    return {
      recognized: true,
      type: 'param',
      value: readAnswerValue(answers, `__param_${token.slice('param.'.length)}`),
    };
  }
  if (token.startsWith('field:')) {
    return {
      recognized: true,
      type: 'field',
      value: readAnswerValue(answers, token.slice('field:'.length)),
    };
  }

  const variable = variables.find(candidate => candidate.name === token || candidate.id === token);
  if (variable) {
    return {
      recognized: true,
      type: 'variable',
      value: resolveVariableRawValue(variable, variables, answers, stack, depth),
    };
  }

  // Backwards compatibility for old templates that used {{elementId}} rather
  // than {{field:elementId}}. This is deliberately limited to existing keys.
  const directAnswer = readAnswerValue(answers, token);
  if (directAnswer !== undefined || hasOwn(answers, token)) {
    return { recognized: true, type: 'answer', value: directAnswer };
  }
  return { recognized: false, type: 'variable', value: undefined };
}

/** Resolve a single token body (without the surrounding braces). */
export function resolveInterpolationToken(
  token: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): InterpolationTokenResolution {
  return resolveTokenInternal(token, variables, answers, new Set(), 0);
}

function interpolateTextInternal(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
  stack: Set<string>,
  depth: number,
  unknown: 'preserve' | 'empty',
): string {
  if (!text) return text;
  TOKEN_PATTERN.lastIndex = 0;
  const result = text.replace(TOKEN_PATTERN, (fullToken, tokenBody: string) => {
    const resolved = resolveTokenInternal(tokenBody, variables, answers, stack, depth);
    if (!resolved.recognized) return unknown === 'preserve' ? fullToken : '';
    return stringifyInterpolationValue(resolved.value);
  });
  TOKEN_PATTERN.lastIndex = 0;
  return result;
}

function resolveTemplateValueInternal(
  value: unknown,
  variables: FormVariable[],
  answers: Record<string, any>,
  stack: Set<string>,
  depth: number,
  unknown: 'preserve' | 'empty',
): unknown {
  if (typeof value !== 'string' || !value.includes('{{')) return value;
  const exact = EXACT_TOKEN_PATTERN.exec(value);
  if (exact) {
    const resolved = resolveTokenInternal(exact[1], variables, answers, stack, depth);
    if (resolved.recognized) return resolved.value ?? '';
    return unknown === 'preserve' ? value : '';
  }
  return interpolateTextInternal(value, variables, answers, stack, depth, unknown);
}

/**
 * Resolves a configured value. When it consists of one token, its original
 * type is preserved so compound fields, booleans and numbers can be defaults.
 */
export function resolveTemplateValue(
  value: unknown,
  variables: FormVariable[],
  answers: Record<string, any>,
  options: { unknown?: 'preserve' | 'empty' } = {},
): unknown {
  return resolveTemplateValueInternal(
    value,
    variables,
    answers,
    new Set(),
    0,
    options.unknown ?? 'preserve',
  );
}

/**
 * Resolves all supported placeholders. Unknown tokens remain visible so a
 * broken builder configuration cannot silently become apparently valid text.
 */
export function interpolateText(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): string {
  return interpolateTextInternal(text, variables, answers, new Set(), 0, 'preserve');
}

/** Builds a map of fully resolved variable values from answers + form config. */
export function resolveVariableValues(
  variables: FormVariable[],
  answers: Record<string, any>,
): Record<string, string> {
  return Object.fromEntries(variables.map(variable => [
    variable.name,
    stringifyInterpolationValue(resolveConfiguredVariableValue(variable, variables, answers)),
  ]));
}

/**
 * Builds the structured variables object used by integration payloads.
 *
 * Unlike `resolveVariableValues`, this deliberately preserves JSON-compatible
 * runtime types. Only names present in the persisted form configuration are
 * emitted, so an arbitrary `__var_*` answer can never become a payload field.
 */
export function resolveVariablePayloadValues(
  variables: FormVariable[],
  answers: Record<string, any>,
): Record<string, unknown> {
  const safeVariables = variables.slice(0, 250).filter(variable => (
    Boolean(variable) && typeof variable === 'object' && Boolean(variable.name) &&
    variable.name.length <= 256 &&
    !DANGEROUS_PATH_SEGMENTS.has(variable.name.toLowerCase())
  ));
  return Object.fromEntries(safeVariables.map(variable => {
    const resolved = resolveConfiguredVariableValue(variable, safeVariables, answers);
    return [variable.name, resolved === undefined ? '' : resolved];
  }));
}

/** Validates an alphanumeric/underscore variable name that cannot start with a digit. */
export function isValidVariableName(name: string): boolean {
  return /^[a-zA-Z_]\w*$/.test(name);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Resolve tokens inside sanitized rich text, escaping every runtime value. */
export function interpolateTextToHtml(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): string {
  if (!text) return text;
  TOKEN_PATTERN.lastIndex = 0;
  const result = sanitizeRichTextHtml(text).replace(TOKEN_PATTERN, (_token, tokenBody: string) => {
    const resolved = resolveTokenInternal(tokenBody, variables, answers, new Set(), 0);
    return resolved.recognized ? escapeHtml(stringifyInterpolationValue(resolved.value)) : '';
  });
  TOKEN_PATTERN.lastIndex = 0;
  return result;
}

/** Resolve tokens into React-safe text nodes (React performs the escaping). */
export function interpolateTextToNodes(
  text: string,
  variables: FormVariable[],
  answers: Record<string, any>,
): ReactNode {
  if (!text) return text;
  TOKEN_PATTERN.lastIndex = 0;
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    const resolved = resolveTokenInternal(match[1], variables, answers, new Set(), 0);
    if (resolved.recognized) parts.push(stringifyInterpolationValue(resolved.value));
    else parts.push(match[0]);
    cursor = match.index + match[0].length;
  }
  TOKEN_PATTERN.lastIndex = 0;
  if (cursor < text.length) parts.push(text.slice(cursor));
  if (parts.length === 0) return text;
  if (parts.length === 1) return parts[0];
  return createElement(Fragment, null, ...parts);
}
