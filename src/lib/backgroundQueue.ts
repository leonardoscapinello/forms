/**
 * Background Task Queue — fire-and-forget with automatic retry.
 *
 * External workflow nodes (WhatsApp, webhooks, analytics) enqueue tasks here
 * so they never block the form navigation flow. Each task gets up to 3 retry
 * attempts with exponential backoff (1s, 2s, 4s).
 *
 * Usage:
 *   import { enqueueTask } from '@/lib/backgroundQueue';
 *   enqueueTask(() => supabase.functions.invoke('whatsapp-send', { body }));
 */

interface QueuedTask {
  fn: () => Promise<any>;
  retries: number;
  maxRetries: number;
  label: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

const queue: QueuedTask[] = [];
let processing = false;

function scheduleRetry(task: QueuedTask, attempt: number) {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
  setTimeout(() => {
    queue.push(task);
    processQueue();
  }, delay);
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const task = queue.shift()!;
    try {
      await task.fn();
    } catch (err) {
      const attempt = task.maxRetries - task.retries + 1;
      if (task.retries > 0) {
        console.warn(`[BackgroundQueue] "${task.label}" failed (attempt ${attempt}/${task.maxRetries}), retrying…`);
        scheduleRetry({ ...task, retries: task.retries - 1 }, attempt);
      } else {
        // Silently drop — never block form flow
        console.warn(`[BackgroundQueue] "${task.label}" failed after ${task.maxRetries} attempts — dropped`);
      }
    }
  }

  processing = false;
}

/**
 * Enqueue a fire-and-forget task. It will execute ASAP without blocking the caller.
 * Failed tasks are automatically retried up to 3 times with exponential backoff.
 */
export function enqueueTask(fn: () => Promise<any>, label = 'task') {
  queue.push({ fn, retries: MAX_RETRIES - 1, maxRetries: MAX_RETRIES, label });
  // Use queueMicrotask so it runs after the current sync frame but doesn't block
  queueMicrotask(() => processQueue());
}
