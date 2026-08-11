-- Order concurrent browser partial saves and make response completion,
-- session completion and the form_complete analytics event one transaction.

ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS client_save_sequence BIGINT;

CREATE OR REPLACE FUNCTION public.preserve_completed_form_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The first completed payload remains the canonical lead forever.
  IF OLD.completed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- A completion always wins. Partial payloads, including legacy payloads with
  -- no marker, may not overwrite a newer client sequence that reached the
  -- server first (for example a keepalive racing an older in-flight fetch).
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

-- Older deployments could have emitted more than one completion event. Keep
-- the first before installing the idempotency boundary.
WITH ranked_completions AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY form_id, response_id, event_type
           ORDER BY created_at, id
         ) AS position
  FROM public.form_page_events
  WHERE event_type = 'form_complete'
)
DELETE FROM public.form_page_events AS event
USING ranked_completions AS ranked
WHERE event.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_page_events_single_completion
  ON public.form_page_events(form_id, response_id, event_type)
  WHERE event_type = 'form_complete';

CREATE OR REPLACE FUNCTION public.persist_completed_form_submission(
  p_form_id TEXT,
  p_response_id TEXT,
  p_session_id UUID,
  p_answers JSONB,
  p_metadata JSONB,
  p_completed_at TIMESTAMPTZ,
  p_total_time_ms INTEGER,
  p_pages_visited INTEGER,
  p_client_save_sequence BIGINT,
  p_completion_time_on_page_ms INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session_rows INTEGER := 0;
BEGIN
  IF p_completed_at IS NULL THEN
    RAISE EXCEPTION 'completed_at_required';
  END IF;

  INSERT INTO public.form_responses (
    form_id,
    response_id,
    session_id,
    answers,
    metadata,
    total_time_ms,
    pages_visited,
    completed_at,
    client_save_sequence
  ) VALUES (
    p_form_id,
    p_response_id,
    p_session_id,
    p_answers,
    p_metadata,
    p_total_time_ms,
    p_pages_visited,
    p_completed_at,
    p_client_save_sequence
  )
  ON CONFLICT (form_id, response_id) DO UPDATE
  SET session_id = EXCLUDED.session_id,
      answers = EXCLUDED.answers,
      metadata = EXCLUDED.metadata,
      total_time_ms = EXCLUDED.total_time_ms,
      pages_visited = EXCLUDED.pages_visited,
      completed_at = EXCLUDED.completed_at,
      client_save_sequence = EXCLUDED.client_save_sequence;

  INSERT INTO public.form_sessions (
    id,
    form_id,
    response_id,
    status,
    started_at,
    completed_at,
    last_seen_at,
    pages_visited
  ) VALUES (
    p_session_id,
    p_form_id,
    p_response_id,
    'completed',
    CASE
      WHEN p_total_time_ms IS NULL THEN p_completed_at
      ELSE p_completed_at - (GREATEST(p_total_time_ms, 0)::TEXT || ' milliseconds')::INTERVAL
    END,
    p_completed_at,
    p_completed_at,
    GREATEST(COALESCE(p_pages_visited, 0), 0)
  )
  ON CONFLICT (id) DO UPDATE
  SET status = 'completed',
      completed_at = COALESCE(public.form_sessions.completed_at, EXCLUDED.completed_at),
      last_seen_at = GREATEST(public.form_sessions.last_seen_at, EXCLUDED.last_seen_at),
      pages_visited = GREATEST(
        COALESCE(public.form_sessions.pages_visited, 0),
        COALESCE(EXCLUDED.pages_visited, 0)
      )
  WHERE public.form_sessions.form_id = EXCLUDED.form_id
    AND public.form_sessions.response_id = EXCLUDED.response_id;

  GET DIAGNOSTICS v_session_rows = ROW_COUNT;
  IF v_session_rows <> 1 THEN
    RAISE EXCEPTION 'session_identity_mismatch';
  END IF;

  INSERT INTO public.form_page_events (
    session_id,
    form_id,
    response_id,
    event_type,
    time_on_page_ms,
    created_at
  ) VALUES (
    p_session_id,
    p_form_id,
    p_response_id,
    'form_complete',
    CASE
      WHEN p_completion_time_on_page_ms IS NULL THEN NULL
      ELSE GREATEST(p_completion_time_on_page_ms, 0)
    END,
    p_completed_at
  )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_completed_form_submission(
  TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ, INTEGER, INTEGER, BIGINT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_completed_form_submission(
  TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ, INTEGER, INTEGER, BIGINT, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.preserve_completed_form_response() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.form_responses.client_save_sequence IS
  'Monotonic browser marker used to reject out-of-order partial response upserts.';
COMMENT ON FUNCTION public.persist_completed_form_submission(
  TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ, INTEGER, INTEGER, BIGINT, INTEGER
) IS 'Service-only atomic completion of the canonical response, session and analytics event.';
