BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(82);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'admin-db-test@example.invalid', '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', 'owner-db-test@example.invalid', '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-0000000000c1', 'other-db-test@example.invalid', '{}'::jsonb, now(), now()),
  ('00000000-0000-4000-8000-0000000000d1', 'inactive-db-test@example.invalid', '{}'::jsonb, now(), now());

UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = '00000000-0000-4000-8000-0000000000a1'
  AND role = 'user';

UPDATE public.profiles
SET is_active = false
WHERE user_id = '00000000-0000-4000-8000-0000000000d1';

INSERT INTO public.forms (id, user_id, title, status, data)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000000b1',
    'Owner form',
    'published',
    jsonb_build_object(
      'googleSheetId', 'sheet-regression-id',
      'completionWebhookUrl', 'https://example.invalid/completion'
    )
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000000c1',
    'Other form',
    'published',
    '{}'::jsonb
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-0000000000d1',
    'Inactive form',
    'draft',
    '{}'::jsonb
  );

INSERT INTO public.folders (id, user_id, name)
VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Owner folder'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000d1', 'Inactive folder');

INSERT INTO public.gallery_folders (id, user_id, name)
VALUES
  ('30000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b1', 'Owner gallery'),
  ('30000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000d1', 'Inactive gallery');

INSERT INTO public.tags (id, name, created_by)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'Owner tag', '00000000-0000-4000-8000-0000000000b1'),
  ('40000000-0000-4000-8000-000000000003', 'Inactive tag', '00000000-0000-4000-8000-0000000000d1');
INSERT INTO public.form_tags (form_id, tag_id)
VALUES
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003');

SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM public.app_settings), 1::BIGINT,
  'anon sees only the public brand row');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.forms), 1::BIGINT,
  'active owner sees only their form');
SELECT throws_ok(
  'SELECT * FROM public.get_admin_users(NULL, NULL, 200)',
  '42501',
  'admin_required',
  'a non-admin cannot enumerate the user directory'
);
SELECT is((SELECT count(*) FROM public.folders), 1::BIGINT,
  'active owner sees only their folder');
SELECT is((SELECT count(*) FROM public.gallery_folders), 1::BIGINT,
  'active owner sees only their gallery folder');
SELECT is((SELECT count(*) FROM public.form_tags), 1::BIGINT,
  'active owner sees only tags attached to their forms');
WITH changed AS (
  UPDATE public.app_settings
  SET value = jsonb_set(value, '{productName}', '"Unauthorized"'::jsonb)
  WHERE key = 'brand'
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 0::BIGINT,
  'non-admin cannot update application identity');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.forms), 0::BIGINT,
  'inactive owner loses form access');
SELECT is((SELECT count(*) FROM public.folders), 0::BIGINT,
  'inactive owner loses folder access');
SELECT is((SELECT count(*) FROM public.gallery_folders), 0::BIGINT,
  'inactive owner loses gallery access');
SELECT is((SELECT count(*) FROM public.tags), 0::BIGINT,
  'inactive owner loses shared builder tag access');
SELECT is((SELECT count(*) FROM public.form_tags), 0::BIGINT,
  'inactive owner loses form tag access');
RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*) FROM public.forms), 3::BIGINT,
  'active admin sees all forms');
SELECT is(
  (SELECT count(*) FROM public.get_admin_users(NULL, NULL, 200)),
  4::BIGINT,
  'an active admin receives one joined directory row per user'
);
SELECT is(
  (
    SELECT role
    FROM public.get_admin_users(NULL, NULL, 200)
    WHERE user_id = '00000000-0000-4000-8000-0000000000a1'
  ),
  'admin'::TEXT,
  'the directory returns the acknowledged administrator role'
);
WITH changed AS (
  UPDATE public.app_settings
  SET value = jsonb_set(value, '{productName}', '"Regression Brand"'::jsonb)
  WHERE key = 'brand'
  RETURNING 1
)
SELECT is((SELECT count(*) FROM changed), 1::BIGINT,
  'active admin can update application identity');
