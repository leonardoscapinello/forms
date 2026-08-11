BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

SELECT has_table(
  'public',
  'form_submission_resume_states',
  'server-only resume state table exists'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.form_submission_resume_states', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.form_submission_resume_states', 'SELECT'),
  'respondents and form owners cannot read short-lived resume state directly'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-0000000000f1',
  'resume-privacy-regression@example.invalid',
  '{}'::jsonb,
  now(),
  now()
);

INSERT INTO public.forms (id, user_id, title, status, data)
VALUES (
  '10000000-0000-4000-8000-0000000000f1',
  '00000000-0000-4000-8000-0000000000f1',
  'Resume privacy regression',
  'published',
  '{}'::jsonb
);

SELECT ok(public.persist_form_submission_resume(
  '10000000-0000-4000-8000-0000000000f1',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  to_jsonb('enc:first-answer-ciphertext'::TEXT),
  to_jsonb('enc:first-metadata-ciphertext'::TEXT),
  1,
  10,
  INTERVAL '2 hours'
), 'first ordered resume state is accepted');

SELECT is(
  (SELECT client_save_sequence FROM public.form_submission_resume_states
   WHERE response_id = '20000000-0000-4000-8000-000000000001'),
  10::BIGINT,
  'resume state stores its idempotent client sequence'
);

SELECT ok(NOT public.persist_form_submission_resume(
  '10000000-0000-4000-8000-0000000000f1',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  to_jsonb('enc:stale-answer-ciphertext'::TEXT),
  to_jsonb('enc:stale-metadata-ciphertext'::TEXT),
  0,
  9,
  INTERVAL '2 hours'
), 'an older retry cannot overwrite newer resume state');

SELECT is(
  (SELECT answers #>> '{}' FROM public.form_submission_resume_states
   WHERE response_id = '20000000-0000-4000-8000-000000000001'),
  'enc:first-answer-ciphertext',
  'stale retry leaves the newer encrypted answers untouched'
);

UPDATE public.form_submission_resume_states
SET updated_at = statement_timestamp() - INTERVAL '3 hours',
    expires_at = statement_timestamp() - INTERVAL '1 hour'
WHERE response_id = '20000000-0000-4000-8000-000000000001';

SELECT is(
  public.cleanup_form_submission_resume_states(100),
  1,
  'bounded cleanup physically deletes expired resume state'
);

SELECT is(
  (SELECT count(*) FROM public.form_submission_resume_states),
  0::BIGINT,
  'no expired resume PII remains after cleanup'
);

SELECT * FROM finish();
ROLLBACK;
