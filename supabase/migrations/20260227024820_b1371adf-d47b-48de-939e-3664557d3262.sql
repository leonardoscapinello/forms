
-- Fix RLS policies: recreate INSERT/UPDATE policies as PERMISSIVE for anonymous form submission

-- form_sessions
DROP POLICY IF EXISTS "Anyone can insert form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form session" ON public.form_sessions;
CREATE POLICY "Anyone can insert form sessions" ON public.form_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own form session" ON public.form_sessions FOR UPDATE USING (true);

-- form_responses
DROP POLICY IF EXISTS "Anyone can insert form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update own form response" ON public.form_responses;
CREATE POLICY "Anyone can insert form responses" ON public.form_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update own form response" ON public.form_responses FOR UPDATE USING (true) WITH CHECK (true);

-- form_page_events
DROP POLICY IF EXISTS "Anyone can insert form page events" ON public.form_page_events;
CREATE POLICY "Anyone can insert form page events" ON public.form_page_events FOR INSERT WITH CHECK (true);

-- pixel_events_log
DROP POLICY IF EXISTS "Anyone can insert pixel event logs" ON public.pixel_events_log;
CREATE POLICY "Anyone can insert pixel event logs" ON public.pixel_events_log FOR INSERT WITH CHECK (true);
