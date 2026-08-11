-- One owner/admin-scoped aggregation replaces the dashboard's N count queries
-- and its row-capped seven-day telemetry downloads.

CREATE INDEX IF NOT EXISTS idx_form_responses_home_summary
  ON public.form_responses(form_id, created_at DESC)
  INCLUDE (response_id, completed_at);

CREATE OR REPLACE FUNCTION public.get_forms_home_summary(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  form_id TEXT,
  response_count BIGINT,
  bucket_dates TEXT[],
  responses_by_day BIGINT[],
  dropoffs_by_day BIGINT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today DATE := (current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start_date DATE;
  v_start_at TIMESTAMPTZ;
  v_until_at TIMESTAMPTZ;
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_days IS NULL OR p_days < 1 OR p_days > 90 THEN
    RAISE EXCEPTION 'invalid_summary_days' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.user_id = v_user_id
      AND profile.is_active = true
  ) THEN
    RAISE EXCEPTION 'account_inactive' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(v_user_id, 'admin'::public.app_role);

  v_start_date := v_today - (p_days - 1);
  v_start_at := v_start_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_until_at := (v_today + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  WITH accessible_forms AS (
    SELECT form_record.id::text AS form_id
    FROM public.forms AS form_record
    WHERE form_record.user_id = v_user_id
      OR v_is_admin
  ),
  days AS (
    SELECT generate_series(v_start_date, v_today, interval '1 day')::date AS day
  ),
  response_totals AS (
    SELECT response.form_id, count(*)::BIGINT AS total
    FROM public.form_responses AS response
    INNER JOIN accessible_forms AS accessible USING (form_id)
    GROUP BY response.form_id
  ),
  response_daily AS (
    SELECT
      response.form_id,
      (response.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      count(*)::BIGINT AS total
    FROM public.form_responses AS response
    INNER JOIN accessible_forms AS accessible USING (form_id)
    WHERE response.created_at >= v_start_at
      AND response.created_at < v_until_at
    GROUP BY response.form_id,
      (response.created_at AT TIME ZONE 'America/Sao_Paulo')::date
  ),
  dropoff_daily AS (
    SELECT
      session.form_id,
      (session.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
      count(DISTINCT session.response_id)::BIGINT AS total
    FROM public.form_sessions AS session
    INNER JOIN accessible_forms AS accessible USING (form_id)
    WHERE session.started_at >= v_start_at
      AND session.started_at < v_until_at
      AND session.status <> 'completed'
    GROUP BY session.form_id,
      (session.started_at AT TIME ZONE 'America/Sao_Paulo')::date
  )
  SELECT
    accessible.form_id,
    COALESCE(response_total.total, 0)::BIGINT AS response_count,
    array_agg(to_char(days.day, 'YYYY-MM-DD') ORDER BY days.day) AS bucket_dates,
    array_agg(COALESCE(response_day.total, 0)::BIGINT ORDER BY days.day)
      AS responses_by_day,
    array_agg(COALESCE(dropoff_day.total, 0)::BIGINT ORDER BY days.day)
      AS dropoffs_by_day
  FROM accessible_forms AS accessible
  CROSS JOIN days
  LEFT JOIN response_totals AS response_total
    ON response_total.form_id = accessible.form_id
  LEFT JOIN response_daily AS response_day
    ON response_day.form_id = accessible.form_id
   AND response_day.day = days.day
  LEFT JOIN dropoff_daily AS dropoff_day
    ON dropoff_day.form_id = accessible.form_id
   AND dropoff_day.day = days.day
  GROUP BY accessible.form_id, response_total.total
  ORDER BY accessible.form_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_forms_home_summary(INTEGER)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_forms_home_summary(INTEGER)
  TO authenticated;

COMMENT ON FUNCTION public.get_forms_home_summary(INTEGER) IS
  'Active owner/admin form counts and complete Sao Paulo day buckets without N+1 queries or browser row caps.';
