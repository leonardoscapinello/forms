import type { PublicFormMetadata } from '../../src/lib/formSeo.js';
import {
  readResponseJsonLimited,
  readResponseTextLimited,
} from '../../supabase/functions/_shared/integrationReliability.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serverEnvironment(): Record<string, string | undefined> {
  return (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env ?? {};
}

export class MetadataFetchError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function validFormId(value: string | null): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function requestOrigin(request: Request): string {
  const environment = serverEnvironment();
  const configured = environment.PUBLIC_APP_URL || environment.VITE_PUBLIC_APP_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      const localHttp = parsed.protocol === 'http:'
        && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      if ((parsed.protocol === 'https:' || localHttp) && !parsed.username && !parsed.password) return parsed.origin;
    } catch {
      // Fall through to the deployment's trusted request URL.
    }
  }
  try {
    const parsed = new URL(request.url);
    const localHttp = parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol === 'https:' || localHttp) && !parsed.username && !parsed.password) return parsed.origin;
  } catch {
    // Fall through to the canonical production origin.
  }
  return 'https://forms-olive-three.vercel.app';
}

function supabaseConfiguration() {
  const environment = serverEnvironment();
  const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL;
  const key = environment.SUPABASE_ANON_KEY
    || environment.VITE_SUPABASE_PUBLISHABLE_KEY
    || environment.VITE_SUPABASE_ANON_KEY;
  if (!url) throw new MetadataFetchError('Supabase URL is not configured', 503);
  return { url: url.replace(/\/+$/, ''), key };
}

export async function fetchPublicFormMetadata(request: Request, formId: string): Promise<PublicFormMetadata> {
  const { url, key } = supabaseConfiguration();
  const endpoint = `${url}/functions/v1/form-public-metadata?id=${encodeURIComponent(formId)}`;
  const headers = new Headers({ Accept: 'application/json' });
  if (key) {
    headers.set('apikey', key);
    headers.set('authorization', `Bearer ${key}`);
  }
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) headers.set('x-forwarded-for', forwarded.split(',')[0].trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new MetadataFetchError(
        response.status === 404 ? 'Form not found' : 'Unable to load form metadata',
        response.status === 404 ? 404 : 503,
      );
    }
    const metadata = await readResponseJsonLimited<PublicFormMetadata>(response, 64 * 1024);
    if (!metadata || metadata.id !== formId) throw new MetadataFetchError('Invalid metadata response', 503);
    return metadata;
  } catch (error) {
    if (error instanceof MetadataFetchError) throw error;
    throw new MetadataFetchError('Unable to load form metadata', 503);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSpaShell(request: Request): Promise<string> {
  const url = new URL('/index.html', request.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'x-form-ssr-shell': '1' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`SPA shell returned ${response.status}`);
    return await readResponseTextLimited(response, 2 * 1024 * 1024);
  } finally {
    clearTimeout(timeout);
  }
}