RESET ROLE;

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, created_at
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'runtime-response-encryption-backfill',
  '{"email":"legacy@example.invalid"}'::jsonb,
  '{"status":"partial"}'::jsonb,
  now() - interval '1 hour'
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.migrate_form_response_encryption(
    (SELECT id FROM public.form_responses WHERE response_id = 'runtime-response-encryption-backfill'),
    '{"email":"legacy@example.invalid"}'::jsonb,
    '{"status":"partial"}'::jsonb,
    'enc:unit-test-answers',
    'enc:unit-test-metadata'
  ),
  'response encryption backfill CAS acknowledges the exact legacy snapshot'
);
SELECT ok(
  NOT public.migrate_form_response_encryption(
    (SELECT id FROM public.form_responses WHERE response_id = 'runtime-response-encryption-backfill'),
    '{"email":"legacy@example.invalid"}'::jsonb,
    '{"status":"partial"}'::jsonb,
    'enc:stale-overwrite',
    'enc:stale-metadata'
  ),
  'response encryption backfill rejects a stale snapshot without overwriting it'
);
RESET ROLE;
SELECT ok(
  (
    SELECT answers = to_jsonb('enc:unit-test-answers'::text)
      AND metadata = to_jsonb('enc:unit-test-metadata'::text)
    FROM public.form_responses
    WHERE response_id = 'runtime-response-encryption-backfill'
  ),
  'response encryption backfill stores both encrypted fields atomically'
);

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, created_at, completed_at
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'runtime-completed-response-encryption-backfill',
  '{"email":"completed-legacy@example.invalid"}'::jsonb,
  '{"status":"complete"}'::jsonb,
  now() - interval '2 hours',
  now() - interval '1 hour'
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.migrate_form_response_encryption(
    (SELECT id FROM public.form_responses WHERE response_id = 'runtime-completed-response-encryption-backfill'),
    '{"email":"completed-legacy@example.invalid"}'::jsonb,
    '{"status":"complete"}'::jsonb,
    'enc:completed-unit-test-answers',
    'enc:completed-unit-test-metadata'
  ),
  'response encryption backfill can migrate an immutable completed response'
);
RESET ROLE;
SELECT ok(
  (
    SELECT answers = to_jsonb('enc:completed-unit-test-answers'::text)
      AND metadata = to_jsonb('enc:completed-unit-test-metadata'::text)
    FROM public.form_responses
    WHERE response_id = 'runtime-completed-response-encryption-backfill'
  ),
  'completed response trigger persists the acknowledged encryption-only rewrite'
);

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, created_at, completed_at
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'runtime-null-metadata-encryption-backfill',
  '{"accepted":false}'::jsonb,
  NULL,
  now() - interval '2 hours',
  now() - interval '1 hour'
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.migrate_form_response_encryption(
    (SELECT id FROM public.form_responses WHERE response_id = 'runtime-null-metadata-encryption-backfill'),
    '{"accepted":false}'::jsonb,
    NULL,
    'enc:null-metadata-unit-test-answers',
    NULL
  ),
  'response encryption backfill accepts legacy nullable metadata without inventing content'
);
RESET ROLE;
SELECT ok(
  (
    SELECT answers = to_jsonb('enc:null-metadata-unit-test-answers'::text)
      AND metadata IS NULL
    FROM public.form_responses
    WHERE response_id = 'runtime-null-metadata-encryption-backfill'
  ),
  'nullable metadata remains NULL after the completed-response backfill'
);

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, created_at, client_save_sequence
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'runtime-ordered-partial-encryption-backfill',
  '{"step":"legacy"}'::jsonb,
  '{"status":"partial"}'::jsonb,
  now() - interval '1 hour',
  42
);

SET LOCAL ROLE service_role;
SELECT ok(
  public.migrate_form_response_encryption(
    (SELECT id FROM public.form_responses WHERE response_id = 'runtime-ordered-partial-encryption-backfill'),
    '{"step":"legacy"}'::jsonb,
    '{"status":"partial"}'::jsonb,
    'enc:ordered-partial-unit-test-answers',
    'enc:ordered-partial-unit-test-metadata'
  ),
  'response encryption backfill bypasses sequence protection only for the encryption rewrite'
);
RESET ROLE;
SELECT ok(
  (
    SELECT answers = to_jsonb('enc:ordered-partial-unit-test-answers'::text)
      AND metadata = to_jsonb('enc:ordered-partial-unit-test-metadata'::text)
      AND client_save_sequence = 42
    FROM public.form_responses
    WHERE response_id = 'runtime-ordered-partial-encryption-backfill'
  ),
  'ordered partial backfill preserves its sequence and every non-encrypted column'
);

