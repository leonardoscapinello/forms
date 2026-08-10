
-- =====================================================
-- FIX: Convert RESTRICTIVE policies to PERMISSIVE
-- RESTRICTIVE-only = no access at all in PostgreSQL
-- We need PERMISSIVE policies for proper access control
-- =====================================================

-- This table existed in the original hosted project but was missing from the
-- migration history. Define it here so clean projects are reproducible.
CREATE TABLE IF NOT EXISTS public.email_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  status text NOT NULL,
  overall_score numeric NOT NULL DEFAULT 0,
  is_safe_to_send boolean,
  is_deliverable boolean,
  is_disabled boolean,
  is_disposable boolean,
  is_free_email boolean,
  is_role_account boolean,
  is_catch_all boolean,
  is_spamtrap boolean,
  is_valid_syntax boolean,
  can_connect_smtp boolean,
  has_inbox_full boolean,
  mx_accepts_mail boolean,
  mx_records jsonb,
  domain text,
  username text,
  verification_mode text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_validations ENABLE ROW LEVEL SECURITY;

-- profiles: drop all existing and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all profiles"
  ON public.profiles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- user_roles: drop all existing and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view own role"
  ON public.user_roles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- integration_settings: fix to PERMISSIVE
DROP POLICY IF EXISTS "Only admins can view integration settings" ON public.integration_settings;
DROP POLICY IF EXISTS "Admins can manage integration settings" ON public.integration_settings;

CREATE POLICY "Admins can manage integration settings"
  ON public.integration_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- forms: ensure owner and admin policies are PERMISSIVE
DROP POLICY IF EXISTS "Users can view own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can create own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can update own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can delete own forms" ON public.forms;
DROP POLICY IF EXISTS "Admins can manage all forms" ON public.forms;
DROP POLICY IF EXISTS "Published or closed forms are publicly readable" ON public.forms;

CREATE POLICY "Users can view own forms"
  ON public.forms AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own forms"
  ON public.forms AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own forms"
  ON public.forms AS PERMISSIVE FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own forms"
  ON public.forms AS PERMISSIVE FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all forms"
  ON public.forms AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Published or closed forms are publicly readable"
  ON public.forms AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (status = ANY (ARRAY['published'::text, 'closed'::text]));

-- folders: fix to PERMISSIVE
DROP POLICY IF EXISTS "Users can view own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can create own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;

CREATE POLICY "Users can view own folders"
  ON public.folders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own folders"
  ON public.folders AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON public.folders AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own folders"
  ON public.folders AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- gallery_folders: fix to PERMISSIVE
DROP POLICY IF EXISTS "Users can view own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can create own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can update own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can delete own gallery folders" ON public.gallery_folders;

CREATE POLICY "Users can view own gallery folders"
  ON public.gallery_folders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own gallery folders"
  ON public.gallery_folders AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gallery folders"
  ON public.gallery_folders AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own gallery folders"
  ON public.gallery_folders AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- gallery_files: fix to PERMISSIVE
DROP POLICY IF EXISTS "Users can view own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can create own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can update own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can delete own gallery files" ON public.gallery_files;

CREATE POLICY "Users can view own gallery files"
  ON public.gallery_files AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create own gallery files"
  ON public.gallery_files AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gallery files"
  ON public.gallery_files AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can delete own gallery files"
  ON public.gallery_files AS PERMISSIVE FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role));

-- tags: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;
DROP POLICY IF EXISTS "Admins can manage tags" ON public.tags;

CREATE POLICY "Authenticated users can view tags"
  ON public.tags AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage tags"
  ON public.tags AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- form_tags: fix to PERMISSIVE
DROP POLICY IF EXISTS "Users can view own form tags" ON public.form_tags;
DROP POLICY IF EXISTS "Users can manage tags on own forms" ON public.form_tags;
DROP POLICY IF EXISTS "Users can remove tags from own forms" ON public.form_tags;

CREATE POLICY "Users can view own form tags"
  ON public.form_tags AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage tags on own forms"
  ON public.form_tags AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can remove tags from own forms"
  ON public.form_tags AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS (SELECT 1 FROM forms WHERE forms.id = form_tags.form_id AND forms.user_id = auth.uid())) OR has_role(auth.uid(), 'admin'::app_role));

-- email_validations: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can read email validations" ON public.email_validations;

CREATE POLICY "Authenticated users can read email validations"
  ON public.email_validations AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- form_sessions: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can insert form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update form session by response_id" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form session" ON public.form_sessions;

CREATE POLICY "Authenticated users can view form sessions"
  ON public.form_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Anyone can insert form sessions"
  ON public.form_sessions AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update form sessions"
  ON public.form_sessions AS PERMISSIVE FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

-- form_responses: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can insert form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update own form response" ON public.form_responses;

CREATE POLICY "Authenticated users can view form responses"
  ON public.form_responses AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Anyone can insert form responses"
  ON public.form_responses AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update form responses"
  ON public.form_responses AS PERMISSIVE FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

-- form_page_events: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Anyone can insert form page events" ON public.form_page_events;

CREATE POLICY "Authenticated users can view form page events"
  ON public.form_page_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Anyone can insert form page events"
  ON public.form_page_events AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- pixel_events_log: fix to PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can view pixel event logs" ON public.pixel_events_log;
DROP POLICY IF EXISTS "Anyone can insert pixel event logs" ON public.pixel_events_log;

CREATE POLICY "Authenticated users can view pixel event logs"
  ON public.pixel_events_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Anyone can insert pixel event logs"
  ON public.pixel_events_log AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);
