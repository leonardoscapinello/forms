-- Aggregate page reach/drop-off in PostgreSQL so dashboards remain accurate
-- after the raw events exceed browser pagination limits.

CREATE INDEX IF NOT EXISTS idx_form_page_events_dropoff_analytics
ON public.form_page_events(form_id, event_type, response_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_form_sessions_completion_analytics
ON public.form_sessions(form_id, response_id, status);

CREATE OR REPLACE FUNCTION public.get_form_page_dropoff(p_form_id TEXT)
RETURNS TABLE (
  page_id TEXT,
  page_index INTEGER,
  page_title TEXT,
  reached BIGINT,
  dropoffs BIGINT,
  dropoff_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_form_uuid UUID;
  v_form_id TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_form_id IS NULL OR btrim(p_form_id) = '' THEN
    RAISE EXCEPTION 'invalid_form_id' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_form_uuid := p_form_id::UUID;
    v_form_id := v_form_uuid::TEXT;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_form_id' USING ERRCODE = '22023';
  END;

  IF NOT public.has_role(v_user_id, 'admin'::public.app_role)
    AND NOT EXISTS (
      SELECT 1
      FROM public.forms AS form_record
      INNER JOIN public.profiles AS profile
        ON profile.user_id = form_record.user_id
      WHERE form_record.id = v_form_uuid
        AND form_record.user_id = v_user_id
        AND profile.is_active = true
    ) THEN
    RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ordered_page_visits AS (
    SELECT
      event.response_id,
      event.page_id,
      event.page_index,
      event.page_title,
      event.created_at,
      row_number() OVER (
        PARTITION BY event.response_id
        ORDER BY event.created_at DESC, event.id DESC
      ) AS reverse_visit_order
    FROM public.form_page_events AS event
    WHERE event.form_id = v_form_id
      AND event.event_type = 'page_view'
      AND event.response_id IS NOT NULL
  ),
  completed_responses AS (
    SELECT DISTINCT session.response_id
    FROM public.form_sessions AS session
    WHERE session.form_id = v_form_id
      AND session.status = 'completed'
      AND session.response_id IS NOT NULL
    UNION
    SELECT DISTINCT event.response_id
    FROM public.form_page_events AS event
    WHERE event.form_id = v_form_id
      AND event.event_type = 'form_complete'
      AND event.response_id IS NOT NULL
  )
  SELECT
    visit.page_id,
    visit.page_index,
    max(NULLIF(visit.page_title, '')) AS page_title,
    count(DISTINCT visit.response_id) AS reached,
    count(DISTINCT visit.response_id) FILTER (
      WHERE visit.reverse_visit_order = 1
        AND completed.response_id IS NULL
    ) AS dropoffs,
    CASE
      WHEN count(DISTINCT visit.response_id) = 0 THEN 0
      ELSE round(
        100.0 * count(DISTINCT visit.response_id) FILTER (
          WHERE visit.reverse_visit_order = 1
            AND completed.response_id IS NULL
        ) / count(DISTINCT visit.response_id),
        1
      )
    END AS dropoff_percent
  FROM ordered_page_visits AS visit
  LEFT JOIN completed_responses AS completed
    ON completed.response_id = visit.response_id
  GROUP BY visit.page_id, visit.page_index
  ORDER BY visit.page_index NULLS LAST, visit.page_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_form_page_dropoff(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_form_page_dropoff(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_form_page_dropoff(TEXT) IS
  'Owner/admin-only page reach and drop-off aggregation across the complete event history.';
