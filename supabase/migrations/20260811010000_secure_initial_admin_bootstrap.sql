-- The initial administrator is a privileged bootstrap operation, not a
-- special case of public signup. Serialize it in Postgres and require an
-- explicit Edge Function promotion acknowledgement.

CREATE TABLE IF NOT EXISTS public.application_setup_state (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  claim_id UUID,
  claim_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.application_setup_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.application_setup_state (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON TABLE public.application_setup_state FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.application_setup_state IS
  'Private singleton used to serialize the one-time initial administrator bootstrap.';

-- A normal Auth insert must never grant itself administrator rights. The
-- bootstrap Edge Function and authenticated admin-create-user route perform
-- an exact-ACK promotion after their own authorization checks.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.initial_admin_setup_available()
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1)
    AND EXISTS (
      SELECT 1
      FROM public.application_setup_state AS setup
      WHERE setup.singleton = TRUE
        AND setup.completed_at IS NULL
        AND (
          setup.claim_id IS NULL
          OR setup.claim_expires_at <= clock_timestamp()
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.claim_initial_admin_setup()
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_state public.application_setup_state%ROWTYPE;
  new_claim UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forms.initial_admin_setup', 0)
  );

  INSERT INTO public.application_setup_state (singleton)
  VALUES (TRUE)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT *
  INTO current_state
  FROM public.application_setup_state
  WHERE singleton = TRUE
  FOR UPDATE;

  IF current_state.completed_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM auth.users LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.profiles LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.user_roles LIMIT 1)
    OR (
      current_state.claim_id IS NOT NULL
      AND (
        current_state.claim_expires_at IS NULL
        OR current_state.claim_expires_at > clock_timestamp()
      )
    )
  THEN
    RETURN NULL;
  END IF;

  new_claim := gen_random_uuid();
  UPDATE public.application_setup_state
  SET claim_id = new_claim,
      claim_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      updated_at = clock_timestamp()
  WHERE singleton = TRUE;

  RETURN new_claim;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_initial_admin_setup(p_claim_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed_rows INTEGER;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forms.initial_admin_setup', 0)
  );

  UPDATE public.application_setup_state
  SET claim_id = NULL,
      claim_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE singleton = TRUE
    AND completed_at IS NULL
    AND claim_id = p_claim_id
    AND NOT EXISTS (SELECT 1 FROM auth.users LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.profiles LIMIT 1)
    AND NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1);

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_initial_admin_setup(
  p_claim_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed_rows INTEGER;
  current_state public.application_setup_state%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forms.initial_admin_setup', 0)
  );

  SELECT *
  INTO current_state
  FROM public.application_setup_state
  WHERE singleton = TRUE
  FOR UPDATE;

  IF NOT FOUND OR current_state.claim_id IS DISTINCT FROM p_claim_id THEN
    RETURN FALSE;
  END IF;

  IF current_state.completed_at IS NOT NULL THEN
    RETURN EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id)
      AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = p_user_id AND role = 'admin'
      );
  END IF;

  UPDATE public.application_setup_state
  SET completed_at = clock_timestamp(),
      claim_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE singleton = TRUE
    AND completed_at IS NULL
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id)
    AND EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = p_user_id AND role = 'admin'
    );

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  RETURN changed_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.initial_admin_setup_available() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_initial_admin_setup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_initial_admin_setup(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_initial_admin_setup(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initial_admin_setup_available() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_initial_admin_setup() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_initial_admin_setup(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_initial_admin_setup(UUID, UUID) TO service_role;