-- A partial response is durable but must not enqueue completion integrations.
INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, created_at
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'runtime-response-1',
  '{"field":"partial"}'::jsonb,
  '{"status":"partial"}'::jsonb,
  now() - interval '20 minutes'
);

SELECT is(
  (SELECT count(*) FROM public.form_response_deliveries),
  0::BIGINT,
  'partial save does not enqueue integrations'
);

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, client_save_sequence
) VALUES (
  '10000000-0000-4000-8000-000000000002',
  'runtime-response-ordered-partial',
  '{"field":"newer-partial"}'::jsonb,
  '{"status":"partial"}'::jsonb,
  200
);

UPDATE public.form_responses
SET answers = '{"field":"older-partial"}'::jsonb,
    metadata = '{"status":"partial"}'::jsonb,
    client_save_sequence = 100
WHERE response_id = 'runtime-response-ordered-partial';

SELECT is(
  (SELECT answers->>'field' FROM public.form_responses WHERE response_id = 'runtime-response-ordered-partial'),
  'newer-partial',
  'an older partial acknowledgement cannot overwrite the latest lead snapshot'
);
SELECT is(
  (SELECT client_save_sequence FROM public.form_responses WHERE response_id = 'runtime-response-ordered-partial'),
  200::BIGINT,
  'the canonical partial keeps its newest monotonic browser marker'
);

UPDATE public.form_responses
SET answers = '{"field":"canonical"}'::jsonb,
    metadata = '{"status":"complete"}'::jsonb,
    completed_at = now() - interval '10 minutes'
WHERE response_id = 'runtime-response-1';

SELECT is(
  (SELECT count(*) FROM public.form_response_deliveries),
  2::BIGINT,
  'first completion atomically enqueues Sheets and webhook jobs'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.form_response_deliveries
    WHERE status = 'failed'
      AND attempts = 0
      AND next_attempt_at IS NOT NULL
      AND destination IS NOT NULL
  ),
  2::BIGINT,
  'new outbox jobs start due with a destination snapshot'
);

-- A delayed partial or repeated final request cannot mutate the lead or enqueue
-- duplicate destinations once completed_at is set.
UPDATE public.form_responses
SET answers = '{"field":"late-overwrite"}'::jsonb,
    metadata = '{"status":"partial"}'::jsonb,
    completed_at = NULL
WHERE response_id = 'runtime-response-1';

SELECT is(
  (SELECT answers->>'field' FROM public.form_responses WHERE response_id = 'runtime-response-1'),
  'canonical',
  'completed response remains immutable after a late partial save'
);

WITH late_partial_upsert AS (
  INSERT INTO public.form_responses (
    form_id, response_id, answers, metadata, completed_at
  ) VALUES (
    '10000000-0000-4000-8000-000000000001',
    'runtime-response-1',
    '{"field":"late-upsert-overwrite"}'::jsonb,
    '{"status":"partial"}'::jsonb,
    NULL
  )
  ON CONFLICT (form_id, response_id) DO UPDATE
  SET answers = EXCLUDED.answers,
      metadata = EXCLUDED.metadata,
      completed_at = EXCLUDED.completed_at
  RETURNING answers
)
SELECT is(
  (SELECT answers->>'field' FROM late_partial_upsert),
  'canonical',
  'Edge-style late partial upsert returns the immutable canonical response'
);
SELECT is(
  (SELECT count(*) FROM public.form_response_deliveries),
  2::BIGINT,
  'repeated completion paths remain destination-idempotent'
);

INSERT INTO public.form_responses (
  form_id, response_id, answers, metadata, completed_at, created_at
)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'runtime-response-2',
  '{"field":"insert-complete"}'::jsonb,
  '{"status":"complete"}'::jsonb,
  now() - interval '5 minutes',
  now() - interval '6 minutes'
);

SELECT is(
  (SELECT count(*) FROM public.form_response_deliveries),
  4::BIGINT,
  'completed insert enqueues each configured destination exactly once'
);

