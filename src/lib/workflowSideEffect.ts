export const WORKFLOW_SIDE_EFFECT_ATTEMPTS = 3;
export const WORKFLOW_SIDE_EFFECT_TIMEOUT_MS = 12_000;
export const WORKFLOW_SIDE_EFFECT_BACKOFF_MS = 400;

export class WorkflowSideEffectError extends Error {
  readonly nodeId?: string;
  readonly attempts: number;

  constructor(label: string, attempts: number, nodeId?: string, cause?: unknown) {
    super(`Falha ao confirmar ${label} após ${attempts} tentativas.`);
    this.name = 'WorkflowSideEffectError';
    this.nodeId = nodeId;
    this.attempts = attempts;
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        configurable: true,
      });
    }
  }
}

export interface ExecuteWorkflowSideEffectOptions<T> {
  label: string;
  nodeId?: string;
  operation: (signal: AbortSignal, attempt: number) => Promise<T>;
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Runs a delivery operation as a blocking workflow step. A node is only
 * considered delivered when this promise resolves; timeout and downstream
 * errors are retried with bounded exponential backoff.
 */
export async function executeWorkflowSideEffect<T>({
  label,
  nodeId,
  operation,
  attempts = WORKFLOW_SIDE_EFFECT_ATTEMPTS,
  timeoutMs = WORKFLOW_SIDE_EFFECT_TIMEOUT_MS,
  baseDelayMs = WORKFLOW_SIDE_EFFECT_BACKOFF_MS,
}: ExecuteWorkflowSideEffectOptions<T>): Promise<T> {
  const boundedAttempts = Math.max(1, Math.floor(attempts));
  let lastError: unknown;

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    if (attempt > 1 && baseDelayMs > 0) {
      await wait(baseDelayMs * (2 ** (attempt - 2)));
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('workflow_side_effect_timeout'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(controller.signal, attempt), timeout]);
    } catch (error) {
      lastError = error;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  throw new WorkflowSideEffectError(label, boundedAttempts, nodeId, lastError);
}
