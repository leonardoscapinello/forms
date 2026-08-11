-- Make API-role privileges deterministic on a clean reset and on production.
--
-- Supabase projects may have different default ACL owners (`postgres` locally,
-- `supabase_admin` for objects created through parts of the dashboard). RLS is
-- necessary but it does not authorize missing SELECT/DML privileges and it does
-- not protect TRUNCATE. Start from no privileges and grant only the operations
-- represented by the policies and server-side Edge Function architecture.

REVOKE ALL ON TABLE
  public.app_settings,
  public.edge_rate_limits,
  public.email_validations,
  public.folders,
  public.form_page_events,
  public.form_response_deliveries,
  public.form_responses,
  public.form_sessions,
  public.form_tags,
  public.form_workflow_executions,
  public.forms,
  public.gallery_files,
  public.gallery_folders,
  public.integration_settings,
  public.pixel_events_log,
  public.profiles,
  public.tags,
  public.user_roles
FROM PUBLIC, anon, authenticated, service_role;

-- Public application identity is the only table exposed to anonymous reads.
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;

-- Builder/dashboard data. RLS remains the row-level authorization boundary.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.forms,
  public.folders,
  public.gallery_files,
  public.gallery_folders,
  public.tags
TO authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.form_tags TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT, DELETE ON TABLE public.email_validations TO authenticated;

-- Telemetry is readable by active owners/admins, but all writes stay behind
-- authenticated Edge Functions using the service role.
GRANT SELECT ON TABLE
  public.form_responses,
  public.form_sessions,
  public.form_page_events,
  public.pixel_events_log
TO authenticated;

-- Edge Functions require ordinary table privileges even though service_role
-- bypasses RLS. TRUNCATE/REFERENCES/TRIGGER remain intentionally absent.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.app_settings,
  public.edge_rate_limits,
  public.email_validations,
  public.folders,
  public.form_page_events,
  public.form_response_deliveries,
  public.form_responses,
  public.form_sessions,
  public.form_tags,
  public.form_workflow_executions,
  public.forms,
  public.gallery_files,
  public.gallery_folders,
  public.integration_settings,
  public.pixel_events_log,
  public.profiles,
  public.tags,
  public.user_roles
TO service_role;

-- Trigger functions never need direct API execution. Older Supabase defaults
-- may have granted EXECUTE explicitly to API roles, so revoking only PUBLIC is
-- insufficient on an upgraded production project.
REVOKE ALL ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_deleted_form_telemetry()
  FROM PUBLIC, anon, authenticated, service_role;

-- The validation history UI allows an administrator to clear a cache entry.
-- Verification writes continue to use the service-only Edge Function.
DROP POLICY IF EXISTS "Active admins can delete email validations"
  ON public.email_validations;
CREATE POLICY "Active admins can delete email validations"
ON public.email_validations
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Disabled accounts must not retain access to auxiliary builder resources.
DROP POLICY IF EXISTS "Users can create own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can view own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can update own folders" ON public.folders;
DROP POLICY IF EXISTS "Users can delete own folders" ON public.folders;

CREATE POLICY "Active users can create own folders"
ON public.folders FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can view own folders"
ON public.folders FOR SELECT TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can update own folders"
ON public.folders FOR UPDATE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can delete own folders"
ON public.folders FOR DELETE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can create own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can view own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can update own gallery folders" ON public.gallery_folders;
DROP POLICY IF EXISTS "Users can delete own gallery folders" ON public.gallery_folders;

CREATE POLICY "Active users can create own gallery folders"
ON public.gallery_folders FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can view own gallery folders"
ON public.gallery_folders FOR SELECT TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can update own gallery folders"
ON public.gallery_folders FOR UPDATE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can delete own gallery folders"
ON public.gallery_folders FOR DELETE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can create own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can view own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can update own gallery files" ON public.gallery_files;
DROP POLICY IF EXISTS "Users can delete own gallery files" ON public.gallery_files;

CREATE POLICY "Active users can create own gallery files"
ON public.gallery_files FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
  )
);

CREATE POLICY "Active users can view own gallery files"
ON public.gallery_files FOR SELECT TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can update own gallery files"
ON public.gallery_files FOR UPDATE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can delete own gallery files"
ON public.gallery_files FOR DELETE TO authenticated
USING (
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
    )
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Authenticated users can view tags" ON public.tags;
CREATE POLICY "Active users can view tags"
ON public.tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Users can manage tags on own forms" ON public.form_tags;
DROP POLICY IF EXISTS "Users can remove tags from own forms" ON public.form_tags;
DROP POLICY IF EXISTS "Users can view own form tags" ON public.form_tags;

CREATE POLICY "Active users can add tags to own forms"
ON public.form_tags FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.forms AS form_record
    INNER JOIN public.profiles AS profile
      ON profile.user_id = form_record.user_id
     AND profile.is_active = true
    WHERE form_record.id = form_tags.form_id
      AND form_record.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can remove tags from own forms"
ON public.form_tags FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.forms AS form_record
    INNER JOIN public.profiles AS profile
      ON profile.user_id = form_record.user_id
     AND profile.is_active = true
    WHERE form_record.id = form_tags.form_id
      AND form_record.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Active users can view own form tags"
ON public.form_tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.forms AS form_record
    INNER JOIN public.profiles AS profile
      ON profile.user_id = form_record.user_id
     AND profile.is_active = true
    WHERE form_record.id = form_tags.form_id
      AND form_record.user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Future objects created by CLI migrations must also start closed. Migrations
-- must grant each operation explicitly, as this migration does above.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON POLICY "Active admins can delete email validations"
  ON public.email_validations IS
  'Allows active administrators to remove a hashed verification cache row; providers and plaintext addresses are never exposed.';
