import { describe, expect, it, vi } from 'vitest';
import {
  resolveWorkflowWaits,
  waitForAdjustableDuration,
  type PendingWorkflowWait,
  type WorkflowStepResult,
} from './workflowWait';

describe('workflow waits', () => {
  it('does not traverse or fire downstream work until each wait completes', async () => {
    const log: string[] = [];
    const firstWait: PendingWorkflowWait = { durationMs: 1000, resumeFromNodeId: 'wt-first' };
    const secondWait: PendingWorkflowWait = { durationMs: 2000, resumeFromNodeId: 'wt-second' };
    const initial: WorkflowStepResult = { nextNodeId: null, updatedAnswers: {}, pendingWait: firstWait };

    const result = await resolveWorkflowWaits(
      initial,
      async (nodeId, answers) => {
        log.push(`walk:${nodeId}`);
        if (nodeId === 'wt-first') {
          log.push('effect:between-waits');
          return { nextNodeId: null, updatedAnswers: answers, pendingWait: secondWait };
        }
        log.push('effect:after-second-wait');
        return { nextNodeId: 'end', updatedAnswers: answers };
      },
      async (pending) => {
        log.push(`wait:${pending.resumeFromNodeId}`);
        return {};
      },
    );

    expect(log).toEqual([
      'wait:wt-first',
      'walk:wt-first',
      'effect:between-waits',
      'wait:wt-second',
      'walk:wt-second',
      'effect:after-second-wait',
    ]);
    expect(result.nextNodeId).toBe('end');
  });

  it('recalculates the real deadline when time is reduced', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const startedAt = Date.now();
    const signal = { cancelled: false, reductionRequests: 0 };
    const promise = waitForAdjustableDuration({
      startedAt,
      durationMs: 10_000,
      reductionMs: 5_000,
      signal,
      pollIntervalMs: 50,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    signal.reductionRequests += 1;
    await vi.advanceTimersByTimeAsync(4_100);

    await expect(promise).resolves.toEqual({ skipped: false, effectiveDurationMs: 5_000 });
    vi.useRealTimers();
  });
});
