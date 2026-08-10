-- Public form data is delivered through form-public-get, which strips editor
-- metadata and issues a short-lived signed submission token. Direct table
-- access would bypass that boundary.
DROP POLICY IF EXISTS "Published forms are publicly readable" ON public.forms;
DROP POLICY IF EXISTS "Published or closed forms are publicly readable" ON public.forms;

-- Anonymous writes are accepted only by form-public-save after token,
-- schema, form-status, and rate-limit validation.
DROP POLICY IF EXISTS "Anyone can insert form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update own form response" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update form responses" ON public.form_responses;

DROP POLICY IF EXISTS "Anyone can insert form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form session" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update form sessions" ON public.form_sessions;

DROP POLICY IF EXISTS "Anyone can insert form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Anyone can insert pixel event logs" ON public.pixel_events_log;

REVOKE SELECT ON public.forms FROM anon;
REVOKE INSERT, UPDATE ON public.form_responses FROM anon;
REVOKE INSERT, UPDATE ON public.form_sessions FROM anon;
REVOKE INSERT ON public.form_page_events FROM anon;
REVOKE INSERT ON public.pixel_events_log FROM anon;