SELECT lives_ok(
  $$
    SELECT public.persist_completed_form_submission(
      '10000000-0000-4000-8000-000000000002',
      'runtime-response-atomic-completion',
      '50000000-0000-4000-8000-000000000001'::UUID,
      '{"field":"resumed-complete"}'::JSONB,
      '{"status":"complete"}'::JSONB,
      now() - interval '1 minute',
      120000,
      3,
      300::BIGINT,
      15000
    )
  $$,
  'atomic completion RPC commits a response, session and event'
);
SELECT ok(
  (SELECT completed_at IS NOT NULL FROM public.form_responses WHERE response_id = 'runtime-response-atomic-completion'),
  'atomic completion stores the canonical completed response'
);
SELECT is(
  (SELECT status FROM public.form_sessions WHERE id = '50000000-0000-4000-8000-000000000001'),
  'completed',
  'atomic completion marks the bound session completed before ACK'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.form_page_events
    WHERE response_id = 'runtime-response-atomic-completion'
      AND event_type = 'form_complete'
  ),
  1::BIGINT,
  'atomic completion creates exactly one completion analytics event'
);
SELECT lives_ok(
  $$
    SELECT public.persist_completed_form_submission(
      '10000000-0000-4000-8000-000000000002',
      'runtime-response-atomic-completion',
      '50000000-0000-4000-8000-000000000001'::UUID,
      '{"field":"retry"}'::JSONB,
      '{"status":"complete"}'::JSONB,
      now(),
      120000,
      3,
      301::BIGINT,
      15000
    )
  $$,
  'retrying the atomic completion remains safe'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.form_page_events
    WHERE response_id = 'runtime-response-atomic-completion'
      AND event_type = 'form_complete'
  ),
  1::BIGINT,
  'completion retries remain analytics-idempotent'
);

SELECT is(
  public.get_form_response_sheet_sequence(
    '10000000-0000-4000-8000-000000000001',
    'runtime-response-1'
  ),
  1::BIGINT,
  'Sheets sequence uses deterministic created_at and id order per form'
);

CREATE TEMP TABLE google_sheet_sync_lease_state AS
SELECT public.claim_google_sheets_sync_lease(
  'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
  999
) AS lease_token;

SELECT ok(
  (SELECT lease_token IS NOT NULL FROM google_sheet_sync_lease_state)
  AND (
    SELECT lease_until > now() + interval '4 minutes'
      AND lease_until <= now() + interval '5 minutes 1 second'
    FROM public.google_sheets_sync_leases
  ),
  'manual Sheets sync obtains a bounded fencing lease'
);
SELECT is(
  public.claim_google_sheets_sync_lease(
    'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
    120
  ),
  NULL::UUID,
  'an active Sheets lease refuses an overlapping manual sync'
);
SELECT ok(
  public.is_google_sheets_sync_lease_active(
    'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex')
  ),
  'worker-visible lease state is active before provider I/O'
);
SELECT is(
  public.renew_google_sheets_sync_lease(
    'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
    '60000000-0000-4000-8000-000000000001'::UUID,
    120
  ),
  false,
  'a stale fencing token cannot renew another sync lease'
);

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.claim_form_response_deliveries(25, 45, 8)),
  2::BIGINT,
  'worker claims webhook jobs but skips a manually leased sheet'
);
RESET ROLE;

SELECT ok(
  public.release_google_sheets_sync_lease(
    'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
    (SELECT lease_token FROM google_sheet_sync_lease_state)
  ),
  'only the current fencing token releases the manual sync lease'
);

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.claim_form_response_deliveries(25, 45, 8)),
  2::BIGINT,
  'worker resumes every queued Sheet delivery after release'
);
SELECT is(
  (SELECT count(*) FROM public.claim_form_response_deliveries(25, 45, 8)),
  0::BIGINT,
  'active leases prevent an overlapping worker claim'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.form_response_deliveries
    WHERE status = 'processing'
      AND attempts = 1
      AND lease_token IS NOT NULL
      AND lease_until > now()
  ),
  4::BIGINT,
  'claimed jobs receive an incremented attempt, lease and fencing token'
);

CREATE TEMP TABLE first_delivery_claim AS
SELECT id, lease_token FROM public.form_response_deliveries;

UPDATE public.form_response_deliveries
SET lease_until = now() - interval '1 second'
WHERE status = 'processing';

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.claim_form_response_deliveries(25, 45, 8)),
  4::BIGINT,
  'expired leases are safely reclaimed'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.form_response_deliveries AS delivery
    INNER JOIN first_delivery_claim AS first_claim USING (id)
    WHERE delivery.attempts = 2
      AND delivery.lease_token IS DISTINCT FROM first_claim.lease_token
  ),
  4::BIGINT,
  'reclaim rotates every fencing token'
);

