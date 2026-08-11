export type PrefillSourceMode = 'literal' | 'reference' | 'param';

const PARAMETER_KEY_PATTERN = /^[A-Za-z0-9_.:\x5B\x5D-]{1,100}$/;
const DANGEROUS_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const RESERVED_PARAMETER_KEYS = new Set([
  'access_token',
  'token',
  'code',
  'state',
  'previewsession',
  'editorpreview',
]);
const EXACT_PARAMETER_TOKEN = /^\{\{\s*param\.([^{}]+?)\s*\}\}$/;
const TEMPLATE_TOKEN = /\{\{[^{}]+\}\}/;

export function normalizePrefillParameterKeyInput(value: string): string {
  const withoutQuestionMark = value.trim().replace(/^\?/, '');
  return withoutQuestionMark.split('=', 1)[0].trim();
}

export function isAllowedPrefillParameterKey(value: string): boolean {
  const key = normalizePrefillParameterKeyInput(value);
  if (!PARAMETER_KEY_PATTERN.test(key) || key.startsWith('__')) return false;
  if (RESERVED_PARAMETER_KEYS.has(key.toLowerCase())) return false;
  const segments = key.toLowerCase().split(/[.:[\]]+/).filter(Boolean);
  return !segments.some(segment => DANGEROUS_SEGMENTS.has(segment));
}

export function buildPrefillParameterToken(value: string): string | undefined {
  const key = normalizePrefillParameterKeyInput(value);
  return isAllowedPrefillParameterKey(key) ? `{{param.${key}}}` : undefined;
}

export function readPrefillParameterKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = EXACT_PARAMETER_TOKEN.exec(value.trim());
  if (!match) return undefined;
  const key = match[1].trim();
  return isAllowedPrefillParameterKey(key) ? key : undefined;
}

export function inferPrefillSourceMode(value: unknown): PrefillSourceMode {
  if (readPrefillParameterKey(value)) return 'param';
  return typeof value === 'string' && TEMPLATE_TOKEN.test(value)
    ? 'reference'
    : 'literal';
}
