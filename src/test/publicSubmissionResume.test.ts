import { describe, expect, it } from 'vitest';
import {
  buildSubmissionResumeSnapshot,
  createSubmissionTokenState,
  FORM_SUBMISSION_TOKEN_VERSION,
  readResumedSubmissionIdentity,
  selectStoredSubmissionResumeCandidate,
} from '../../supabase/functions/_shared/submissionResume.ts';

const formId = '10000000-0000-4000-8000-000000000001';
const responseId = '20000000-0000-4000-8000-000000000001';
const sessionId = '30000000-0000-4000-8000-000000000001';

describe('signed public submission resume identity', () => {
  it('reissues the same response/session identity from a valid versioned state', () => {
    const state = createSubmissionTokenState(formId, { responseId, sessionId });
    expect(state.version).toBe(FORM_SUBMISSION_TOKEN_VERSION);
    expect(readResumedSubmissionIdentity(state, formId, true)).toEqual({ responseId, sessionId });
  });

  it('does not reuse a signed identity when the form disables resume', () => {
    const state = createSubmissionTokenState(formId, { responseId, sessionId });
    expect(readResumedSubmissionIdentity(state, formId, false)).toBeNull();
  });

  it.each([
    ['another form', { ...createSubmissionTokenState(formId, { responseId, sessionId }), formId: '10000000-0000-4000-8000-000000000002' }],
    ['an old token version', { ...createSubmissionTokenState(formId, { responseId, sessionId }), version: 0 }],
    ['a caller-provided raw identifier', { kind: 'form-submission', version: 1, formId, responseId: 'not-a-uuid', sessionId }],
  ])('rejects %s', (_label, state) => {
    expect(readResumedSubmissionIdentity(state, formId, true)).toBeNull();
  });

  it('returns only canonical field answers and configured variables', () => {
    const snapshot = buildSubmissionResumeSnapshot({
      pages: [{
        id: 'page-1',
        elements: [
          { id: 'email-field', type: 'input_email' },
          {
            id: 'columns',
            type: 'columns',
            columnData: [{ elements: [{ id: 'nested-field', type: 'input_text' }] }],
          },
          { id: 'heading', type: 'heading' },
        ],
      }],
      variables: [{ id: 'variable-1', name: 'score' }],
    }, {
      'email-field': 'lead@example.invalid',
      'nested-field': 'Retomado',
      heading: 'not-an-answer',
      __var_score: 0,
      __ctx_referrer: 'https://private.example/path',
      __param_access_token: 'must-not-return',
      __webhook_secret: 'must-not-return',
      arbitrary: 'must-not-return',
    }, 99, 100);

    expect(snapshot).toEqual({
      answers: {
        'email-field': 'lead@example.invalid',
        'nested-field': 'Retomado',
        __var_score: 0,
      },
      pageIndex: 0,
      maxPage: 0,
    });
  });

  it('selects the newest canonical store by sequence, then updated timestamp', () => {
    const olderResponse = {
      source: 'response' as const,
      state: { answers: 'response-old', pages_visited: 1 },
      clientSaveSequence: 10,
      updatedAt: '2026-08-10T12:00:00.000Z',
    };
    const newerTransient = {
      source: 'transient' as const,
      state: { answers: 'transient-new', pages_visited: 2 },
      clientSaveSequence: 11,
      updatedAt: '2026-08-10T11:59:00.000Z',
    };
    expect(selectStoredSubmissionResumeCandidate(olderResponse, newerTransient)).toEqual({
      ok: true,
      candidate: newerTransient,
    });

    const sameSequenceNewerResponse = {
      ...olderResponse,
      state: { answers: 'response-newest', pages_visited: 3 },
      clientSaveSequence: 11,
      updatedAt: '2026-08-10T12:01:00.000Z',
    };
    expect(selectStoredSubmissionResumeCandidate(sameSequenceNewerResponse, newerTransient)).toEqual({
      ok: true,
      candidate: sameSequenceNewerResponse,
    });
  });

  it('fails closed when both stores claim the same ordering marker with different state', () => {
    const marker = {
      clientSaveSequence: 42,
      updatedAt: '2026-08-10T12:00:00.000Z',
    };
    expect(selectStoredSubmissionResumeCandidate(
      { source: 'response', state: { answers: 'A' }, ...marker },
      { source: 'transient', state: { answers: 'B' }, ...marker },
    )).toEqual({ ok: false, error: 'ambiguous_resume_candidate' });
  });
});
