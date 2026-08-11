import { describe, expect, it } from 'vitest';
import { rejectUnsupportedHttpMethod } from '../../supabase/functions/_shared/httpMethod.ts';
import { readLimitedJsonObject } from '../../supabase/functions/_shared/limitedJsonBody.ts';

describe('public Edge HTTP method contracts', () => {
  it.each(['DELETE', 'PATCH', 'PUT'])('rejects %s on form-public-get with an Allow header', async (method) => {
    const response = rejectUnsupportedHttpMethod(
      new Request('https://forms.test/functions/v1/form-public-get', { method }),
      ['GET', 'POST', 'OPTIONS'],
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('GET, POST, OPTIONS');
    await expect(response?.json()).resolves.toEqual({ error: 'method_not_allowed' });
  });

  it.each(['GET', 'DELETE', 'PATCH'])('rejects %s on form-public-save before body parsing', (method) => {
    const response = rejectUnsupportedHttpMethod(
      new Request('https://forms.test/functions/v1/form-public-save', { method }),
      ['POST', 'OPTIONS'],
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('POST, OPTIONS');
  });

  it.each([
    ['GET', ['GET', 'POST', 'OPTIONS']],
    ['POST', ['GET', 'POST', 'OPTIONS']],
    ['OPTIONS', ['GET', 'POST', 'OPTIONS']],
    ['POST', ['POST', 'OPTIONS']],
    ['OPTIONS', ['POST', 'OPTIONS']],
  ])('accepts the declared %s contract', (method, allowed) => {
    expect(rejectUnsupportedHttpMethod(
      new Request('https://forms.test', { method }),
      allowed,
    )).toBeNull();
  });
});

describe('public Edge JSON body envelope', () => {
  it('rejects an oversized declared body before JSON parsing', async () => {
    const result = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
      headers: { 'content-length': '4097' },
      body: '{}',
    }), 4_096);

    expect(result.ok).toBe(false);
    if ('response' in result) {
      expect(result.response.status).toBe(413);
      await expect(result.response.json()).resolves.toEqual({ error: 'payload_too_large' });
    }
  });

  it('rejects an oversized streamed body and malformed JSON with explicit 4xx responses', async () => {
    const oversized = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(4_096) }),
    }), 4_096);
    expect(oversized.ok).toBe(false);
    if ('response' in oversized) expect(oversized.response.status).toBe(413);

    const malformed = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
      body: '{broken',
    }), 4_096);
    expect(malformed.ok).toBe(false);
    if ('response' in malformed) {
      expect(malformed.response.status).toBe(400);
      await expect(malformed.response.json()).resolves.toEqual({ error: 'invalid_json' });
    }
  });

  it('supports an explicitly allowed empty worker body without weakening 413/400 limits', async () => {
    const empty = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
    }), 1_024, { 'Cache-Control': 'no-store' }, { allowEmptyObject: true });
    expect(empty).toEqual({ ok: true, value: {} });

    const oversized = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
      headers: { 'content-length': '1025' },
      body: '{}',
    }), 1_024, {}, { allowEmptyObject: true });
    expect(oversized.ok).toBe(false);
    if ('response' in oversized) expect(oversized.response.status).toBe(413);

    const malformed = await readLimitedJsonObject(new Request('https://forms.test', {
      method: 'POST',
      body: '{not-json',
    }), 1_024, {}, { allowEmptyObject: true });
    expect(malformed.ok).toBe(false);
    if ('response' in malformed) expect(malformed.response.status).toBe(400);
  });
});
