-- Legacy response rows predate application-layer encryption. The Edge
-- backfill encrypts them with ENCRYPTION_SECRET and this RPC provides an exact
-- compare-and-swap acknowledgement so a concurrent autosave can never be
-- overwritten by stale plaintext.

-- Completed responses are normally immutable. Permit only the narrow
-- application-encryption rewrite performed by the RPC below; every business
-- column must stay byte-for-byte equivalent and NULL metadata stays NULL.
CREATE OR REPLACE FUNCTION public.preserve_completed_form_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
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

  IF OLD.completed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  IF NEW.completed_at IS NULL
    AND OLD.client_save_sequence IS NOT NULL
    AND (
      NEW.client_save_sequence IS NULL
      OR NEW.client_save_sequence <= OLD.client_save_sequence
    ) THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.migrate_form_response_encryption(
  p_id UUID,
  p_expected_answers JSONB,
  p_expected_metadata JSONB,
  p_encrypted_answers TEXT,
  p_encrypted_metadata TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  IF p_id IS NULL OR p_encrypted_answers IS NULL
    OR p_encrypted_answers !~ '^enc:'
    OR (p_encrypted_metadata IS NOT NULL AND p_encrypted_metadata !~ '^enc:')
    OR ((p_expected_metadata IS NULL) <> (p_encrypted_metadata IS NULL)) THEN
    RAISE EXCEPTION 'invalid_encrypted_response_payload' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.form_response_encryption_backfill', 'on', true);
  BEGIN
    UPDATE public.form_responses AS response
    SET answers = to_jsonb(p_encrypted_answers),
        metadata = CASE
          WHEN p_encrypted_metadata IS NULL THEN NULL
          ELSE to_jsonb(p_encrypted_metadata)
        END
    WHERE response.id = p_id
      AND response.answers IS NOT DISTINCT FROM p_expected_answers
      AND response.metadata IS NOT DISTINCT FROM p_expected_metadata;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.form_response_encryption_backfill', 'off', true);
    RAISE;
  END;
  PERFORM set_config('app.form_response_encryption_backfill', 'off', true);
  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_form_response_encryption(
  UUID, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_form_response_encryption(
  UUID, JSONB, JSONB, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.migrate_form_response_encryption(
  UUID, JSONB, JSONB, TEXT, TEXT
) IS 'CAS migration of one legacy response to application-encrypted JSON; service role only.';
