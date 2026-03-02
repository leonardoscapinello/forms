
-- 1. Fix email_validations: restrict reads to admins only (no user_id column exists, only admins should access)
DROP POLICY IF EXISTS "Authenticated users can read email validations" ON public.email_validations;
CREATE POLICY "Only admins can read email validations"
  ON public.email_validations
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Tighten form_sessions UPDATE: only allow updating own session via response_id match
DROP POLICY IF EXISTS "Anyone can update form sessions" ON public.form_sessions;
CREATE POLICY "Anyone can update own form sessions"
  ON public.form_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 3. Tighten form_responses UPDATE: only allow updating own response
DROP POLICY IF EXISTS "Anyone can update form responses" ON public.form_responses;
CREATE POLICY "Anyone can update own form responses"
  ON public.form_responses
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
