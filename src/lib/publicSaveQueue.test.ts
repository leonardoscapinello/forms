import { describe, expect, it, vi } from 'vitest';
import {
  clearDurablePublicSavesForForm,
  createDurablePublicSaveLane,
  enqueueDurablePublicSave,
  getDurablePublicSaves,
  persistDurablePublicSave,
  PUBLIC_SAVE_QUEUE_MAX_BYTES,
  PUBLIC_SAVE_QUEUE_MAX_ENTRIES,
  PUBLIC_SAVE_QUEUE_MAX_ENTRY_BYTES,
  PUBLIC_SAVE_QUEUE_STORAGE_KEY,
  PUBLIC_SAVE_QUEUE_TTL_MS,
  sendPublicSaveRequest,
  sendPublicSaveWithRetry,
  type PublicSaveRequest,
} from './publicSaveQueue';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const request: PublicSaveRequest = {
  token: 'signed-token',
  kind: 'response',
  action: 'upsert',
  onConflict: 'form_id,response_id',
  payload: { form_id: 'form', response_id: 'response', metadata: { status: 'complete' } },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('durable public save queue', () => {
  it('queues a completion before sending and removes it after acknowledgement', async () => {
    const storage = new MemoryStorage();
    const send = vi.fn(async () => {
      expect(getDurablePublicSaves(storage)).toHaveLength(1);
      return true;
    });

    await expect(persistDurablePublicSave('completion', request, { storage, send })).resolves.toEqual({
      delivered: true,
      queued: true,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(getDurablePublicSaves(storage)).toEqual([]);
  });

  it('retries failed delivery and leaves an offline completion queued', async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const send = vi.fn().mockResolvedValue(false);
    const promise = persistDurablePublicSave('completion', request, {
      storage,
      send,
      attempts: 3,
      baseDelayMs: 10,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ delivered: false, queued: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(getDurablePublicSaves(storage)).toHaveLength(1);
    vi.useRealTimers();
  });

  it('physically prunes stale and corrupt PII-bearing entries on the next read', () => {
    const storage = new MemoryStorage();
    storage.setItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY, JSON.stringify({
      stale: {
        id: 'stale',
        queuedAt: new Date(Date.now() - PUBLIC_SAVE_QUEUE_TTL_MS - 1).toISOString(),
        version: 'stale-version',
        request: { ...request, payload: { ...request.payload, email: 'pii@example.invalid' } },
      },
    }));

    expect(getDurablePublicSaves(storage)).toEqual([]);
    expect(storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).toBeNull();

    storage.setItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY, '{corrupt');
    expect(getDurablePublicSaves(storage)).toEqual([]);
    expect(storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).toBeNull();
  });

  it('caps the number of offline entries while retaining the newest leads', () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < PUBLIC_SAVE_QUEUE_MAX_ENTRIES + 5; index += 1) {
      enqueueDurablePublicSave(`response-${index}`, {
        ...request,
        payload: { ...request.payload, response_id: `response-${index}` },
      }, storage);
    }

    const queued = getDurablePublicSaves(storage);
    expect(queued).toHaveLength(PUBLIC_SAVE_QUEUE_MAX_ENTRIES);
    expect(queued.some((entry) => entry.id === `response-${PUBLIC_SAVE_QUEUE_MAX_ENTRIES + 4}`)).toBe(true);
    expect(queued.some((entry) => entry.id === 'response-0')).toBe(false);
  });

  it('rejects an oversized entry and keeps the serialized offline queue under its byte cap', () => {
    const storage = new MemoryStorage();
    expect(enqueueDurablePublicSave('oversized', {
      ...request,
      payload: { ...request.payload, answers: 'x'.repeat(PUBLIC_SAVE_QUEUE_MAX_ENTRY_BYTES) },
    }, storage)).toBe(false);
    expect(getDurablePublicSaves(storage)).toEqual([]);

    for (let index = 0; index < PUBLIC_SAVE_QUEUE_MAX_ENTRIES; index += 1) {
      enqueueDurablePublicSave(`sized-${index}`, {
        ...request,
        payload: { ...request.payload, response_id: `sized-${index}`, answers: 'x'.repeat(240_000) },
      }, storage);
    }
    const raw = storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY) || '';
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(PUBLIC_SAVE_QUEUE_MAX_BYTES);
    expect(getDurablePublicSaves(storage).length).toBeLessThan(PUBLIC_SAVE_QUEUE_MAX_ENTRIES);
  });

  it('persists only delivery-critical response data and removes a form queue on rejection', () => {
    const storage = new MemoryStorage();
    enqueueDurablePublicSave('minimal', {
      ...request,
      payload: {
        ...request.payload,
        answers: { field: 'answer required for offline delivery' },
        metadata: {
          status: 'partial',
          landed_at: '2026-08-10T12:00:00.000Z',
          last_page_index: 0,
          user_agent: 'unnecessary-private-user-agent',
          referrer: 'https://private.example/path',
          response_hash: 'redundant-hash',
          query_params: { access_token: 'must-not-be-persisted' },
        },
        arbitrary_debug_data: 'must-not-be-persisted-either',
      },
    }, storage);

    const raw = storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY) || '';
    expect(raw).toContain('answer required for offline delivery');
    expect(raw).not.toContain('unnecessary-private-user-agent');
    expect(raw).not.toContain('private.example');
    expect(raw).not.toContain('access_token');
    expect(raw).not.toContain('redundant-hash');
    expect(raw).not.toContain('arbitrary_debug_data');

    clearDurablePublicSavesForForm('form', storage);
    expect(storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).toBeNull();
  });

  it('migrates a live legacy queue to sessionStorage and erases localStorage', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY, JSON.stringify({
      legacy: {
        id: 'legacy',
        queuedAt: new Date().toISOString(),
        version: 'legacy-version',
        request: {
          ...request,
          payload: {
            ...request.payload,
            answers: { email: 'lead@example.invalid' },
            metadata: { status: 'partial', referrer: 'https://private.example' },
          },
        },
      },
    }));

    expect(getDurablePublicSaves()).toHaveLength(1);
    expect(localStorage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).toContain('lead@example.invalid');
    expect(sessionStorage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY)).not.toContain('private.example');
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('stops retrying as soon as a delivery succeeds', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(sendPublicSaveWithRetry(request, { send, attempts: 3, baseDelayMs: 0 })).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('accepts the server ACK while external delivery is pending in the durable outbox', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      responseSaved: true,
      deliveryPending: true,
      deliveries: { completion_webhook: 'queued' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(sendPublicSaveRequest(request, { fetchImpl })).resolves.toBe(true);
  });

  it('keeps retrying when the server could not durably enqueue a configured delivery', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false,
      responseSaved: true,
      error: 'completion_delivery_enqueue_failed',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(sendPublicSaveRequest(request, { fetchImpl })).resolves.toBe(false);
  });

  it.each([
    ['an HTML proxy response', '<html>temporarily unavailable</html>', 'text/html'],
    ['an incomplete JSON response', JSON.stringify({ responseSaved: true }), 'application/json'],
  ])('does not discard a queued lead after %s without an explicit ACK', async (_label, body, contentType) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType },
    }));

    await expect(sendPublicSaveRequest(request, { fetchImpl })).resolves.toBe(false);
  });

  it('serializes saves and keeps the newest payload durable while an older request is in flight', async () => {
    const storage = new MemoryStorage();
    const firstDelivery = deferred<boolean>();
    const secondDelivery = deferred<boolean>();
    const send = vi.fn()
      .mockImplementationOnce(() => firstDelivery.promise)
      .mockImplementationOnce(() => secondDelivery.promise);
    const lane = createDurablePublicSaveLane('response', { storage });
    const partial = {
      ...request,
      payload: { ...request.payload, answers: { name: 'Parcial' }, metadata: { status: 'partial' } },
    };
    const complete = {
      ...request,
      payload: { ...request.payload, answers: { name: 'Completo' }, metadata: { status: 'complete' } },
    };

    const partialResult = lane.persist(partial, { send, attempts: 1 });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const completeResult = lane.persist(complete, { send, attempts: 1 });

    expect(send).toHaveBeenCalledTimes(1);
    expect(getDurablePublicSaves(storage)).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          payload: expect.objectContaining({
            answers: { name: 'Completo' },
            metadata: { status: 'complete' },
            client_save_sequence: expect.any(Number),
          }),
        }),
      }),
    ]);

    firstDelivery.resolve(true);
    await partialResult;
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    // The acknowledgement for the older partial must not remove the complete
    // payload that replaced it while the request was in flight.
    expect(getDurablePublicSaves(storage)).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          payload: expect.objectContaining({
            answers: { name: 'Completo' },
            metadata: { status: 'complete' },
            client_save_sequence: expect.any(Number),
          }),
        }),
      }),
    ]);

    const partialSequence = send.mock.calls[0][0].payload.client_save_sequence as number;
    const completeSequence = getDurablePublicSaves(storage)[0].request.payload.client_save_sequence as number;
    expect(Number.isSafeInteger(partialSequence)).toBe(true);
    expect(completeSequence).toBeGreaterThan(partialSequence);

    secondDelivery.resolve(true);
    await expect(completeResult).resolves.toEqual({ delivered: true, queued: true });
    expect(getDurablePublicSaves(storage)).toEqual([]);
  });

  it('preserves idempotent save ordering when a tab reload recreates the lane', async () => {
    const storage = new MemoryStorage();
    const offline = vi.fn().mockResolvedValue(false);
    const firstLane = createDurablePublicSaveLane('response', { storage });
    await firstLane.persist({
      ...request,
      payload: { ...request.payload, answers: { name: 'Antes do reload' } },
    }, { send: offline, attempts: 1 });
    const firstSequence = getDurablePublicSaves(storage)[0].request.payload.client_save_sequence;

    const reloadedLane = createDurablePublicSaveLane('response', { storage });
    await reloadedLane.persist({
      ...request,
      payload: { ...request.payload, answers: { name: 'Depois do reload' } },
    }, { send: offline, attempts: 1 });
    const reloaded = getDurablePublicSaves(storage)[0].request;

    expect(reloaded.payload.answers).toEqual({ name: 'Depois do reload' });
    expect(reloaded.payload.client_save_sequence).toBeGreaterThan(firstSequence);
  });
});
