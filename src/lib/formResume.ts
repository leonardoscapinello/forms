export interface StoredFormResumeIdentity {
  /** Opaque, short-lived bearer credential. No answers or raw identifiers. */
  submissionToken: string;
}

export const FORM_RESUME_STORAGE_PREFIX = 'form_resume_';
export const FORM_RESUME_TTL_MS = 2 * 60 * 60 * 1_000;
export const FORM_RESUME_MAX_ENTRIES = 3;
export const FORM_RESUME_MAX_BYTES = 64_000;
export const FORM_RESUME_MAX_ENTRY_BYTES = 20_000;

export function formResumeStorageKey(formId: string): string {
  return `${FORM_RESUME_STORAGE_PREFIX}${formId}`;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function serializeStoredResume(submissionToken: string, updatedAtMs: number): string {
  return JSON.stringify({
    submissionToken,
    updatedAt: new Date(updatedAtMs).toISOString(),
  });
}

function parseStoredResume(
  raw: string,
  now: number,
): { identity: StoredFormResumeIdentity; updatedAtMs: number; normalized: string } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const submissionToken = parsed.submissionToken;
    const updatedAtMs = typeof parsed.updatedAt === 'string' ? Date.parse(parsed.updatedAt) : Number.NaN;
    const valid = typeof submissionToken === 'string'
      && submissionToken.length >= 20
      && submissionToken.length <= 16_384
      && Number.isFinite(updatedAtMs)
      && updatedAtMs <= now
      && now - updatedAtMs <= FORM_RESUME_TTL_MS;
    return valid
      ? {
        identity: { submissionToken },
        updatedAtMs,
        // Whitelisting on every read physically removes legacy answers, raw
        // response/session IDs, query parameters and any other local PII.
        normalized: serializeStoredResume(submissionToken, updatedAtMs),
      }
      : null;
  } catch {
    return null;
  }
}

function ownedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(FORM_RESUME_STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

/**
 * Moves only a valid opaque credential into sessionStorage and immediately
 * erases legacy localStorage records. Full answers from the previous format
 * are deliberately never copied.
 */
function migrateLegacyLocalResumes(session: Storage, local: Storage, now: number): void {
  if (session === local) return;
  try {
    for (const key of ownedKeys(local)) {
      const raw = local.getItem(key);
      const candidate = raw ? parseStoredResume(raw, now) : null;
      if (candidate) {
        const currentRaw = session.getItem(key);
        const current = currentRaw ? parseStoredResume(currentRaw, now) : null;
        if (!current || candidate.updatedAtMs > current.updatedAtMs) {
          session.setItem(key, candidate.normalized);
        }
      }
      local.removeItem(key);
    }
  } catch {
    // Either storage can be blocked. The normal session-only path still works.
  }
}

function defaultStorage(now = Date.now()): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    const session = window.sessionStorage;
    migrateLegacyLocalResumes(session, window.localStorage, now);
    return session;
  } catch {
    // If sessionStorage is blocked, do not fall back to durable plaintext.
    try {
      for (const key of ownedKeys(window.localStorage)) window.localStorage.removeItem(key);
    } catch { /* both stores may be blocked */ }
    return null;
  }
}

/**
 * Prunes only application-owned resume keys and normalizes valid records to
 * the token-only schema. sessionStorage is the default privacy boundary.
 */
export function pruneStoredFormResumes(
  configuredStorage?: Storage | null,
  now = Date.now(),
): void {
  const storage = configuredStorage === undefined ? defaultStorage(now) : configuredStorage;
  if (!storage) return;
  try {
    const candidates: Array<{ key: string; normalized: string; updatedAtMs: number; bytes: number }> = [];
    for (const key of ownedKeys(storage)) {
      const raw = storage.getItem(key);
      const parsed = raw ? parseStoredResume(raw, now) : null;
      if (!raw || !parsed) {
        storage.removeItem(key);
        continue;
      }
      const bytes = utf8Bytes(key) + utf8Bytes(parsed.normalized);
      if (bytes > FORM_RESUME_MAX_ENTRY_BYTES) {
        storage.removeItem(key);
        continue;
      }
      if (raw !== parsed.normalized) storage.setItem(key, parsed.normalized);
      candidates.push({ key, normalized: parsed.normalized, updatedAtMs: parsed.updatedAtMs, bytes });
    }

    candidates.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
    let keptEntries = 0;
    let keptBytes = 0;
    for (const candidate of candidates) {
      const fits = keptEntries < FORM_RESUME_MAX_ENTRIES
        && keptBytes + candidate.bytes <= FORM_RESUME_MAX_BYTES;
      if (!fits) {
        storage.removeItem(candidate.key);
        continue;
      }
      keptEntries += 1;
      keptBytes += candidate.bytes;
    }
  } catch {
    // Storage may be unavailable or blocked. Never touch non-owned keys.
  }
}

export function readStoredFormResumeIdentity(
  formId: string,
  configuredStorage?: Storage | null,
  now = Date.now(),
): StoredFormResumeIdentity | null {
  const storage = configuredStorage === undefined ? defaultStorage(now) : configuredStorage;
  if (!storage) return null;
  const storageKey = formResumeStorageKey(formId);
  pruneStoredFormResumes(storage, now);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    return parseStoredResume(raw, now)?.identity ?? null;
  } catch {
    try { storage.removeItem(storageKey); } catch { /* storage may be blocked */ }
    return null;
  }
}

export function writeStoredFormResume(
  formId: string,
  record: Record<string, unknown>,
  configuredStorage?: Storage | null,
  now = Date.now(),
): boolean {
  const storage = configuredStorage === undefined ? defaultStorage(now) : configuredStorage;
  if (!storage) return false;
  const storageKey = formResumeStorageKey(formId);
  pruneStoredFormResumes(storage, now);
  try {
    const submissionToken = record.submissionToken;
    const updatedAtMs = typeof record.updatedAt === 'string'
      ? Date.parse(record.updatedAt)
      : now;
    if (typeof submissionToken !== 'string' || !Number.isFinite(updatedAtMs)) {
      storage.removeItem(storageKey);
      return false;
    }
    const raw = serializeStoredResume(submissionToken, updatedAtMs);
    if (utf8Bytes(storageKey) + utf8Bytes(raw) > FORM_RESUME_MAX_ENTRY_BYTES
      || !parseStoredResume(raw, now)) {
      storage.removeItem(storageKey);
      return false;
    }
    storage.setItem(storageKey, raw);
    pruneStoredFormResumes(storage, now);
    return storage.getItem(storageKey) === raw;
  } catch {
    try { storage.removeItem(storageKey); } catch { /* storage may be blocked */ }
    return false;
  }
}

export function clearStoredFormResume(
  formId: string,
  configuredStorage?: Storage | null,
): void {
  const storage = configuredStorage === undefined ? defaultStorage() : configuredStorage;
  if (storage) {
    try { storage.removeItem(formResumeStorageKey(formId)); } catch { /* blocked */ }
  }
  if (configuredStorage === undefined) {
    // Defense-in-depth cleanup for browsers that still contain a v1 record.
    try { window.localStorage.removeItem(formResumeStorageKey(formId)); } catch { /* blocked */ }
  }
}

export function isRejectedResumePayload(payload: unknown): boolean {
  return !!payload
    && typeof payload === 'object'
    && (payload as { error?: unknown }).error === 'invalid_resume_token';
}
