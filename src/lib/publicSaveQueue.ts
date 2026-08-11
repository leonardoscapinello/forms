export interface PublicSaveRequest {
  token?: string;
  kind: 'response' | 'session' | 'event';
  action: 'insert' | 'upsert' | 'update';
  payload: Record<string, any>;
  onConflict?: string;
  match?: Record<string, any>;
}

interface QueuedPublicSave {
  id: string;
  queuedAt: string;
  queuedAtOrder?: number;
  request: PublicSaveRequest;
  version?: string;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  send?: (request: PublicSaveRequest) => Promise<boolean>;
}

export interface DurablePublicSaveLane {
  persist: (
    request: PublicSaveRequest,
    options?: RetryOptions,
  ) => Promise<{ delivered: boolean; queued: boolean }>;
  whenIdle: () => Promise<void>;
}

export const PUBLIC_SAVE_QUEUE_STORAGE_KEY = 'forms_pending_public_saves_v1';
export const PUBLIC_SAVE_QUEUE_TTL_MS = 2 * 60 * 60 * 1_000;
export const PUBLIC_SAVE_QUEUE_MAX_ENTRIES = 5;
export const PUBLIC_SAVE_QUEUE_MAX_BYTES = 1_000_000;
export const PUBLIC_SAVE_QUEUE_MAX_ENTRY_BYTES = 480_000;

const VALID_KINDS = new Set<PublicSaveRequest['kind']>(['response', 'session', 'event']);
const VALID_ACTIONS = new Set<PublicSaveRequest['action']>(['insert', 'upsert', 'update']);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function minimizeQueuedRequest(request: PublicSaveRequest): PublicSaveRequest {
  if (request.kind !== 'response') return request;
  const metadata = isPlainObject(request.payload.metadata)
    ? Object.fromEntries([
      'status',
      'landed_at',
      'last_page_index',
    ].filter((key) => request.payload.metadata[key] !== undefined)
      .map((key) => [key, request.payload.metadata[key]]))
    : {};
  const payload = Object.fromEntries([
    'form_id',
    'response_id',
    'session_id',
    'answers',
    'pages_visited',
    'total_time_ms',
    'completion_time_on_page_ms',
    'client_save_sequence',
  ].filter((key) => request.payload[key] !== undefined)
    .map((key) => [key, request.payload[key]]));
  payload.metadata = metadata;
  return { ...request, payload };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidQueuedRequest(value: unknown): value is PublicSaveRequest {
  if (!isPlainObject(value)
    || !VALID_KINDS.has(value.kind as PublicSaveRequest['kind'])
    || !VALID_ACTIONS.has(value.action as PublicSaveRequest['action'])
    || !isPlainObject(value.payload)) return false;
  if (value.token !== undefined
    && (typeof value.token !== 'string' || value.token.length > 16_384)) return false;
  if (value.onConflict !== undefined && typeof value.onConflict !== 'string') return false;
  return value.match === undefined || isPlainObject(value.match);
}

function sanitizeQueue(
  value: unknown,
  now = Date.now(),
): Record<string, QueuedPublicSave> {
  if (!isPlainObject(value)) return {};

  const candidates: Array<{
    key: string;
    entry: QueuedPublicSave;
    queuedAtMs: number;
    order: number;
    sourceIndex: number;
  }> = [];

  Object.entries(value).forEach(([key, rawEntry], sourceIndex) => {
    if (!isPlainObject(rawEntry)
      || rawEntry.id !== key
      || typeof rawEntry.queuedAt !== 'string'
      || !isValidQueuedRequest(rawEntry.request)
      || (rawEntry.version !== undefined && typeof rawEntry.version !== 'string')) return;

    const queuedAtMs = Date.parse(rawEntry.queuedAt);
    if (!Number.isFinite(queuedAtMs)
      || queuedAtMs > now
      || now - queuedAtMs > PUBLIC_SAVE_QUEUE_TTL_MS) return;

    const entry = {
      ...(rawEntry as unknown as QueuedPublicSave),
      // User agent, referrer, response hashes and raw query parameter maps are
      // not required to retry a lead. Strip them from old and new queues.
      request: minimizeQueuedRequest(rawEntry.request as PublicSaveRequest),
    };
    let serialized = '';
    try { serialized = JSON.stringify(entry); } catch { return; }
    if (utf8Bytes(serialized) > PUBLIC_SAVE_QUEUE_MAX_ENTRY_BYTES) return;

    const queuedAtOrder = typeof entry.queuedAtOrder === 'number'
      && Number.isFinite(entry.queuedAtOrder)
      ? entry.queuedAtOrder
      : queuedAtMs;
    candidates.push({ key, entry, queuedAtMs, order: queuedAtOrder, sourceIndex });
  });

  // Preserve the newest recoverable leads when either privacy cap is reached.
  candidates.sort((left, right) => right.order - left.order
    || right.queuedAtMs - left.queuedAtMs
    || right.sourceIndex - left.sourceIndex);

  const sanitized: Record<string, QueuedPublicSave> = {};
  for (const candidate of candidates) {
    if (Object.keys(sanitized).length >= PUBLIC_SAVE_QUEUE_MAX_ENTRIES) break;
    const next = { ...sanitized, [candidate.key]: candidate.entry };
    if (utf8Bytes(JSON.stringify(next)) > PUBLIC_SAVE_QUEUE_MAX_BYTES) continue;
    sanitized[candidate.key] = candidate.entry;
  }
  return sanitized;
}

function migrateLegacyLocalQueue(session: Storage, local: Storage): void {
  if (session === local) return;
  try {
    const legacyRaw = local.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY);
    if (!legacyRaw) return;
    const legacy = sanitizeQueue(JSON.parse(legacyRaw));
    let current: Record<string, QueuedPublicSave> = {};
    const currentRaw = session.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY);
    if (currentRaw) current = sanitizeQueue(JSON.parse(currentRaw));
    persistQueue({ ...legacy, ...current }, session);
  } catch {
    // Corrupt legacy data is erased below rather than retained with PII.
  } finally {
    try { local.removeItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY); } catch { /* blocked */ }
  }
}

function defaultStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const session = window.sessionStorage;
    migrateLegacyLocalQueue(session, window.localStorage);
    return session;
  } catch {
    // Privacy-safe failure mode: never fall back to durable localStorage.
    try { window.localStorage.removeItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY); } catch { /* blocked */ }
    return null;
  }
}

function persistQueue(
  queue: Record<string, QueuedPublicSave>,
  storage: Storage | null = defaultStorage(),
): { written: boolean; queue: Record<string, QueuedPublicSave> } {
  if (!storage) return { written: false, queue: {} };
  const sanitized = sanitizeQueue(queue);
  try {
    if (Object.keys(sanitized).length === 0) storage.removeItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY);
    else storage.setItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY, JSON.stringify(sanitized));
    return { written: true, queue: sanitized };
  } catch {
    return { written: false, queue: sanitized };
  }
}

function readQueue(storage: Storage | null = defaultStorage()): Record<string, QueuedPublicSave> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY);
    if (!raw) return {};
    const sanitized = sanitizeQueue(JSON.parse(raw));
    if (Object.keys(sanitized).length === 0) {
      storage.removeItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY);
    } else {
      const normalized = JSON.stringify(sanitized);
      if (normalized !== raw) storage.setItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY, normalized);
    }
    return sanitized;
  } catch {
    // Physical cleanup happens on the next application visit/read because no
    // browser code can run while the application is closed.
    try { storage.removeItem(PUBLIC_SAVE_QUEUE_STORAGE_KEY); } catch { /* storage may be blocked */ }
    return {};
  }
}

