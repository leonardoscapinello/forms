BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

SELECT has_trigger(
  'public',
  'form_sessions',
  'preserve_completed_form_session_trigger',
  'completed sessions have a database-level anti-regression trigger'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-4000-8000-0000000000e1',
  'completed-session-regression@example.invalid',
  '{}'::jsonb,
  now(),
  now()
);

INSERT INTO public.forms (id, user_id, title, status, data)
VALUES (
  '10000000-0000-4000-8000-0000000000e1',
  '00000000-0000-4000-8000-0000000000e1',
  'Completed session regression',
  'published',
  '{}'::jsonb
);

INSERT INTO public.form_sessions (
  id, form_id, response_id, status, started_at, completed_at,
  last_seen_at, current_page_index, pages_visited, total_pages
)
VALUES (
  '50000000-0000-4000-8000-0000000000e1',
  '10000000-0000-4000-8000-0000000000e1',
  'completed-session-response',
  'completed',
  now() - interval '10 minutes',
  now() - interval '1 minute',
  now() - interval '1 minute',
  2,
  3,
  3
);

UPDATE public.form_sessions
SET status = 'active',
    completed_at = NULL,
    current_page_index = 0,
    pages_visited = 1,
    last_seen_at = now()
WHERE id = '50000000-0000-4000-8000-0000000000e1';

SELECT is(
  (SELECT status FROM public.form_sessions
    WHERE id = '50000000-0000-4000-8000-0000000000e1'),
  'completed',
  'a delayed heartbeat cannot regress completed status'
);

SELECT is(
  (SELECT pages_visited FROM public.form_sessions
    WHERE id = '50000000-0000-4000-8000-0000000000e1'),
  3,
  'a delayed heartbeat cannot replace canonical completion telemetry'
);

SELECT * FROM finish();
ROLLBACK;
