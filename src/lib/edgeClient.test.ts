import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeEdge } from './edgeClient';

afterEach(() => vi.unstubAllGlobals());

describe('invokeEdge', () => {
  it('returns parsed data for a successful edge response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeEdge<{ success: boolean }>('health-check', { value: 1 });

    expect(result).toEqual({ data: { success: true }, error: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('normalizes edge and network failures without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'blocked' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })));
    const rejected = await invokeEdge('health-check', {});
    expect(rejected.error?.message).toBe('blocked');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const offline = await invokeEdge('health-check', {});
    expect(offline).toEqual({ data: null, error: expect.objectContaining({ message: 'offline' }) });
  });
});
