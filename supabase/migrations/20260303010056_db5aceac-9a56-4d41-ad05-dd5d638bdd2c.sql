-- Drop overly permissive UPDATE policies on form_sessions and form_responses
-- All writes now go through form-public-save edge function (service role, bypasses RLS)

DROP POLICY IF EXISTS "Anyone can update own form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form responses" ON public.form_responses;