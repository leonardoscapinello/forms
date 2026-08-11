import { describe, expect, it } from 'vitest';
import { readLimitedRequestBody } from '../../supabase/functions/_shared/limitedRequestBody.ts';

describe('limited non-JSON request bodies', () => {
  it('rejects declared and streamed payloads above the byte limit', async () => {
    const declared = await readLimitedRequestBody(new Request('https://forms.test/upload', {
      method: 'POST',
      headers: { 'content-length': '11' },
      body: 'small',
    }), 10);
    expect(declared.ok).toBe(false);
    if ('response' in declared) expect(declared.response.status).toBe(413);

    const streamed = await readLimitedRequestBody(new Request('https://forms.test/upload', {
      method: 'POST',
      body: 'éééééé',
    }), 10);
    expect(streamed.ok).toBe(false);
    if ('response' in streamed) expect(streamed.response.status).toBe(413);
  });

  it('returns the exact bounded bytes', async () => {
    const result = await readLimitedRequestBody(new Request('https://forms.test/upload', {
      method: 'POST',
      body: 'arquivo',
    }), 16);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new TextDecoder().decode(result.value)).toBe('arquivo');
  });
});