UPDATE public.form_response_deliveries
SET status = 'failed',
    attempts = 8,
    lease_until = NULL,
    lease_token = NULL,
    next_attempt_at = now() - interval '1 second';

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.claim_form_response_deliveries(25, 45, 8)),
  0::BIGINT,
  'jobs at max attempts cannot be reclaimed'
);
RESET ROLE;

SELECT is(
  (
    SELECT count(*)
    FROM public.form_response_deliveries
    WHERE status = 'dead_letter'
      AND dead_lettered_at IS NOT NULL
      AND lease_token IS NULL
      AND next_attempt_at IS NULL
  ),
  4::BIGINT,
  'exhausted jobs transition to terminal dead letter state'
);

UPDATE google_sheet_sync_lease_state
SET lease_token = public.claim_google_sheets_sync_lease(
  'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
  120
);

SELECT throws_ok(
  $$
    SELECT public.ack_google_sheets_manual_sync(
      '10000000-0000-4000-8000-000000000001',
      'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
      'sheet-regression-id',
      now(),
      '60000000-0000-4000-8000-000000000001'::UUID
    )
  $$,
  '55000',
  'google_sheet_sync_lease_lost',
  'a stale sync cannot acknowledge provider writes after losing its fencing token'
);

-- A worker can crash after its lease expires but before changing the ledger
-- status. The provider-acknowledged replacement must absorb that stale claim,
-- otherwise it would be reclaimed later and duplicate an already-written row.
UPDATE public.form_response_deliveries
SET status = 'processing',
    lease_until = now() - interval '1 second',
    lease_token = '60000000-0000-4000-8000-000000000002'::UUID
WHERE delivery_type = 'google_sheets'
  AND response_id = 'runtime-response-1';

SELECT is(
  public.ack_google_sheets_manual_sync(
    '10000000-0000-4000-8000-000000000001',
    'google_sheets:' || encode(sha256(convert_to('sheet-regression-id', 'UTF8')), 'hex'),
    'sheet-regression-id',
    now(),
    (SELECT lease_token FROM google_sheet_sync_lease_state)
  ),
  2::BIGINT,
  'manual sync ACK absorbs dead letters and expired processing claims without a duplicate write'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.form_response_deliveries
    WHERE delivery_type = 'google_sheets'
      AND status = 'delivered'
      AND delivered_at IS NOT NULL
      AND lease_token IS NULL
  ),
  2::BIGINT,
  'manual sync acknowledgement leaves canonical Sheet jobs terminal and unfenced'
);

INSERT INTO public.form_sessions (
  form_id, response_id, status, started_at, completed_at, last_seen_at, pages_visited
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'completed',
    now() - interval '20 minutes', now() - interval '10 minutes', now() - interval '10 minutes', 2
  ),
  (
    '10000000-0000-4000-8000-000000000001', 'runtime-response-3', 'active',
    now() - interval '3 minutes', NULL, now() - interval '3 minutes', 1
  ),
  (
    '10000000-0000-4000-8000-000000000001', 'runtime-response-before-period', 'completed',
    now() - interval '2 days', now() - interval '1 minute', now() - interval '1 minute', 1
  );

