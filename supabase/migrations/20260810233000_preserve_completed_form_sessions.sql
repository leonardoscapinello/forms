-- A progress heartbeat can race the atomic completion request. Once completion
-- is committed, no delayed browser/session update may make analytics report the
-- respondent as active or dropped again.

CREATE OR REPLACE FUNCTION public.preserve_completed_form_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'completed' OR OLD.completed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_completed_form_session_trigger
  ON public.form_sessions;
CREATE TRIGGER preserve_completed_form_session_trigger
BEFORE UPDATE ON public.form_sessions
FOR EACH ROW
EXECUTE FUNCTION public.preserve_completed_form_session();

REVOKE ALL ON FUNCTION public.preserve_completed_form_session()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.preserve_completed_form_session() IS
  'Keeps the first completed session immutable against delayed progress heartbeats.';
