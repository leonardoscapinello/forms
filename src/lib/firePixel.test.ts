import { afterEach, describe, expect, it, vi } from 'vitest';
import { firePixelDualBlocking, fireWebhookWithResponse } from './firePixel';

const webhookOptions = {
  platform: 'webhook',
  eventName: 'webhook_fired',
  eventId: 'event-1',
  formId: '92dbb7a6-270f-4a29-8b9b-e90cec5aaea1',
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fireWebhookWithResponse', () => {
  it('retries downstream HTTP failures returned by the edge function', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        webhookResponseBody: { leadId: 'lead-123' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fireWebhookWithResponse(webhookOptions);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ leadId: 'lead-123' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws a blocking workflow error after all three delivery attempts fail', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 502 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = fireWebhookWithResponse(webhookOptions);
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'WorkflowSideEffectError',
      attempts: 3,
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not treat a 202 processing lease as a delivery acknowledgement', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, processing: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, deduplicated: true, webhookResponseBody: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = fireWebhookWithResponse(webhookOptions);
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('firePixelDualBlocking', () => {
  it('continues an authorized workflow while reporting an unavailable provider as not fired', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        analyticsDelivered: false,
        analyticsDeliveryStatus: 'skipped',
        workflowProof: 'opaque-proof',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onFired = vi.fn();

    await expect(firePixelDualBlocking({
      ...webhookOptions,
      platform: 'meta_pixel',
      nodeId: 'analytics-1',
      entryId: 'entry-1',
      onFired,
    })).resolves.toMatchObject({
      analyticsDelivered: false,
      analyticsDeliveryStatus: 'skipped',
      workflowProof: 'opaque-proof',
    });
    expect(onFired).toHaveBeenCalledWith(expect.objectContaining({
      fired_server: false,
    }));
  });
});
