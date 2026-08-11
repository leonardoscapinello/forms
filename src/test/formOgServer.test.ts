import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/form-og';

const ID = '92dbb7a6-270f-4a29-8b9b-e90cec5aaea1';

describe('form OG server endpoint', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('answers HEAD with the image contract without rendering a body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: ID,
      status: 'published',
      title: 'Pesquisa anual',
      preview: { fields: ['Nome'], buttonLabel: 'Continuar' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const response = await handler.fetch(new Request(
      `https://forms.example.com/api/form-og?id=${ID}`,
      { method: 'HEAD' },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toContain('s-maxage=300');
    expect(await response.text()).toBe('');
  });

  it('rejects malformed form identifiers before any upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler.fetch(new Request(
      'https://forms.example.com/api/form-og?id=not-a-form',
      { method: 'HEAD' },
    ));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