INSERT INTO public.form_page_events (
  form_id, response_id, page_id, page_index, page_title, event_type, created_at
)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'page-0', 0, 'Page 1', 'page_view', now() - interval '19 minutes'),
  ('10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'page-1', 1, 'Page 2', 'page_view', now() - interval '11 minutes'),
  ('10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'page-1', 1, 'Page 2', 'form_complete', now() - interval '10 minutes'),
  ('10000000-0000-4000-8000-000000000001', 'runtime-response-3', 'page-0', 0, 'Page 1', 'page_view', now() - interval '3 minutes'),
  ('10000000-0000-4000-8000-000000000001', 'runtime-response-before-period', 'historical-page', 2, 'Historical page', 'page_view', now() - interval '2 minutes');

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT reached FROM public.get_form_page_dropoff('10000000-0000-4000-8000-000000000001') WHERE page_index = 0),
  2::BIGINT,
  'page analytics count every distinct response that reached the page'
);
SELECT is(
  (SELECT dropoffs FROM public.get_form_page_dropoff('10000000-0000-4000-8000-000000000001') WHERE page_index = 0),
  1::BIGINT,
  'page analytics attributes incomplete last-page exits as dropoffs'
);
SELECT is(
  (SELECT count(*) FROM public.get_forms_home_summary(7)),
  1::BIGINT,
  'home summary returns only forms accessible to the owner'
);
SELECT is(
  (
    SELECT response_count
    FROM public.get_forms_home_summary(7)
    WHERE form_id = '10000000-0000-4000-8000-000000000001'
  ),
  2::BIGINT,
  'home summary returns the complete all-time response count'
);
SELECT is(
  (
    SELECT cardinality(bucket_dates)
    FROM public.get_forms_home_summary(7)
    WHERE form_id = '10000000-0000-4000-8000-000000000001'
  ),
  7,
  'home summary fills every requested calendar bucket including zero days'
);
SELECT is(
  (
    SELECT (dropoffs_by_day)[7]
    FROM public.get_forms_home_summary(7)
    WHERE form_id = '10000000-0000-4000-8000-000000000001'
  ),
  1::BIGINT,
  'home summary deduplicates current-day incomplete sessions by response id'
);
SELECT is(
  (
    SELECT (dashboard->'summary'->>'total_sessions')::BIGINT
    FROM (
      SELECT public.get_analytics_dashboard(
        ARRAY['10000000-0000-4000-8000-000000000001'],
        now() - interval '1 day',
        now(),
        'America/Sao_Paulo'
      ) AS dashboard
    ) AS analytics_result
  ),
  2::BIGINT,
  'corporate analytics reports complete in-period session totals'
);
SELECT is(
  (
    SELECT (dashboard->'summary'->>'completed_sessions')::BIGINT
    FROM (
      SELECT public.get_analytics_dashboard(
        ARRAY['10000000-0000-4000-8000-000000000001'],
        now() - interval '1 day',
        now(),
        'America/Sao_Paulo'
      ) AS dashboard
    ) AS analytics_result
  ),
  1::BIGINT,
  'corporate analytics reports the completed session cohort'
);
SELECT is(
  (
    SELECT (page->>'dropoffs')::BIGINT
    FROM jsonb_array_elements(
      public.get_analytics_dashboard(
        ARRAY['10000000-0000-4000-8000-000000000001'],
        now() - interval '1 day',
        now(),
        'America/Sao_Paulo'
      )->'pages'
    ) AS page
    WHERE page->>'page_id' = 'historical-page'
  ),
  0::BIGINT,
  'page completion is resolved even when the session started before the period'
);
SELECT throws_ok(
  $$
    SELECT public.get_analytics_dashboard(
      ARRAY['10000000-0000-4000-8000-000000000002'],
      now() - interval '1 day',
      now(),
      'America/Sao_Paulo'
    )
  $$,
  '42501',
  'form_access_denied',
  'owner cannot request another tenant analytics'
);
SELECT throws_ok(
  $$
    SELECT public.get_analytics_dashboard(
      ARRAY['10000000-0000-4000-8000-000000000001'],
      now() - interval '1 day',
      now(),
      'Invalid/Timezone'
    )
  $$,
  '22023',
  'invalid_analytics_timezone',
  'analytics rejects unknown timezones before scanning telemetry'
);
SELECT throws_ok(
  $$
    SELECT public.get_analytics_dashboard(
      ARRAY['not-a-form-id'],
      now() - interval '1 day',
      now(),
      'America/Sao_Paulo'
    )
  $$,
  '22023',
  'invalid_form_ids',
  'analytics rejects malformed form identifiers before scanning telemetry'
);
SELECT throws_ok(
  $$ SELECT * FROM public.get_form_page_dropoff('not-a-form-id') $$,
  '22023',
  'invalid_form_id',
  'page analytics rejects a malformed form identifier'
);
RESET ROLE;

INSERT INTO public.form_workflow_executions (
  form_id, response_id, node_key, status
)
VALUES (
  '10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'email-node-1', 'delivered'
)
ON CONFLICT (form_id, response_id, node_key) DO NOTHING;
INSERT INTO public.form_workflow_executions (
  form_id, response_id, node_key, status
)
VALUES (
  '10000000-0000-4000-8000-000000000001', 'runtime-response-1', 'email-node-1', 'failed'
)
ON CONFLICT (form_id, response_id, node_key) DO NOTHING;

