-- A form can switch between retaining partial responses and resume-only state
-- during one respondent session. Timestamp both stores and keep the same
-- sequence fence so form-public-get can select the newest snapshot safely.

ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- The existing completion/sequence trigger intentionally turns these legacy
-- row updates into no-ops. This migration already holds an ACCESS EXCLUSIVE
-- table lock, so suspend only that trigger for the deterministic backfill and
-- restore it before enforcing NOT NULL.
ALTER TABLE public.form_responses
  DISABLE TRIGGER preserve_completed_form_response_trigger;

UPDATE public.form_responses
SET updated_at = COALESCE(completed_at, created_at, statement_timestamp())
WHERE updated_at IS NULL;

ALTER TABLE public.form_responses
  ENABLE TRIGGER preserve_completed_form_response_trigger;

ALTER TABLE public.form_responses
  ALTER COLUMN updated_at SET DEFAULT statement_timestamp(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.preserve_completed_form_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The legacy-encryption RPC sets this transaction-local flag. It may only
  -- replace answers/metadata with encrypted strings while every other column,
  -- including the canonical updated_at fence, remains unchanged.
  IF current_setting('app.form_response_encryption_backfill', true) = 'on'
    AND current_user::TEXT = pg_catalog.pg_get_userbyid((
      SELECT procedure.proowner
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = 'public.preserve_completed_form_response()'::regprocedure
    ))
    AND (to_jsonb(NEW) - 'answers' - 'metadata')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'answers' - 'metadata')
    AND jsonb_typeof(NEW.answers) = 'string'
    AND (NEW.answers #>> '{}') LIKE 'enc:%'
    AND (
      (OLD.metadata IS NULL AND NEW.metadata IS NULL)
      OR (
        OLD.metadata IS NOT NULL
        AND jsonb_typeof(NEW.metadata) = 'string'
        AND (NEW.metadata #>> '{}') LIKE 'enc:%'
      )
    ) THEN
    RETURN NEW;
  END IF;

  -- The first completed payload remains the canonical lead forever.
  IF OLD.completed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- A completion always wins. Older/equal partial writes remain true no-ops,
  -- including their updated_at marker.
  IF NEW.completed_at IS NULL
    AND OLD.client_save_sequence IS NOT NULL
    AND (
      NEW.client_save_sequence IS NULL
      OR NEW.client_save_sequence <= OLD.client_save_sequence
    ) THEN
    RETURN OLD;
  END IF;

  NEW.updated_at := statement_timestamp();
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.form_responses.updated_at IS
  'Server timestamp of the latest sequence-fenced canonical response payload.';
