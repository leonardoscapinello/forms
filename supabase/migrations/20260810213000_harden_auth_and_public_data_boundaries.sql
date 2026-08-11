-- Enforce account activation at the database authorization boundary and keep
-- all public form writes behind the validated Edge Function endpoints.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS roles
    INNER JOIN public.profiles AS profiles
      ON profiles.user_id = roles.user_id
     AND profiles.is_active = true
    WHERE roles.user_id = _user_id
      AND roles.role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

-- RLS cannot compare OLD and NEW values. This trigger prevents a regular user
-- from reactivating their own account or changing identity fields while still
-- allowing active administrators and service/database roles to manage them.
CREATE OR REPLACE FUNCTION public.protect_profile_security_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  request_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF request_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'profile_update_forbidden' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'profile_security_fields_are_admin_only' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_security_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_security_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_security_fields_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_security_fields();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Active users can update own profile"
ON public.profiles
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND is_active = true
)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Active admins can manage all profiles"
ON public.profiles
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- A disabled account must also lose owner access to forms. Public rendering is
-- exclusively served by form-public-get, which returns a minimized payload.
DROP POLICY IF EXISTS "Users can view own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can create own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can update own forms" ON public.forms;
DROP POLICY IF EXISTS "Users can delete own forms" ON public.forms;
DROP POLICY IF EXISTS "Admins can manage all forms" ON public.forms;
DROP POLICY IF EXISTS "Published forms are publicly readable" ON public.forms;
DROP POLICY IF EXISTS "Published or closed forms are publicly readable" ON public.forms;

CREATE POLICY "Active users can view own forms"
ON public.forms
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can create own forms"
ON public.forms
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can update own forms"
ON public.forms
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_active = true
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can delete own forms"
ON public.forms
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

CREATE POLICY "Active admins can manage all forms"
ON public.forms
AS PERMISSIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE SELECT ON TABLE public.forms FROM anon;

-- Remove every historical public-write policy name. The service role used by
-- form-public-save/pixel-event remains the only writer for these tables.
DROP POLICY IF EXISTS "Anyone can insert form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update own form response" ON public.form_responses;
DROP POLICY IF EXISTS "Anyone can update form responses" ON public.form_responses;

DROP POLICY IF EXISTS "Anyone can insert form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form session" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update own form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Anyone can update form session by response_id" ON public.form_sessions;

DROP POLICY IF EXISTS "Anyone can insert form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Anyone can insert pixel event logs" ON public.pixel_events_log;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.form_responses FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.form_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.form_page_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.pixel_events_log FROM anon, authenticated;
REVOKE SELECT ON TABLE public.form_responses, public.form_sessions, public.form_page_events, public.pixel_events_log FROM anon;

-- Owner-scoped reads stay available for the dashboards, but only while the
-- owner account is active. has_role() applies the same rule to administrators.
DROP POLICY IF EXISTS "Authenticated users can view form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Form owners can view form responses" ON public.form_responses;
DROP POLICY IF EXISTS "Active form owners can view form responses" ON public.form_responses;
CREATE POLICY "Active form owners can view form responses"
ON public.form_responses
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.forms
    INNER JOIN public.profiles ON profiles.user_id = forms.user_id
    WHERE forms.id::text = form_responses.form_id
      AND forms.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Authenticated users can view form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Form owners can view form sessions" ON public.form_sessions;
DROP POLICY IF EXISTS "Active form owners can view form sessions" ON public.form_sessions;
CREATE POLICY "Active form owners can view form sessions"
ON public.form_sessions
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.forms
    INNER JOIN public.profiles ON profiles.user_id = forms.user_id
    WHERE forms.id::text = form_sessions.form_id
      AND forms.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Authenticated users can view form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Form owners can view form page events" ON public.form_page_events;
DROP POLICY IF EXISTS "Active form owners can view form page events" ON public.form_page_events;
CREATE POLICY "Active form owners can view form page events"
ON public.form_page_events
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.forms
    INNER JOIN public.profiles ON profiles.user_id = forms.user_id
    WHERE forms.id::text = form_page_events.form_id
      AND forms.user_id = auth.uid()
      AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Authenticated users can view pixel event logs" ON public.pixel_events_log;
DROP POLICY IF EXISTS "Form owners can view pixel event logs" ON public.pixel_events_log;
DROP POLICY IF EXISTS "Active form owners can view pixel event logs" ON public.pixel_events_log;
CREATE POLICY "Active form owners can view pixel event logs"
ON public.pixel_events_log
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.forms
    INNER JOIN public.profiles ON profiles.user_id = forms.user_id
    WHERE forms.id::text = pixel_events_log.form_id
      AND forms.user_id = auth.uid()
      AND profiles.is_active = true
  )
);
