BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

SELECT ok(
  public.initial_admin_setup_available(),
  'a clean installation reports bootstrap available'
);

CREATE TEMP TABLE captured_setup_claim (claim_id UUID NOT NULL);
INSERT INTO captured_setup_claim
SELECT public.claim_initial_admin_setup();

SELECT isnt(
  (SELECT claim_id FROM captured_setup_claim),
  NULL::UUID,
  'the first caller atomically acquires a setup claim'
);

SELECT is(
  public.claim_initial_admin_setup(),
  NULL::UUID,
  'a concurrent caller cannot acquire a second setup claim'
);

SELECT is(
  public.release_initial_admin_setup('11111111-1111-4111-8111-111111111111'),
  FALSE,
  'a different claim cannot release the active setup lease'
);

SELECT ok(
  public.release_initial_admin_setup((SELECT claim_id FROM captured_setup_claim)),
  'the exact claim can be released while all user stores remain empty'
);

TRUNCATE captured_setup_claim;
INSERT INTO captured_setup_claim
SELECT public.claim_initial_admin_setup();

SELECT isnt(
  (SELECT claim_id FROM captured_setup_claim),
  NULL::UUID,
  'bootstrap can be claimed again after an acknowledged empty rollback'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-0000000000f1',
  'initial-admin-regression@example.invalid',
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp()
);

SELECT is(
  (
    SELECT role
    FROM public.user_roles
    WHERE user_id = '00000000-0000-4000-8000-0000000000f1'
  ),
  'user'::public.app_role,
  'the global auth trigger never grants administrator implicitly'
);

SELECT ok(
  NOT public.complete_initial_admin_setup(
    (SELECT claim_id FROM captured_setup_claim),
    '00000000-0000-4000-8000-0000000000f1'
  ),
  'bootstrap completion rejects a user whose admin role was not acknowledged'
);

UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = '00000000-0000-4000-8000-0000000000f1'
  AND role = 'user';

SELECT ok(
  public.complete_initial_admin_setup(
    (SELECT claim_id FROM captured_setup_claim),
    '00000000-0000-4000-8000-0000000000f1'
  ),
  'bootstrap completes only after the exact administrator role exists'
);

SELECT ok(
  NOT public.initial_admin_setup_available(),
  'completed bootstrap remains closed'
);

SELECT * FROM finish();
ROLLBACK;
