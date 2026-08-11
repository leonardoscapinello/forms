export interface FormAutosavePayload {
  title: string;
  status: string;
  data: Record<string, unknown>;
}

export interface FormAutosaveJournalEntry {
  version: 1;
  formId: string;
  userId: string;
  writerId: string;
  revision: string;
  expectedUpdatedAt: string;
  writtenAt: string;
  payload: FormAutosavePayload;
}

export interface AutosaveStorage {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface FormAutosaveAck {
  id: string;
  updated_at: string;
}

const JOURNAL_PREFIX = 'formstore_autosave_journal_v2';

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

/** Prefix for all independent writer entries belonging to one user. */
export function formAutosaveJournalKey(userId: string): string {
  return `${JOURNAL_PREFIX}:${encodeKeyPart(userId)}:`;
}

function formAutosaveEntryKey(userId: string, formId: string, writerId: string): string {
  return `${formAutosaveJournalKey(userId)}${encodeKeyPart(formId)}:${encodeKeyPart(writerId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isJournalEntry(value: unknown, userId: string): value is FormAutosaveJournalEntry {
  if (!isRecord(value) || !isRecord(value.payload)) return false;
  return value.version === 1
    && value.userId === userId
    && typeof value.formId === 'string'
    && typeof value.writerId === 'string'
    && typeof value.revision === 'string'
    && typeof value.expectedUpdatedAt === 'string'
    && typeof value.writtenAt === 'string'
    && typeof value.payload.title === 'string'
    && typeof value.payload.status === 'string'
    && isRecord(value.payload.data);
}

function parseEntry(raw: string | null, userId: string): FormAutosaveJournalEntry | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isJournalEntry(parsed, userId) ? parsed : null;
  } catch {
    return null;
  }
}

function matchingKeys(storage: AutosaveStorage, prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

/**
 * Persists one browser writer's newest complete form snapshot in its own key.
 * Independent keys avoid a read-modify-write race between localStorage tabs.
 */
export function persistFormAutosaveEntry(
  storage: AutosaveStorage,
  entry: FormAutosaveJournalEntry,
): boolean {
  try {
    storage.setItem(
      formAutosaveEntryKey(entry.userId, entry.formId, entry.writerId),
      JSON.stringify(entry),
    );
    return true;
  } catch {
    return false;
  }
}

export function readFormAutosaveEntry(
  storage: AutosaveStorage,
  userId: string,
  formId: string,
  writerId: string,
): FormAutosaveJournalEntry | null {
  try {
    const parsed = parseEntry(storage.getItem(formAutosaveEntryKey(userId, formId, writerId)), userId);
    if (!parsed || parsed.formId !== formId || parsed.writerId !== writerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readFormAutosaveEntries(
  storage: AutosaveStorage,
  userId: string,
  formId: string,
): FormAutosaveJournalEntry[] {
  try {
    const formPrefix = `${formAutosaveJournalKey(userId)}${encodeKeyPart(formId)}:`;
    return matchingKeys(storage, formPrefix)
      .map(key => parseEntry(storage.getItem(key), userId))
      .filter((entry): entry is FormAutosaveJournalEntry => Boolean(entry && entry.formId === formId))
      .sort((left, right) => right.writtenAt.localeCompare(left.writtenAt));
  } catch {
    return [];
  }
}

/** Removes a draft only if storage still contains the exact revision ACKed. */
export function removeConfirmedFormAutosaveRevision(
  storage: AutosaveStorage,
  entry: Pick<FormAutosaveJournalEntry, 'userId' | 'formId' | 'writerId' | 'revision'>,
): boolean {
  try {
    const key = formAutosaveEntryKey(entry.userId, entry.formId, entry.writerId);
    const current = parseEntry(storage.getItem(key), entry.userId);
    if (!current || current.revision !== entry.revision) return false;
    storage.removeItem(key);
    return storage.getItem(key) === null;
  } catch {
    return false;
  }
}

/**
 * A newer revision written by the same tab while a request was in flight is a
 * descendant of the ACKed snapshot. Advance only that lineage to the returned
 * server token; never advance another tab's independent draft.
 */
export function advanceNewerFormAutosaveRevision(
  storage: AutosaveStorage,
  acknowledged: Pick<FormAutosaveJournalEntry, 'userId' | 'formId' | 'writerId' | 'revision' | 'expectedUpdatedAt'>,
  nextUpdatedAt: string,
): FormAutosaveJournalEntry | null {
  try {
    const current = readFormAutosaveEntry(
      storage,
      acknowledged.userId,
      acknowledged.formId,
      acknowledged.writerId,
    );
    if (!current
      || current.revision === acknowledged.revision
      || current.expectedUpdatedAt !== acknowledged.expectedUpdatedAt) {
      return null;
    }

    const advanced = { ...current, expectedUpdatedAt: nextUpdatedAt };
    return persistFormAutosaveEntry(storage, advanced) ? advanced : null;
  } catch {
    return null;
  }
}

export function removeAllFormAutosaveEntries(
  storage: AutosaveStorage,
  userId: string,
  formId: string,
): boolean {
  try {
    const formPrefix = `${formAutosaveJournalKey(userId)}${encodeKeyPart(formId)}:`;
    const keys = matchingKeys(storage, formPrefix);
    keys.forEach(key => storage.removeItem(key));
    return keys.every(key => storage.getItem(key) === null);
  } catch {
    return false;
  }
}

export function hasFormAutosaveAck(value: unknown, expectedId: string): value is FormAutosaveAck {
  return Boolean(
    value
    && typeof value === 'object'
    && 'id' in value
    && 'updated_at' in value
    && (value as { id?: unknown }).id === expectedId
    && typeof (value as { updated_at?: unknown }).updated_at === 'string'
    && (value as { updated_at: string }).updated_at.length > 0,
  );
}

/** A small per-key promise queue used to guarantee one mutation at a time. */
export class PerFormSaveQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, number>();

  enqueue<T>(formId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(formId) ?? Promise.resolve();
    this.pending.set(formId, (this.pending.get(formId) ?? 0) + 1);

    const result = previous.catch(() => undefined).then(task);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(formId, tail);
    void tail.finally(() => {
      const remaining = (this.pending.get(formId) ?? 1) - 1;
      if (remaining > 0) this.pending.set(formId, remaining);
      else this.pending.delete(formId);
      if (this.tails.get(formId) === tail) this.tails.delete(formId);
    });
    return result;
  }

  hasPending(formId: string): boolean {
    return (this.pending.get(formId) ?? 0) > 0;
  }
}
