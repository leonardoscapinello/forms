-- Return one coherent, paginated directory row per user. Browser code must not
-- merge independent profile and role reads or silently downgrade errors.
CREATE OR REPLACE FUNCTION public.get_admin_users(
  p_after_created_at TIMESTAMPTZ DEFAULT NULL,
  p_after_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  role TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.profiles AS caller_profile
      WHERE caller_profile.user_id = auth.uid()
        AND caller_profile.is_active = TRUE
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.user_roles AS caller_role
      WHERE caller_role.user_id = auth.uid()
        AND caller_role.role = 'admin'
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'admin_required';
  END IF;

  IF p_limit < 1 OR p_limit > 500
    OR (p_after_created_at IS NULL) <> (p_after_user_id IS NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_pagination';
  END IF;

  RETURN QUERY
  SELECT
    profile.user_id,
    profile.display_name,
    profile.email,
    profile.is_active,
    profile.created_at,
    role_summary.role
  FROM public.profiles AS profile
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN bool_or(user_role.role = 'admin') THEN 'admin'::TEXT
      WHEN count(*) > 0 THEN 'user'::TEXT
      ELSE NULL::TEXT
    END AS role
    FROM public.user_roles AS user_role
    WHERE user_role.user_id = profile.user_id
  ) AS role_summary
  WHERE p_after_created_at IS NULL
    OR (profile.created_at, profile.user_id) > (p_after_created_at, p_after_user_id)
  ORDER BY profile.created_at, profile.user_id
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_users(TIMESTAMPTZ, UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users(TIMESTAMPTZ, UUID, INTEGER)
  TO authenticated;