function createQueueVersion(): string {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function createQueueOrder(): number {
  try {
    if (typeof performance !== 'undefined'
      && Number.isFinite(performance.timeOrigin)
      && typeof performance.now === 'function') {
      return performance.timeOrigin + performance.now();
    }
  } catch { /* fall back to the wall clock */ }
  return Date.now();
}

function readClientSaveSequence(request: PublicSaveRequest | undefined): number {
  const value = request?.payload?.client_save_sequence;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function currentEpochMicroseconds(): number {
  const epochMilliseconds = typeof performance !== 'undefined'
    && Number.isFinite(performance.timeOrigin)
    && typeof performance.now === 'function'
    ? performance.timeOrigin + performance.now()
    : Date.now();
  return Math.floor(epochMilliseconds * 1000);
}

function queueEntryIdentity(entry: QueuedPublicSave): string {
  return entry.version || `${entry.queuedAt}:${JSON.stringify(entry.request)}`;
}

function enqueueDurablePublicSaveEntry(
  id: string,
  request: PublicSaveRequest,
  storage: Storage | null,
): { queued: boolean; entry: QueuedPublicSave } {
  const queue = readQueue(storage);
  const entry: QueuedPublicSave = {
    id,
    request: minimizeQueuedRequest(request),
    queuedAt: new Date().toISOString(),
    queuedAtOrder: createQueueOrder(),
    version: createQueueVersion(),
  };
  queue[id] = entry;
  const persisted = persistQueue(queue, storage);
  const current = persisted.queue[id];
  return {
    queued: persisted.written
      && !!current
      && queueEntryIdentity(current) === queueEntryIdentity(entry),
    entry,
  };
}

export function enqueueDurablePublicSave(
  id: string,
  request: PublicSaveRequest,
  storage: Storage | null = defaultStorage(),
): boolean {
  return enqueueDurablePublicSaveEntry(id, request, storage).queued;
}

export function removeDurablePublicSave(
  id: string,
  storage: Storage | null = defaultStorage(),
): void {
  const queue = readQueue(storage);
  if (!(id in queue)) return;
  delete queue[id];
  persistQueue(queue, storage);
}

function removeDurablePublicSaveVersion(
  id: string,
  expectedIdentity: string,
  storage: Storage | null = defaultStorage(),
): void {
  const queue = readQueue(storage);
  const current = queue[id];
  if (!current || queueEntryIdentity(current) !== expectedIdentity) return;
  delete queue[id];
  persistQueue(queue, storage);
}

export function getDurablePublicSaves(
  storage: Storage | null = defaultStorage(),
): QueuedPublicSave[] {
  return Object.values(readQueue(storage));
}

export function clearDurablePublicSavesForForm(
  formId: string,
  storage: Storage | null = defaultStorage(),
): void {
  const queue = readQueue(storage);
  let changed = false;
  for (const [id, entry] of Object.entries(queue)) {
    if (entry.request.payload.form_id !== formId) continue;
    delete queue[id];
    changed = true;
  }
  if (changed) persistQueue(queue, storage);
}

export async function sendPublicSaveRequest(
  request: PublicSaveRequest,
  options: { keepalive?: boolean; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) return false;

  const controller = options.keepalive ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
    : null;

  try {
    const response = await (options.fetchImpl || fetch)(`${supabaseUrl}/functions/v1/form-public-save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(request),
      keepalive: options.keepalive,
      signal: controller?.signal,
    });
    const data = await response.json().catch(() => null);
    // The server ACKs after the canonical response and its outbox jobs are
    // durable. External delivery may still be pending and is retried server-side.
    // Only a non-2xx/enqueue failure remains in the browser queue.
    return response.ok && data?.success === true;
  } catch {
    return false;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

export async function sendPublicSaveWithRetry(
  request: PublicSaveRequest,
  { attempts = 3, baseDelayMs = 250, send = sendPublicSaveRequest }: RetryOptions = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await send(request)) return true;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  return false;
}

/**
 * Queue first, then deliver. A tab close at any point leaves a recoverable copy.
 */
export async function persistDurablePublicSave(
  id: string,
  request: PublicSaveRequest,
  options: RetryOptions & { storage?: Storage | null } = {},
): Promise<{ delivered: boolean; queued: boolean }> {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const { queued, entry } = enqueueDurablePublicSaveEntry(id, request, storage);
  const delivered = await sendPublicSaveWithRetry(request, options);
  // A slower acknowledgement for an older payload must never delete a newer
  // payload that has since replaced it under the same queue key.
  if (delivered) removeDurablePublicSaveVersion(id, queueEntryIdentity(entry), storage);
  return { delivered, queued };
}


/**
 * A per-response lane queues every payload synchronously, then sends payloads
 * strictly in order. The latest queued payload therefore survives a tab close,
 * while a slow partial save cannot overtake a newer partial or completion.
 */
export function createDurablePublicSaveLane(
  id: string,
  { storage: configuredStorage }: { storage?: Storage | null } = {},
): DurablePublicSaveLane {
  const storage = configuredStorage === undefined ? defaultStorage() : configuredStorage;
  let chain: Promise<void> = Promise.resolve();
  let lastClientSaveSequence = readClientSaveSequence(readQueue(storage)[id]?.request);

  const prepareRequest = (request: PublicSaveRequest): PublicSaveRequest => {
    if (request.kind !== 'response' || request.action !== 'upsert') return request;
    // Epoch microseconds are comparable across reloads; the local increment
    // makes consecutive saves strictly ordered even inside the same clock tick.
    // The latest queued marker is reused after a reload while an older request
    // may still be completing server-side.
    lastClientSaveSequence = Math.max(
      lastClientSaveSequence + 1,
      readClientSaveSequence(request),
      currentEpochMicroseconds(),
    );
    return {
      ...request,
      payload: {
        ...request.payload,
        client_save_sequence: lastClientSaveSequence,
      },
    };
  };

  return {
    persist(request, options = {}) {
      const orderedRequest = prepareRequest(request);
      const { queued, entry } = enqueueDurablePublicSaveEntry(id, orderedRequest, storage);
      const delivery = chain.then(async () => {
        const delivered = await sendPublicSaveWithRetry(orderedRequest, options);
        if (delivered) removeDurablePublicSaveVersion(id, queueEntryIdentity(entry), storage);
        return { delivered, queued };
      });
      chain = delivery.then(() => undefined, () => undefined);
      return delivery;
    },
    whenIdle() {
      return chain;
    },
  };
}

let flushInFlight: Promise<void> | null = null;

export function flushDurablePublicSaves(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    for (const entry of getDurablePublicSaves()) {
      const delivered = await sendPublicSaveWithRetry(entry.request, { attempts: 2 });
      if (delivered) removeDurablePublicSaveVersion(entry.id, queueEntryIdentity(entry));
    }
  })().finally(() => { flushInFlight = null; });
  return flushInFlight;
}

/** Best-effort last chance for queued saves while the document is unloading. */
export function sendDurablePublicSavesKeepalive(): void {
  for (const entry of getDurablePublicSaves()) {
    void sendPublicSaveRequest(entry.request, { keepalive: true }).then((delivered) => {
      if (delivered) removeDurablePublicSaveVersion(entry.id, queueEntryIdentity(entry));
    });
  }
}