SELECT is(
  (SELECT count(*) FROM public.form_workflow_executions),
  1::BIGINT,
  'workflow execution key prevents duplicate side effects'
);

CREATE TEMP TABLE cron_validation_result (blocked BOOLEAN NOT NULL DEFAULT false);
DO $$
BEGIN
  PERFORM public.configure_form_response_delivery_worker_schedule();
EXCEPTION
  WHEN SQLSTATE '22023' THEN
    INSERT INTO cron_validation_result (blocked) VALUES (true);
END;
$$;
SELECT is(
  (SELECT bool_or(blocked) FROM cron_validation_result),
  true,
  'cron configuration fails closed until required Vault secrets exist'
);

DO $$
BEGIN
  PERFORM vault.create_secret(
    'https://audit-project.supabase.co',
    'project_url',
    'Database regression test value'
  );
  PERFORM vault.create_secret(
    'audit-worker-secret-0000000000000000000000000000',
    'delivery_worker_secret',
    'Database regression test value'
  );
END;
$$;

SELECT ok(
  public.configure_form_response_delivery_worker_schedule() > 0,
  'cron configuration succeeds after both Vault secrets exist'
);
SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'form-response-delivery-worker'),
  1::BIGINT,
  'cron configuration creates exactly one worker job'
);
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'form-response-delivery-worker'),
  '10 seconds',
  'worker cron runs often enough for production delivery throughput'
);
SELECT ok(
  (
    SELECT position('"batchSize":10' IN replace(command, ' ', '')) > 0
    FROM cron.job
    WHERE jobname = 'form-response-delivery-worker'
  ),
  'scheduled worker keeps provider calls safely inside the delivery lease'
);
SELECT ok(
  (
    SELECT position('audit-worker-secret' IN command) = 0
      AND position('https://audit-project.supabase.co' IN command) = 0
      AND position('vault.decrypted_secrets' IN command) > 0
    FROM cron.job
    WHERE jobname = 'form-response-delivery-worker'
  ),
  'cron command resolves Vault values at runtime without embedding secrets'
);
DO $$
BEGIN
  PERFORM public.configure_form_response_delivery_worker_schedule();
END;
$$;
SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'form-response-delivery-worker'),
  1::BIGINT,
  'cron schedule replacement is idempotent'
);

INSERT INTO public.edge_rate_limits (bucket, key_hash, window_started_at, request_count)
VALUES
  ('cleanup-regression', 'expired', now() - INTERVAL '2 days', 1),
  ('cleanup-regression', 'current', now(), 1)
ON CONFLICT (bucket, key_hash) DO UPDATE
SET window_started_at = EXCLUDED.window_started_at,
    request_count = EXCLUDED.request_count;

SELECT is(
  public.cleanup_edge_rate_limits(INTERVAL '24 hours', 100),
  1,
  'rate-limit retention deletes the expired identity in a bounded batch'
);
SELECT is(
  (SELECT array_agg(key_hash ORDER BY key_hash) FROM public.edge_rate_limits WHERE bucket = 'cleanup-regression'),
  ARRAY['current']::TEXT[],
  'rate-limit retention preserves active windows'
);
SELECT is(
  (SELECT count(*) FROM cron.job WHERE jobname = 'edge-rate-limits-cleanup'),
  1::BIGINT,
  'rate-limit retention has exactly one scheduled job'
);

DELETE FROM public.forms
WHERE id = '10000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT
      (SELECT count(*) FROM public.form_responses WHERE form_id = '10000000-0000-4000-8000-000000000001')
      + (SELECT count(*) FROM public.form_sessions WHERE form_id = '10000000-0000-4000-8000-000000000001')
      + (SELECT count(*) FROM public.form_page_events WHERE form_id = '10000000-0000-4000-8000-000000000001')
      + (SELECT count(*) FROM public.form_response_deliveries WHERE form_id = '10000000-0000-4000-8000-000000000001')
      + (SELECT count(*) FROM public.form_workflow_executions WHERE form_id = '10000000-0000-4000-8000-000000000001')
  ),
  0::BIGINT,
  'deleting a form cleans every telemetry, outbox and workflow ledger row'
);

SELECT * FROM finish();
ROLLBACK;
