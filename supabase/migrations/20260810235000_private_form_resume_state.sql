-- Resume answers belong on the server, not in browser storage. Forms configured
-- to retain only completed responses still need a short-lived canonical draft,
-- so keep it in a private encrypted table with ordered writes and hard expiry.

CREATE TABLE IF NOT EXISTS public.form_submission_resume_states (
  form_id UUID NOT NULL,
  response_id UUID NOT NULL,
  session_id UUID NOT NULL,
  answers JSONB NOT NULL,
  metadata JSONB NOT NULL,
  pages_visited INTEGER NOT NULL DEFAULT 0,
  client_save_sequence BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (form_id, response_id),
  CONSTRAINT form_submission_resume_form_fk
    FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE,
  CONSTRAINT form_submission_resume_expiry_order
    CHECK (expires_at > updated_at)
);

CREATE INDEX IF NOT EXISTS idx_form_submission_resume_expiry
  ON public.form_submission_resume_states(expires_at);

ALTER TABLE public.form_submission_resume_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.form_submission_resume_states
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_submission_resume_states
  TO service_role;

CREATE OR REPLACE FUNCTION public.persist_form_submission_resume(
  p_form_id UUID,
  p_response_id UUID,
  p_session_id UUID,
  p_answers JSONB,
  p_metadata JSONB,
  p_pages_visited INTEGER,
  p_client_save_sequence BIGINT,
  p_ttl INTERVAL DEFAULT INTERVAL '2 hours'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := statement_timestamp();
BEGIN
  IF p_form_id IS NULL
    OR p_response_id IS NULL
    OR p_session_id IS NULL
    OR p_answers IS NULL
    OR p_metadata IS NULL
    OR p_pages_visited < 0
    OR p_client_save_sequence < 0
    OR p_ttl < INTERVAL '5 minutes'
    OR p_ttl > INTERVAL '2 hours'
  THEN
    RAISE EXCEPTION 'invalid_form_resume_state' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.form_submission_resume_states (
    form_id,
    response_id,
    session_id,
    answers,
    metadata,
    pages_visited,
    client_save_sequence,
    updated_at,
    expires_at
  ) VALUES (
    p_form_id,
    p_response_id,
    p_session_id,
    p_answers,
    p_metadata,
    p_pages_visited,
    p_client_save_sequence,
    v_now,
    v_now + p_ttl
  )
  ON CONFLICT (form_id, response_id) DO UPDATE
  SET session_id = EXCLUDED.session_id,
      answers = EXCLUDED.answers,
      metadata = EXCLUDED.metadata,
      pages_visited = EXCLUDED.pages_visited,
      client_save_sequence = EXCLUDED.client_save_sequence,
      updated_at = EXCLUDED.updated_at,
      expires_at = EXCLUDED.expires_at
  WHERE public.form_submission_resume_states.client_save_sequence
    < EXCLUDED.client_save_sequence;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_form_submission_resume(
  UUID, UUID, UUID, JSONB, JSONB, INTEGER, BIGINT, INTERVAL
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_form_submission_resume(
  UUID, UUID, UUID, JSONB, JSONB, INTEGER, BIGINT, INTERVAL
) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_form_submission_resume_states(
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 100000 THEN
    RAISE EXCEPTION 'invalid_form_resume_cleanup_batch' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT form_id, response_id
    FROM public.form_submission_resume_states
    WHERE expires_at <= statement_timestamp()
    ORDER BY expires_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.form_submission_resume_states AS state
  USING expired
  WHERE state.form_id = expired.form_id
    AND state.response_id = expired.response_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_form_submission_resume_states(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_form_submission_resume_states(INTEGER)
  TO service_role;

DO $$
DECLARE
  v_existing RECORD;
BEGIN
  FOR v_existing IN
    SELECT jobid FROM cron.job WHERE jobname = 'form-submission-resume-cleanup'
  LOOP
    PERFORM cron.unschedule(v_existing.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'form-submission-resume-cleanup',
    '*/15 * * * *',
    $job$SELECT public.cleanup_form_submission_resume_states(10000);$job$
  );
END;
$$;

COMMENT ON TABLE public.form_submission_resume_states IS
  'Encrypted, server-only, two-hour resume state for forms that do not retain partial responses.';
