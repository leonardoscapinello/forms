
-- Fix form_responses SELECT policy: scope to form owner
DROP POLICY IF EXISTS "Authenticated users can view form responses" ON public.form_responses;
CREATE POLICY "Form owners can view form responses"
ON public.form_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id::text = form_responses.form_id
    AND forms.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix form_sessions SELECT policy: scope to form owner
DROP POLICY IF EXISTS "Authenticated users can view form sessions" ON public.form_sessions;
CREATE POLICY "Form owners can view form sessions"
ON public.form_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id::text = form_sessions.form_id
    AND forms.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix pixel_events_log SELECT policy: scope to form owner
DROP POLICY IF EXISTS "Authenticated users can view pixel event logs" ON public.pixel_events_log;
CREATE POLICY "Form owners can view pixel event logs"
ON public.pixel_events_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id::text = pixel_events_log.form_id
    AND forms.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Fix form_page_events SELECT policy: scope to form owner
DROP POLICY IF EXISTS "Authenticated users can view form page events" ON public.form_page_events;
CREATE POLICY "Form owners can view form page events"
ON public.form_page_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.forms
    WHERE forms.id::text = form_page_events.form_id
    AND forms.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);
