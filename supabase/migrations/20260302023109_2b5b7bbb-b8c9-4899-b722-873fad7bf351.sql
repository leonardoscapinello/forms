
-- Drop ALL existing restrictive policies and recreate as PERMISSIVE

-- ═══ profiles ═══
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all profiles" ON public.profiles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ═══ user_roles ═══
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own role" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage all roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ═══ forms ═══
DROP POLICY IF EXISTS "Users can view own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can create own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can update own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can delete own forms" ON public.forms;
DROP POLICY IF EXISTS "Admins can manage all forms" ON public.forms;
DROP POLICY IF EXISTS "Published or closed forms are publicly readable" ON public.forms;

CREATE POLICY "Users can view own forms" ON public.forms AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create own forms" ON public.forms AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own forms" ON public.forms AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own forms" ON public.forms AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all forms" ON public.forms AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Published or closed forms are publicly readable" ON public.forms AS PERMISSIVE FOR SELECT TO anon, authenticated USING (status IN ('published', 'closed'));

-- ═══ folders ═══
DROP POLICY IF EXISTS "Users can view own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;

CREATE POLICY "Users can view own folders" ON public.folders AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own folders" ON public.folders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own folders" ON public.folders AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can delete own folders" ON public.folders AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- ═══ integration_settings ═══
DROP POLICY IF EXISTS "Admins can manage integration settings" ON public.integration_settings;

CREATE POLICY "Admins can manage integration settings" ON public.integration_settings AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ═══ gallery_folders ═══
DROP POLICY IF EXISTS "Users can view own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can create own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can update own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can delete own gallery folders" ON public.gallery_folders;

CREATE POLICY "Users can view own gallery folders" ON public.gallery_folders AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own gallery folders" ON public.gallery_folders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gallery folders" ON public.gallery_folders AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can delete own gallery folders" ON public.gallery_folders AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- ═══ gallery_files ═══
DROP POLICY IF EXISTS "Users can view own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can create own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can update own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can delete own gallery files" ON public.gallery_files;

CREATE POLICY "Users can view own gallery files" ON public.gallery_files AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can create own gallery files" ON public.gallery_files AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gallery files" ON public.gallery_files AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can delete own gallery files" ON public.gallery_files AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- ═══ tags ═══
DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;
DROP POLICY IF EXISTS "Admins can manage tags" ON public.tags;

CREATE POLICY "Authenticated users can view tags" ON public.tags AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage tags" ON public.tags AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ═══ form_tags ═══
DROP POLICY IF EXISTS "Users can view own form tags" ON public.form_tags;
DROP POLICY IF EXISTS "Users can manage tags on own forms" ON public.form_tags;
DROP POLICY IF EXISTS "Users can remove tags from own forms" ON public.form_tags;

CREATE POLICY "Users can view own form tags" ON public.form_tags AS PERMISSIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can manage tags on own forms" ON public.form_tags AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can remove tags from own forms" ON public.form_tags AS PERMISSIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- ═══ form_sessions ═══
DROP POLICY IF EXISTS "Authenticated users can view form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can insert form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update form sessions" ON public.form_sessions;

CREATE POLICY "Authenticated users can view form sessions" ON public.form_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "Anyone can insert form sessions" ON public.form_sessions AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update form sessions" ON public.form_sessions AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ═══ form_responses ═══
DROP POLICY IF EXISTS "Authenticated users can view form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can insert form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update form responses" ON public.form_responses;

CREATE POLICY "Authenticated users can view form responses" ON public.form_responses AS PERMISSIVE FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "Anyone can insert form responses" ON public.form_responses AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update form responses" ON public.form_responses AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ═══ form_page_events ═══
DROP POLICY IF EXISTS "Authenticated users can view form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Anyone can insert form page events" ON public.form_page_events;

CREATE POLICY "Authenticated users can view form page events" ON public.form_page_events AS PERMISSIVE FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "Anyone can insert form page events" ON public.form_page_events AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ═══ pixel_events_log ═══
DROP POLICY IF EXISTS "Authenticated users can view pixel event logs" ON public.pixel_events_log;
DROP POLICY IF EXISTS "Anyone can insert pixel event logs" ON public.pixel_events_log;

CREATE POLICY "Authenticated users can view pixel event logs" ON public.pixel_events_log AS PERMISSIVE FOR SELECT TO authenticated USING (auth.role() = 'authenticated');
CREATE POLICY "Anyone can insert pixel event logs" ON public.pixel_events_log AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ═══ email_validations ═══
DROP POLICY IF EXISTS "Authenticated users can read email validations" ON public.email_validations;

CREATE POLICY "Authenticated users can read email validations" ON public.email_validations AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
