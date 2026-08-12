import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import formPage from '../../api/form-page';
import { requestOrigin } from '../../api/_lib/publicFormMetadata';

const FORM_ID = '92dbb7a6-270f-4a29-8b9b-e90cec5aaea1';
const SHELL = `<!doctype html><html lang="pt-BR"><head>
  <title>Forms</title><meta name="description" content="Base" />
</head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    id: FORM_ID,
    title: 'Captação Enterprise',
    description: 'Formulário de demonstração',
    status: 'published',
    updatedAt: '2026-08-10T12:00:00.000Z',
    brand: { productName: 'Forms', ownerName: 'Leonardo Scapinello' },
    preview: {
      pageTitle: 'Conte um pouco sobre você',
      fields: ['Nome', 'E-mail'],
      buttonLabel: 'Continuar',
      primaryColor: '#635BFF',
    },
    // This administrative-only value must never be copied to the HTML shell.
    completionWebhookUrl: 'https://secret.example.test/hook',
    ...overrides,
  };
}

describe('public form server shell', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'public-anon-key');
    vi.stubEnv('PUBLIC_APP_URL', '');
    vi.stubEnv('VITE_PUBLIC_APP_URL', '');
  });

  it('rejects an insecure configured production origin but allows localhost', () => {
    vi.stubEnv('PUBLIC_APP_URL', 'http://forms.example.test');
    expect(requestOrigin(new Request('https://deployment.example.test/api/form-page')))
      .toBe('https://deployment.example.test');

    vi.stubEnv('PUBLIC_APP_URL', 'http://127.0.0.1:8080');
    expect(requestOrigin(new Request('https://deployment.example.test/api/form-page')))
      .toBe('http://127.0.0.1:8080');
  });

  it('falls back to the canonical Pulse domain when no trusted request origin exists', () => {
    const invalidRequest = {
      get url() { throw new Error('unavailable request URL'); },
    } as unknown as Request;

    expect(requestOrigin(invalidRequest)).toBe('https://pulse.leonardoscapinello.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders metadata and only the brand loader before the client runtime', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/form-public-metadata')) {
        return Response.json(metadata());
      }
      if (url === 'https://forms.example.test/index.html') {
        return new Response(SHELL, { headers: { 'Content-Type': 'text/html' } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await formPage.fetch(new Request(
      `https://forms.example.test/api/form-page?id=${FORM_ID}`,
    ));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate=300');
    expect(response.headers.get('x-robots-tag')).not.toContain('noindex');
    expect(response.headers.get('x-forms-render-mode')).toBe('hybrid-shell-v1');
    expect(response.headers.get('server-timing')).toMatch(/metadata;dur=\d+\.\d, shell;dur=\d+\.\d, total;dur=\d+\.\d/);
    expect(html).toContain('<title>Captação Enterprise</title>');
    expect(html).toContain('property="og:image"');
    expect(html).toContain(`/api/form-og?id=${FORM_ID}`);
    expect(html).toContain('id="form-seo-jsonld"');
    expect(html).toContain('id="form-ssr-shell"');
    expect(html).toContain('data-form-boot-loader="true"');
    expect(html).toContain('form-boot-loader-mark');
    expect(html).toContain('prefers-reduced-motion:reduce');
    expect(html).not.toContain('Conte um pouco sobre você');
    expect(html).not.toContain('Continuar →');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('secret.example.test');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns an HTTP 404 shell with noindex when the form does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/form-public-metadata')) {
        return new Response('{"error":"not_found"}', { status: 404 });
      }
      return new Response(SHELL);
    }));

    const response = await formPage.fetch(new Request(
      `https://forms.example.test/api/form-page?id=${FORM_ID}`,
    ));
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(html).toContain('Formulário indisponível');
    expect(html).toContain('name="robots" content="noindex, nofollow, noarchive"');
  });

  it('fails closed when the SPA shell cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/functions/v1/form-public-metadata')) {
        return Response.json(metadata());
      }
      return new Response('unavailable', { status: 503 });
    }));

    const response = await formPage.fetch(new Request(
      `https://forms.example.test/api/form-page?id=${FORM_ID}`,
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('10');
  });

  it('rejects invalid identifiers and unsupported methods before any outbound call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const invalid = await formPage.fetch(new Request(
      'https://forms.example.test/api/form-page?id=not-a-uuid',
    ));
    const method = await formPage.fetch(new Request(
      `https://forms.example.test/api/form-page?id=${FORM_ID}`,
      { method: 'POST' },
    ));

    expect(invalid.status).toBe(400);
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, HEAD');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports a metadata-only HEAD response', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => (
      String(input).includes('/functions/v1/form-public-metadata')
        ? Response.json(metadata())
        : new Response(SHELL)
    )));

    const response = await formPage.fetch(new Request(
      `https://forms.example.test/api/form-page?id=${FORM_ID}`,
      { method: 'HEAD' },
    ));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});
