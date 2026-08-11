import type { FormVariable } from '@/types/form';
import { interpolateText } from '@/lib/variableInterpolation';

const TOKEN_PATTERN = /\{\{([^{}]+)\}\}/g;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export interface ResolvedRedirectDestination {
  url: string;
  origin: string;
  isExternal: boolean;
  hasRuntimeValues: boolean;
}

export interface PrepareRedirectOptions {
  template?: string;
  variables?: FormVariable[];
  answers?: Record<string, unknown>;
  /** Dynamic destinations are intentionally ignored during the early phase. */
  phase: 'early' | 'final';
  baseUrl?: string;
  documentRef?: Document;
}

function getBaseUrl(baseUrl?: string): string {
  if (baseUrl) return baseUrl;
  if (typeof window !== 'undefined') return window.location.href;
  return 'https://forms.invalid/';
}

export function redirectTemplateHasRuntimeValues(template?: string): boolean {
  if (!template) return false;
  TOKEN_PATTERN.lastIndex = 0;
  const hasRuntimeValues = TOKEN_PATTERN.test(template);
  TOKEN_PATTERN.lastIndex = 0;
  return hasRuntimeValues;
}

/**
 * Resolve a redirect template without allowing an answer to change the scheme
 * or hostname. Runtime values are encoded as one URL component, preventing a
 * field value such as `//evil.example` or `javascript:` from becoming code or
 * an alternate destination.
 */
export function resolveRedirectDestination(
  template: string | undefined,
  variables: FormVariable[] = [],
  answers: Record<string, unknown> = {},
  baseUrl?: string,
): ResolvedRedirectDestination | null {
  const raw = template?.trim();
  if (!raw || hasControlCharacters(raw) || raw.includes('\\')) return null;

  TOKEN_PATTERN.lastIndex = 0;
  const runtimeTokens = [...raw.matchAll(TOKEN_PATTERN)];
  TOKEN_PATTERN.lastIndex = 0;
  const hasRuntimeValues = runtimeTokens.length > 0;
  const tokenlessTemplate = raw.replace(TOKEN_PATTERN, 'redirect-value');
  if (tokenlessTemplate.includes('{{') || tokenlessTemplate.includes('}}')) return null;

  const isRootRelative = raw.startsWith('/') && !raw.startsWith('//');
  const isHttpsTemplate = /^https:\/\//i.test(raw);
  if (!isRootRelative && !isHttpsTemplate) return null;

  if (isHttpsTemplate) {
    const authorityEnd = raw.slice('https://'.length).search(/[/?#]/);
    const authority = authorityEnd === -1
      ? raw.slice('https://'.length)
      : raw.slice('https://'.length, 'https://'.length + authorityEnd);
    // The host must be static. Answers may only populate path/query/fragment.
    if (!authority || authority.includes('{{') || authority.includes('}}')) return null;
  }

  let resolved = raw;
  for (const match of runtimeTokens) {
    const token = match[0];
    const value = interpolateText(token, variables, answers as Record<string, any>);
    if (value === token || value.includes('{{') || value.includes('}}')) return null;
    resolved = resolved.replace(token, encodeURIComponent(value));
  }

  try {
    const base = new URL(getBaseUrl(baseUrl));
    const url = new URL(resolved, base);
    if (url.username || url.password) return null;
    if (isHttpsTemplate && url.protocol !== 'https:') return null;
    if (isRootRelative && url.origin !== base.origin) return null;

    return {
      url: url.toString(),
      origin: url.origin,
      isExternal: url.origin !== base.origin,
      hasRuntimeValues,
    };
  } catch {
    return null;
  }
}

function ensureLink(documentRef: Document, rel: string, href: string, as?: string): void {
  const existing = [...documentRef.head.querySelectorAll<HTMLLinkElement>('link[data-forms-redirect-preload]')]
    .some(link => link.rel === rel && link.href === href);
  if (existing) return;

  const link = documentRef.createElement('link');
  link.rel = rel;
  link.href = href;
  link.dataset.formsRedirectPreload = 'true';
  if (as) link.as = as;
  if (rel === 'preconnect') link.crossOrigin = 'anonymous';
  documentRef.head.appendChild(link);
}

/**
 * Resolve and warm a destination. Dynamic URLs are never touched during the
 * early phase so answers/query parameters are not disclosed before submission.
 */
export function prepareRedirectDestination({
  template,
  variables = [],
  answers = {},
  phase,
  baseUrl,
  documentRef = typeof document !== 'undefined' ? document : undefined,
}: PrepareRedirectOptions): ResolvedRedirectDestination | null {
  if (!template || !documentRef) return null;
  if (phase === 'early' && redirectTemplateHasRuntimeValues(template)) return null;

  const destination = resolveRedirectDestination(template, variables, answers, baseUrl);
  if (!destination) return null;

  if (destination.isExternal) {
    const hostname = new URL(destination.url).hostname;
    ensureLink(documentRef, 'dns-prefetch', `//${hostname}`);
    ensureLink(documentRef, 'preconnect', destination.origin);
  }
  ensureLink(documentRef, 'prefetch', destination.url, 'document');
  return destination;
}
