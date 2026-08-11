import { describe, expect, it } from 'vitest';
import {
  acquireWorkflowExecutionGate,
  buildWorkflowExecutionNodeKey,
  getWorkflowExecutionDisposition,
} from '../../supabase/functions/_shared/workflowExecution.ts';

describe('workflow execution identity', () => {
  it('separates every analytics destination by node, platform and entry', () => {
    const first = buildWorkflowExecutionNodeKey({
      kind: 'analytics',
      nodeId: 'analytics/node',
      platform: 'meta_pixel',
      entryId: 'entry-a',
    });
    const otherEntry = buildWorkflowExecutionNodeKey({
      kind: 'analytics',
      nodeId: 'analytics/node',
      platform: 'meta_pixel',
      entryId: 'entry-b',
    });
    const otherPlatform = buildWorkflowExecutionNodeKey({
      kind: 'analytics',
      nodeId: 'analytics/node',
      platform: 'tiktok_pixel',
      entryId: 'entry-a',
    });

    expect(first).not.toBe(otherEntry);
    expect(first).not.toBe(otherPlatform);
    expect(first).toContain('node=value:analytics%2Fnode');
    expect(first).toContain('platform=value:meta_pixel');
    expect(first).toContain('entry=value:entry-a');
  });

  it('does not collide a missing optional part with a literal sentinel-like value', () => {
    const missing = buildWorkflowExecutionNodeKey({ kind: 'webhook', nodeId: 'node' });
    const literal = buildWorkflowExecutionNodeKey({
      kind: 'webhook',
      nodeId: 'node',
      platform: 'missing',
    });

    expect(missing).not.toBe(literal);
  });
});

describe('workflow execution claim disposition', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z');

  it('returns a completed result without reclaiming it', () => {
    expect(getWorkflowExecutionDisposition({
      status: 'delivered',
      lease_until: '2020-01-01T00:00:00.000Z',
    }, now)).toBe('delivered');
  });

  it('keeps an active processing lease exclusive', () => {
    expect(getWorkflowExecutionDisposition({
      status: 'processing',
      lease_until: '2026-08-10T12:00:01.000Z',
    }, now)).toBe('processing');
  });

  it.each([
    { status: 'processing', lease_until: '2026-08-10T11:59:59.000Z' },
    { status: 'processing', lease_until: null },
    { status: 'processing', lease_until: 'not-a-date' },
    { status: 'failed', lease_until: '2026-08-10T12:30:00.000Z' },
  ])('reclaims failed, expired or invalid leases: %o', (record) => {
    expect(getWorkflowExecutionDisposition(record, now)).toBe('reclaim');
  });
});

describe('workflow execution quota gate', () => {
  it.each([
    { state: 'delivered' as const, id: 'execution-1', result: { id: 'provider-1' } },
    { state: 'processing' as const, id: 'execution-1' },
  ])('does not consume quota for a $state retry', async (claim) => {
    let limitCalls = 0;
    let releaseCalls = 0;

    const result = await acquireWorkflowExecutionGate({
      enforceFireOnce: true,
      claimExecution: async () => claim,
      enforceLimits: async () => {
        limitCalls += 1;
        return null;
      },
      releaseClaim: async () => {
        releaseCalls += 1;
      },
    });

    expect(result.state).toBe(claim.state);
    expect(limitCalls).toBe(0);
    expect(releaseCalls).toBe(0);
  });

  it('releases a newly acquired lease when quota denies the attempt', async () => {
    const released: string[] = [];
    const limitedResponse = new Response('limited', { status: 429 });

    const result = await acquireWorkflowExecutionGate({
      enforceFireOnce: true,
      claimExecution: async () => ({
        state: 'claimed',
        id: 'execution-1',
        leaseUntil: '2026-08-11T12:00:00.000Z',
      }),
      enforceLimits: async () => limitedResponse,
      releaseClaim: async (claim, reason) => {
        released.push(`${claim.id}:${reason}`);
      },
    });

    expect(result).toEqual({ state: 'limited', response: limitedResponse });
    expect(released).toEqual(['execution-1:workflow_rate_limited']);
  });

  it('keeps repeatable nodes quota-controlled without creating a claim', async () => {
    let claimCalls = 0;
    const result = await acquireWorkflowExecutionGate({
      enforceFireOnce: false,
      claimExecution: async () => {
        claimCalls += 1;
        return { state: 'processing', id: 'unexpected' };
      },
      enforceLimits: async () => null,
      releaseClaim: async () => undefined,
    });

    expect(result).toEqual({ state: 'ready', claim: null });
    expect(claimCalls).toBe(0);
  });
});
