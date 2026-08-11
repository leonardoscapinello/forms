import { describe, expect, it } from 'vitest';
import {
  advanceNewerFormAutosaveRevision,
  formAutosaveJournalKey,
  hasFormAutosaveAck,
  PerFormSaveQueue,
  persistFormAutosaveEntry,
  readFormAutosaveEntries,
  readFormAutosaveEntry,
  removeConfirmedFormAutosaveRevision,
  type AutosaveStorage,
  type FormAutosaveJournalEntry,
} from './formAutosaveJournal';

class MemoryStorage implements AutosaveStorage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function entry(overrides: Partial<FormAutosaveJournalEntry> = {}): FormAutosaveJournalEntry {
  return {
    version: 1,
    formId: 'form-1',
    userId: 'user-1',
    writerId: 'tab-a',
    revision: 'revision-1',
    expectedUpdatedAt: '2026-08-10T10:00:00.000Z',
    writtenAt: '2026-08-10T10:00:01.000Z',
    payload: {
      title: 'Primeira versão',
      status: 'draft',
      data: { pages: [{ id: 'page-1' }] },
    },
    ...overrides,
  };
}

describe('form autosave concurrency contract', () => {
  it('rejects a zero-row or incomplete mutation ACK', () => {
    expect(hasFormAutosaveAck(null, 'form-1')).toBe(false);
    expect(hasFormAutosaveAck({}, 'form-1')).toBe(false);
    expect(hasFormAutosaveAck({ id: 'form-1' }, 'form-1')).toBe(false);
    expect(hasFormAutosaveAck({ id: 'form-2', updated_at: 'server-v2' }, 'form-1')).toBe(false);
    expect(hasFormAutosaveAck({ id: 'form-1', updated_at: 'server-v2' }, 'form-1')).toBe(true);
  });

  it('serializes saves and preserves a newer edit written during a slow request', async () => {
    const storage = new MemoryStorage();
    const queue = new PerFormSaveQueue();
    const first = entry();
    const second = entry({
      revision: 'revision-2',
      writtenAt: '2026-08-10T10:00:02.000Z',
      payload: { ...entry().payload, title: 'Edição durante o save' },
    });
    persistFormAutosaveEntry(storage, first);

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    let active = 0;
    let maximumActive = 0;
    let secondStarted = false;

    const firstSave = queue.enqueue(first.formId, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await firstGate;
      // The newer local revision must make an exact removal of revision-1 fail.
      expect(removeConfirmedFormAutosaveRevision(storage, first)).toBe(false);
      expect(advanceNewerFormAutosaveRevision(storage, first, 'server-v2')?.revision)
        .toBe(second.revision);
      active -= 1;
    });

    persistFormAutosaveEntry(storage, second);
    const secondSave = queue.enqueue(second.formId, async () => {
      secondStarted = true;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      const current = readFormAutosaveEntry(storage, second.userId, second.formId, second.writerId);
      expect(current?.revision).toBe(second.revision);
      expect(current?.expectedUpdatedAt).toBe('server-v2');
      expect(removeConfirmedFormAutosaveRevision(storage, current!)).toBe(true);
      active -= 1;
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);
    expect(queue.hasPending(first.formId)).toBe(true);
    releaseFirst();
    await Promise.all([firstSave, secondSave]);

    expect(maximumActive).toBe(1);
    expect(readFormAutosaveEntry(storage, first.userId, first.formId, first.writerId)).toBeNull();
    expect(queue.hasPending(first.formId)).toBe(false);
  });

  it('keeps the local draft untouched when the updated_at compare-and-swap conflicts', () => {
    const storage = new MemoryStorage();
    const local = entry({ expectedUpdatedAt: 'server-v1' });
    persistFormAutosaveEntry(storage, local);

    // A PostgREST update filtered by stale updated_at returns a zero-row ACK.
    const zeroRowAck: unknown = null;
    expect(hasFormAutosaveAck(zeroRowAck, local.formId)).toBe(false);
    expect(readFormAutosaveEntry(storage, local.userId, local.formId, local.writerId))
      .toEqual(local);

    // An ACK from another base is never allowed to advance this lineage.
    const unrelatedBase = { ...local, expectedUpdatedAt: 'server-v0' };
    expect(advanceNewerFormAutosaveRevision(storage, unrelatedBase, 'server-v3')).toBeNull();
    expect(readFormAutosaveEntry(storage, local.userId, local.formId, local.writerId)?.expectedUpdatedAt)
      .toBe('server-v1');
  });

  it('recovers durable journals by user and preserves independent tab drafts', () => {
    const storage = new MemoryStorage();
    const tabA = entry();
    const tabB = entry({
      writerId: 'tab-b',
      revision: 'revision-b',
      writtenAt: '2026-08-10T10:00:03.000Z',
      payload: { ...entry().payload, title: 'Versão da aba B' },
    });
    expect(persistFormAutosaveEntry(storage, tabA)).toBe(true);
    expect(persistFormAutosaveEntry(storage, tabB)).toBe(true);

    // A fresh reader (simulating reload) sees both snapshots, newest first.
    const recovered = readFormAutosaveEntries(storage, 'user-1', 'form-1');
    expect(recovered.map(item => item.revision)).toEqual(['revision-b', 'revision-1']);
    expect(readFormAutosaveEntries(storage, 'another-user', 'form-1')).toEqual([]);

    expect(removeConfirmedFormAutosaveRevision(storage, tabA)).toBe(true);
    expect(readFormAutosaveEntry(storage, 'user-1', 'form-1', 'tab-b')).toEqual(tabB);
    const userKeys = [...storage.values.keys()]
      .filter(key => key.startsWith(formAutosaveJournalKey('user-1')));
    expect(userKeys).toHaveLength(1);
    expect(storage.getItem(userKeys[0])).toContain('revision-b');
  });
});
