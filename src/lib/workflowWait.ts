import type { WaitFeedbackConfig } from '@/types/form';

export interface PendingWorkflowWait {
  durationMs: number;
  feedback?: WaitFeedbackConfig;
  /** Resume traversal from the wait node only after its delay completes. */
  resumeFromNodeId: string;
}

export interface WorkflowStepResult<TAnswers extends Record<string, any> = Record<string, any>> {
  nextNodeId: string | null;
  updatedAnswers: TAnswers;
  pendingWait?: PendingWorkflowWait;
  /** A URL jump is terminal and completes the response before navigating. */
  redirectUrlTemplate?: string;
}

export interface WaitResolution {
  /** A skip action may override the workflow destination. */
  targetNodeId?: string;
}

/**
 * Resolve every wait in a path in sequence. Traversal after a wait is not
 * invoked until that wait resolves, so downstream side effects cannot run early.
 */
export async function resolveWorkflowWaits<TAnswers extends Record<string, any>>(
  initialResult: WorkflowStepResult<TAnswers>,
  walkFrom: (nodeId: string, answers: TAnswers) => Promise<WorkflowStepResult<TAnswers>>,
  waitForNode: (pending: PendingWorkflowWait) => Promise<WaitResolution>,
  maxWaits = 50,
): Promise<WorkflowStepResult<TAnswers>> {
  let result = initialResult;

  for (let count = 0; result.pendingWait && count < maxWaits; count++) {
    const pending = result.pendingWait;
    const resolution = await waitForNode(pending);
    if (resolution.targetNodeId) {
      return {
        nextNodeId: resolution.targetNodeId,
        updatedAnswers: result.updatedAnswers,
      };
    }
    result = await walkFrom(pending.resumeFromNodeId, result.updatedAnswers);
  }

  if (result.pendingWait) {
    throw new Error(`Workflow exceeded the limit of ${maxWaits} sequential wait nodes`);
  }
  return result;
}

export interface AdjustableWaitSignal {
  cancelled: boolean;
  /** UI increments this counter; every request subtracts reductionMs. */
  reductionRequests: number;
}

interface AdjustableWaitOptions {
  startedAt: number;
  durationMs: number;
  reductionMs: number;
  signal: AdjustableWaitSignal;
  onTick?: (remainingMs: number, effectiveDurationMs: number) => void;
  onDurationChange?: (effectiveDurationMs: number) => void;
  pollIntervalMs?: number;
  now?: () => number;
}

export interface AdjustableWaitResult {
  skipped: boolean;
  effectiveDurationMs: number;
}

/** A deadline-based wait whose timer reacts immediately to duration reductions. */
export function waitForAdjustableDuration({
  startedAt,
  durationMs,
  reductionMs,
  signal,
  onTick,
  onDurationChange,
  pollIntervalMs = 50,
  now = Date.now,
}: AdjustableWaitOptions): Promise<AdjustableWaitResult> {
  let effectiveDurationMs = Math.max(0, durationMs);
  let consumedReductions = 0;

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (skipped: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ skipped, effectiveDurationMs });
    };

    const tick = () => {
      if (signal.cancelled) {
        finish(true);
        return;
      }

      const requestedReductions = Math.max(0, signal.reductionRequests || 0);
      if (requestedReductions > consumedReductions) {
        const newRequests = requestedReductions - consumedReductions;
        consumedReductions = requestedReductions;
        effectiveDurationMs = Math.max(0, effectiveDurationMs - reductionMs * newRequests);
        onDurationChange?.(effectiveDurationMs);
      }

      const remainingMs = Math.max(0, effectiveDurationMs - (now() - startedAt));
      onTick?.(remainingMs, effectiveDurationMs);
      if (remainingMs <= 0) {
        finish(false);
        return;
      }

      timer = setTimeout(tick, Math.min(pollIntervalMs, remainingMs));
    };

    tick();
  });
}
