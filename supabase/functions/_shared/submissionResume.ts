const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FORM_SUBMISSION_TOKEN_VERSION = 1;

export interface SubmissionIdentity {
  responseId: string;
  sessionId: string;
}

export interface SubmissionResumeSnapshot {
  answers: Record<string, unknown>;
  pageIndex: number;
  maxPage: number;
}

export interface StoredSubmissionResumeCandidate<T extends Record<string, unknown>> {
  source: 'response' | 'transient';
  state: T;
  clientSaveSequence: unknown;
  updatedAt: unknown;
}

export type StoredSubmissionResumeSelection<T extends Record<string, unknown>> =
  | { ok: true; candidate: StoredSubmissionResumeCandidate<T> | null }
  | { ok: false; error: 'invalid_resume_candidate' | 'ambiguous_resume_candidate' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Selects across the retained-response and transient-resume stores. Sequence is
 * authoritative; updated_at breaks a sequence tie. Equal ordering markers with
 * different payloads are corrupt/ambiguous and must never pick arbitrarily.
 */
export function selectStoredSubmissionResumeCandidate<T extends Record<string, unknown>>(
  response: StoredSubmissionResumeCandidate<T> | null,
  transient: StoredSubmissionResumeCandidate<T> | null,
): StoredSubmissionResumeSelection<T> {
  const candidates = [response, transient].filter(
    (candidate): candidate is StoredSubmissionResumeCandidate<T> => candidate !== null,
  );
  if (candidates.length === 0) return { ok: true, candidate: null };

  const normalized = candidates.map((candidate) => {
    const sequence = candidate.clientSaveSequence === null || candidate.clientSaveSequence === undefined
      ? -1
      : Number(candidate.clientSaveSequence);
    const updatedAtMs = typeof candidate.updatedAt === 'string'
      ? Date.parse(candidate.updatedAt)
      : Number.NaN;
    if (!Number.isSafeInteger(sequence) || sequence < -1 || !Number.isFinite(updatedAtMs)) return null;
    return { candidate, sequence, updatedAtMs };
  });
  if (normalized.some((candidate) => candidate === null)) {
    return { ok: false, error: 'invalid_resume_candidate' };
  }
  const [first, second] = normalized as Array<{
    candidate: StoredSubmissionResumeCandidate<T>;
    sequence: number;
    updatedAtMs: number;
  }>;
  if (!second) return { ok: true, candidate: first.candidate };
  if (first.sequence !== second.sequence) {
    return { ok: true, candidate: first.sequence > second.sequence ? first.candidate : second.candidate };
  }
  if (first.updatedAtMs !== second.updatedAtMs) {
    return { ok: true, candidate: first.updatedAtMs > second.updatedAtMs ? first.candidate : second.candidate };
  }
  if (stableJson(first.candidate.state) !== stableJson(second.candidate.state)) {
    return { ok: false, error: 'ambiguous_resume_candidate' };
  }
  return { ok: true, candidate: first.candidate };
}

function collectInputElementIds(formData: unknown): Set<string> {
  const ids = new Set<string>();
  if (!isPlainObject(formData) || !Array.isArray(formData.pages)) return ids;

  const visit = (elements: unknown) => {
    if (!Array.isArray(elements)) return;
    for (const candidate of elements) {
      if (!isPlainObject(candidate)) continue;
      if (typeof candidate.id === 'string'
        && typeof candidate.type === 'string'
        && candidate.type.startsWith('input_')) {
        ids.add(candidate.id);
      }
      if (Array.isArray(candidate.columnData)) {
        for (const column of candidate.columnData) {
          if (isPlainObject(column)) visit(column.elements);
        }
      }
    }
  };

  for (const page of formData.pages) {
    if (isPlainObject(page)) visit(page.elements);
  }
  return ids;
}

/**
 * Builds the only respondent state that may leave the canonical database on a
 * signed resume request. Context/GET/webhook internals and arbitrary keys are
 * excluded; field answers and configured workflow variables are retained.
 */
export function buildSubmissionResumeSnapshot(
  formData: unknown,
  storedAnswers: unknown,
  requestedPageIndex: unknown,
  requestedMaxPage: unknown,
): SubmissionResumeSnapshot {
  const allowedKeys = collectInputElementIds(formData);
  if (isPlainObject(formData) && Array.isArray(formData.variables)) {
    for (const variable of formData.variables) {
      if (!isPlainObject(variable) || typeof variable.name !== 'string') continue;
      if (/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(variable.name)) {
        allowedKeys.add(`__var_${variable.name}`);
      }
    }
  }

  const answers: Record<string, unknown> = Object.create(null);
  if (isPlainObject(storedAnswers)) {
    for (const [key, value] of Object.entries(storedAnswers)) {
      if (allowedKeys.has(key)) answers[key] = value;
    }
  }

  const pageCount = isPlainObject(formData) && Array.isArray(formData.pages)
    ? formData.pages.length
    : 0;
  const maxIndex = Math.max(0, pageCount - 1);
  const normalizeIndex = (value: unknown) => typeof value === 'number'
      && Number.isInteger(value)
      && value >= 0
    ? Math.min(value, maxIndex)
    : 0;
  const pageIndex = normalizeIndex(requestedPageIndex);
  const maxPage = Math.max(pageIndex, normalizeIndex(requestedMaxPage));
  return { answers, pageIndex, maxPage };
}

/**
 * Treats the signed token as the sole authority for a resumed identity. Raw
 * response/session IDs from the browser are intentionally never accepted.
 */
export function readResumedSubmissionIdentity(
  state: Record<string, unknown> | null,
  formId: string,
  allowResume: boolean,
): SubmissionIdentity | null {
  if (allowResume !== true
    || !state
    || state.kind !== 'form-submission'
    || state.version !== FORM_SUBMISSION_TOKEN_VERSION
    || state.formId !== formId
    || typeof state.responseId !== 'string'
    || typeof state.sessionId !== 'string'
    || !UUID_PATTERN.test(state.responseId)
    || !UUID_PATTERN.test(state.sessionId)) {
    return null;
  }
  return { responseId: state.responseId, sessionId: state.sessionId };
}

export function createSubmissionTokenState(formId: string, identity: SubmissionIdentity) {
  return {
    kind: 'form-submission',
    version: FORM_SUBMISSION_TOKEN_VERSION,
    formId,
    responseId: identity.responseId,
    sessionId: identity.sessionId,
  } as const;
}
