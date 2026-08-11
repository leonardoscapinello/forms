import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeWorkflowSideEffect,
  WorkflowSideEffectError,
} from './workflowSideEffect';

afterEach(() => {
  vi.useRealTimers();
});

describe('executeWorkflowSideEffect', () => {
  it('retries a failed operation and resolves only after its acknowledgement', async () => {
    vi.useFakeTimers();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ success: true });

    const pending = executeWorkflowSideEffect({
      label: 'o webhook',
      nodeId: 'int-1',
      operation,
      timeoutMs: 1_000,
      baseDelayMs: 10,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toEqual({ success: true });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('aborts timed-out attempts and returns a typed blocking error', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const operation = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });

    const pending = executeWorkflowSideEffect({
      label: 'a integração',
      nodeId: 'wa-1',
      operation,
      timeoutMs: 25,
      baseDelayMs: 5,
    });
    const rejection = pending.catch((error) => error);
    await vi.runAllTimersAsync();

    const error = await rejection;
    expect(error).toBeInstanceOf(WorkflowSideEffectError);
    expect(error).toMatchObject({
      name: 'WorkflowSideEffectError',
      nodeId: 'wa-1',
      attempts: 3,
    });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
