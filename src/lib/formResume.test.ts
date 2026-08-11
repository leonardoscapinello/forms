import { describe, expect, it, vi } from 'vitest';
import {
  clearStoredFormResume,
  FORM_RESUME_MAX_ENTRIES,
  FORM_RESUME_MAX_ENTRY_BYTES,
  FORM_RESUME_STORAGE_PREFIX,
  FORM_RESUME_TTL_MS,
  formResumeStorageKey,
  isRejectedResumePayload,
  readStoredFormResumeIdentity,
  writeStoredFormResume,
} from './formResume';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('public form resume credential', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z');
  it('returns only a fresh opaque credential and strips legacy answer data', () => {
    const storage = new MemoryStorage();
    storage.setItem(formResumeStorageKey('form-a'), JSON.stringify({
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt: new Date(now - 60_000).toISOString(),
      answers: { email: 'pii@example.invalid' },
      submissionResponseId: '20000000-0000-4000-8000-000000000001',
    }));

    expect(readStoredFormResumeIdentity('form-a', storage, now)).toEqual({
      submissionToken: 'signed.resume.token.with-sufficient-length',
    });
    const normalized = storage.getItem(formResumeStorageKey('form-a')) || '';
    expect(normalized).not.toContain('pii@example.invalid');
    expect(normalized).not.toContain('submissionResponseId');
    storage.setItem(formResumeStorageKey('form-a'), JSON.stringify({
      submissionToken: 'short',
      updatedAt: new Date(now - 60_000).toISOString(),
    }));
    expect(readStoredFormResumeIdentity('form-a', storage, now)).toBeNull();
    expect(storage.getItem(formResumeStorageKey('form-a'))).toBeNull();
  });

  it.each([
    ['expired', new Date(now - FORM_RESUME_TTL_MS - 1).toISOString()],
    ['future-dated', new Date(now + 1).toISOString()],
  ])('prunes a %s resume record on the next visit', (_label, updatedAt) => {
    const storage = new MemoryStorage();
    storage.setItem(formResumeStorageKey('form-a'), JSON.stringify({
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt,
      answers: { email: 'pii@example.invalid' },
    }));

    expect(readStoredFormResumeIdentity('form-a', storage, now)).toBeNull();
    expect(storage.getItem(formResumeStorageKey('form-a'))).toBeNull();
  });

  it('clears a rejected/expired handshake before a fresh identity is requested', () => {
    const storage = new MemoryStorage();
    storage.setItem(formResumeStorageKey('form-a'), '{corrupt');
    expect(readStoredFormResumeIdentity('form-a', storage, now)).toBeNull();
    expect(storage.getItem(formResumeStorageKey('form-a'))).toBeNull();
    storage.setItem(formResumeStorageKey('form-a'), '{}');
    expect(isRejectedResumePayload({ error: 'invalid_resume_token' })).toBe(true);
    expect(isRejectedResumePayload({ error: 'form_not_available' })).toBe(false);
    clearStoredFormResume('form-a', storage);
    expect(storage.getItem(formResumeStorageKey('form-a'))).toBeNull();
  });

  it('prunes stale resume PII across forms without touching unrelated storage keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated-cache', 'keep-me');
    storage.setItem(formResumeStorageKey('stale-form'), JSON.stringify({
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt: new Date(now - FORM_RESUME_TTL_MS - 1).toISOString(),
      answers: { email: 'old-pii@example.invalid' },
    }));
    storage.setItem(formResumeStorageKey('current-form'), JSON.stringify({
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt: new Date(now - 1).toISOString(),
    }));

    expect(readStoredFormResumeIdentity('current-form', storage, now)).not.toBeNull();
    expect(storage.getItem(formResumeStorageKey('stale-form'))).toBeNull();
    expect(storage.getItem('unrelated-cache')).toBe('keep-me');
  });

  it('keeps only the newest bounded set of resumable forms', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated-cache', 'keep-me');
    for (let index = 0; index < FORM_RESUME_MAX_ENTRIES + 2; index += 1) {
      expect(writeStoredFormResume(`form-${index}`, {
        submissionToken: 'signed.resume.token.with-sufficient-length',
        updatedAt: new Date(now - (FORM_RESUME_MAX_ENTRIES + 2 - index) * 1_000).toISOString(),
        answers: { index },
      }, storage, now)).toBe(true);
    }

    const ownedKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => !!key?.startsWith(FORM_RESUME_STORAGE_PREFIX));
    expect(ownedKeys).toHaveLength(FORM_RESUME_MAX_ENTRIES);
    expect(storage.getItem(formResumeStorageKey(`form-${FORM_RESUME_MAX_ENTRIES + 1}`))).not.toBeNull();
    expect(storage.getItem(formResumeStorageKey('form-0'))).toBeNull();
    expect(storage.getItem('unrelated-cache')).toBe('keep-me');
  });

  it('never serializes supplied answers and rejects an oversized credential', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated-cache', 'keep-me');
    expect(writeStoredFormResume('minimal', {
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt: new Date(now - 1).toISOString(),
      answers: { note: 'x'.repeat(FORM_RESUME_MAX_ENTRY_BYTES) },
      accessToken: 'must-not-be-persisted',
    }, storage, now)).toBe(true);
    const minimal = storage.getItem(formResumeStorageKey('minimal')) || '';
    expect(minimal).not.toContain('answers');
    expect(minimal).not.toContain('must-not-be-persisted');

    expect(writeStoredFormResume('oversized', {
      submissionToken: `signed.${'x'.repeat(FORM_RESUME_MAX_ENTRY_BYTES)}`,
      updatedAt: new Date(now - 1).toISOString(),
    }, storage, now)).toBe(false);
    expect(storage.getItem(formResumeStorageKey('oversized'))).toBeNull();
    expect(storage.getItem('unrelated-cache')).toBe('keep-me');
  });

  it('migrates only the credential from localStorage into sessionStorage', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(formResumeStorageKey('legacy-form'), JSON.stringify({
      submissionToken: 'signed.resume.token.with-sufficient-length',
      updatedAt: new Date().toISOString(),
      answers: { document: '123.456.789-00' },
    }));

    expect(readStoredFormResumeIdentity('legacy-form')).toEqual({
      submissionToken: 'signed.resume.token.with-sufficient-length',
    });
    expect(localStorage.getItem(formResumeStorageKey('legacy-form'))).toBeNull();
    const migrated = sessionStorage.getItem(formResumeStorageKey('legacy-form')) || '';
    expect(migrated).not.toContain('123.456.789-00');
    expect(migrated).not.toContain('answers');
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });
});
