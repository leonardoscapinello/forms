-- Server-side analytics aggregation for the global and per-form dashboards.
-- Raw browser queries were capped at 500/1,000/2,000 rows, which made KPIs
-- silently inaccurate as traffic grew. This function aggregates the complete
-- requested period in PostgreSQL and only returns non-PII operational metrics.

CREATE INDEX IF NOT EXISTS idx_form_sessions_dashboard_period
  ON public.form_sessions(form_id, started_at DESC, response_id)
  INCLUDE (status, completed_at, last_seen_at, pages_visited);

CREATE INDEX IF NOT EXISTS idx_form_page_events_dashboard_period
  ON public.form_page_events(form_id, created_at DESC, response_id, event_type)
  INCLUDE (page_id, page_index, page_title, time_on_page_ms, hesitation_ms, interaction_count);

CREATE INDEX IF NOT EXISTS idx_form_response_deliveries_dashboard_period
  ON public.form_response_deliveries(form_id, created_at DESC, delivery_type, status);

CREATE INDEX IF NOT EXISTS idx_pixel_events_dashboard_period
  ON public.pixel_events_log(form_id, created_at DESC, platform)
  INCLUDE (fired_client, fired_server);

CREATE OR REPLACE FUNCTION public.get_analytics_dashboard(
  p_form_ids TEXT[],
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ DEFAULT now(),
  p_timezone TEXT DEFAULT 'America/Sao_Paulo'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_form_ids TEXT[];
  v_form_uuids UUID[];
  v_previous_since TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(array_length(p_form_ids, 1), 0) = 0
    OR array_length(p_form_ids, 1) > 500
    OR EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p_form_ids, ARRAY[]::TEXT[])) AS requested(form_id)
      WHERE requested.form_id IS NULL
        OR requested.form_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) THEN
    RAISE EXCEPTION 'invalid_form_ids' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT requested.form_id::UUID ORDER BY requested.form_id::UUID)
  INTO v_form_uuids
  FROM unnest(p_form_ids) AS requested(form_id);

  SELECT array_agg(form_uuid::TEXT ORDER BY form_uuid)
  INTO v_form_ids
  FROM unnest(v_form_uuids) AS normalized(form_uuid);

  IF p_since IS NULL
    OR p_until IS NULL
    OR p_since >= p_until
    OR p_until > now() + interval '5 minutes'
    OR p_until - p_since > interval '366 days' THEN
    RAISE EXCEPTION 'invalid_analytics_period' USING ERRCODE = '22023';
  END IF;

  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS timezone
    WHERE timezone.name = p_timezone
  ) THEN
    RAISE EXCEPTION 'invalid_analytics_timezone' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_role(v_user_id, 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM unnest(v_form_uuids) AS requested(form_id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.forms AS form_record
        INNER JOIN public.profiles AS profile
          ON profile.user_id = form_record.user_id
         AND profile.is_active = true
        WHERE form_record.id = requested.form_id
          AND form_record.user_id = v_user_id
      )
    ) THEN
    RAISE EXCEPTION 'form_access_denied' USING ERRCODE = '42501';
  END IF;

  -- Administrators must still request forms that actually exist. This also
  -- keeps arbitrary IDs out of expensive telemetry scans.
  IF EXISTS (
    SELECT 1
    FROM unnest(v_form_uuids) AS requested(form_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.forms AS form_record
      WHERE form_record.id = requested.form_id
    )
  ) THEN
    RAISE EXCEPTION 'form_not_found' USING ERRCODE = '22023';
  END IF;

  v_previous_since := p_since - (p_until - p_since);

  WITH
  requested_forms AS (
    SELECT form_record.id::text AS form_id, form_record.title
    FROM public.forms AS form_record
    WHERE form_record.id = ANY(v_form_uuids)
  ),
  current_session_rows AS (
    SELECT session.*
    FROM public.form_sessions AS session
    WHERE session.form_id = ANY(v_form_ids)
      AND session.started_at >= p_since
      AND session.started_at < p_until
  ),
  -- response_id is the public session identity, but older clients could retry a
  -- session insert before the durable endpoint existed. Collapse those rows so
  -- one lead can never be counted simultaneously as completed and incomplete.
  current_session_rollup AS (
    SELECT
      session.form_id,
      session.response_id,
      min(session.started_at) AS started_at,
      max(session.completed_at) AS completed_at,
      max(session.last_seen_at) AS last_seen_at,
      max(session.pages_visited) AS pages_visited,
      CASE
        WHEN bool_or(session.status = 'completed') THEN 'completed'
        WHEN bool_or(session.status = 'active') THEN 'active'
        ELSE 'dropped'
      END AS status,
      COALESCE(
        (array_agg(session.query_params ORDER BY session.started_at, session.id)
          FILTER (WHERE session.query_params IS NOT NULL))[1],
        '{}'::jsonb
      ) AS query_params,
      (array_agg(session.referrer ORDER BY session.started_at, session.id)
        FILTER (WHERE session.referrer IS NOT NULL))[1] AS referrer,
      (array_agg(session.user_agent ORDER BY session.started_at, session.id)
        FILTER (WHERE session.user_agent IS NOT NULL))[1] AS user_agent
    FROM current_session_rows AS session
    GROUP BY session.form_id, session.response_id
  ),
  current_sessions AS (
    SELECT
      session.*,
      CASE
        WHEN session.completed_at IS NOT NULL
          AND session.completed_at >= session.started_at
          AND session.completed_at - session.started_at <= interval '24 hours'
        THEN extract(epoch FROM (session.completed_at - session.started_at)) * 1000.0
        ELSE NULL
      END AS valid_duration_ms
    FROM current_session_rollup AS session
  ),
  previous_sessions AS (
    SELECT
      session.form_id,
      session.response_id,
      CASE WHEN bool_or(session.status = 'completed') THEN 'completed' ELSE 'incomplete' END AS status
    FROM public.form_sessions AS session
    WHERE session.form_id = ANY(v_form_ids)
      AND session.started_at >= v_previous_since
      AND session.started_at < p_since
    GROUP BY session.form_id, session.response_id
  ),
  current_session_stats AS (
    SELECT
      session.form_id,
      count(DISTINCT session.response_id)::BIGINT AS total_sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status = 'completed')::BIGINT AS completed_sessions,
      count(DISTINCT session.response_id) FILTER (
        WHERE session.status = 'active'
          AND session.last_seen_at >= p_until - interval '5 minutes'
      )::BIGINT AS active_sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status <> 'completed')::BIGINT AS incomplete_sessions,
      count(session.valid_duration_ms)::BIGINT AS valid_duration_count,
      COALESCE(sum(session.valid_duration_ms), 0)::NUMERIC AS duration_sum_ms,
      round(COALESCE(avg(session.valid_duration_ms), 0), 0)::NUMERIC AS avg_duration_ms,
      round(COALESCE(
        (percentile_cont(0.50) WITHIN GROUP (ORDER BY session.valid_duration_ms))::NUMERIC,
        0
      ), 0)::NUMERIC AS p50_duration_ms,
      round(COALESCE(
        (percentile_cont(0.95) WITHIN GROUP (ORDER BY session.valid_duration_ms))::NUMERIC,
        0
      ), 0)::NUMERIC AS p95_duration_ms,
      round(COALESCE(avg(session.pages_visited) FILTER (WHERE session.pages_visited >= 0), 0), 1)::NUMERIC AS avg_pages_visited
    FROM current_sessions AS session
    GROUP BY session.form_id
  ),
  previous_session_stats AS (
    SELECT
      session.form_id,
      count(DISTINCT session.response_id)::BIGINT AS previous_total_sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status = 'completed')::BIGINT AS previous_completed_sessions
    FROM previous_sessions AS session
    GROUP BY session.form_id
  ),
  response_stats AS (
    SELECT
      response.form_id,
      count(DISTINCT response.response_id) FILTER (
        WHERE response.completed_at >= p_since
          AND response.completed_at < p_until
      )::BIGINT AS unique_leads
    FROM public.form_responses AS response
    WHERE response.form_id = ANY(v_form_ids)
      AND response.completed_at >= p_since
      AND response.completed_at < p_until
    GROUP BY response.form_id
  ),
  form_stats AS (
    SELECT
      requested.form_id,
      requested.title,
      COALESCE(current.total_sessions, 0)::BIGINT AS total_sessions,
      COALESCE(current.completed_sessions, 0)::BIGINT AS completed_sessions,
      COALESCE(current.incomplete_sessions, 0)::BIGINT AS incomplete_sessions,
      COALESCE(current.active_sessions, 0)::BIGINT AS active_sessions,
      COALESCE(response.unique_leads, 0)::BIGINT AS unique_leads,
      COALESCE(current.valid_duration_count, 0)::BIGINT AS valid_duration_count,
      COALESCE(current.duration_sum_ms, 0)::NUMERIC AS duration_sum_ms,
      COALESCE(current.avg_duration_ms, 0)::NUMERIC AS avg_duration_ms,
      COALESCE(current.p50_duration_ms, 0)::NUMERIC AS p50_duration_ms,
      COALESCE(current.p95_duration_ms, 0)::NUMERIC AS p95_duration_ms,
      COALESCE(current.avg_pages_visited, 0)::NUMERIC AS avg_pages_visited,
      CASE WHEN COALESCE(current.total_sessions, 0) = 0 THEN 0
        ELSE round(100.0 * current.completed_sessions / current.total_sessions, 1)
      END AS completion_rate,
      COALESCE(previous.previous_total_sessions, 0)::BIGINT AS previous_total_sessions,
      COALESCE(previous.previous_completed_sessions, 0)::BIGINT AS previous_completed_sessions,
      CASE WHEN COALESCE(previous.previous_total_sessions, 0) = 0 THEN 0
        ELSE round(100.0 * previous.previous_completed_sessions / previous.previous_total_sessions, 1)
      END AS previous_completion_rate
    FROM requested_forms AS requested
    LEFT JOIN current_session_stats AS current USING (form_id)
    LEFT JOIN previous_session_stats AS previous USING (form_id)
    LEFT JOIN response_stats AS response USING (form_id)
  ),
  daily_stats AS (
    SELECT
      session.form_id,
      (session.started_at AT TIME ZONE p_timezone)::date AS date,
      count(DISTINCT session.response_id)::BIGINT AS sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status = 'completed')::BIGINT AS completed
    FROM current_sessions AS session
    GROUP BY session.form_id, (session.started_at AT TIME ZONE p_timezone)::date
  ),
  page_visits AS (
    SELECT
      event.form_id,
      event.response_id,
      event.page_id,
      event.page_index,
      event.page_title,
      event.time_on_page_ms,
      event.hesitation_ms,
      event.interaction_count,
      event.created_at,
      row_number() OVER (
        PARTITION BY event.form_id, event.response_id
        ORDER BY event.created_at DESC, event.id DESC
      ) AS reverse_visit_order
    FROM public.form_page_events AS event
    WHERE event.form_id = ANY(v_form_ids)
      AND event.event_type = 'page_view'
      AND event.created_at >= p_since
      AND event.created_at < p_until
  ),
  completed_responses AS (
    -- A page event can fall inside the selected window even when its session
    -- started just before the window. Resolve completion from the full session
    -- ledger for only the response IDs present in page_visits; otherwise those
    -- legitimate completions would be misclassified as period drop-offs.
    SELECT DISTINCT session.form_id, session.response_id
    FROM public.form_sessions AS session
    WHERE session.form_id = ANY(v_form_ids)
      AND session.status = 'completed'
      AND EXISTS (
        SELECT 1
        FROM page_visits AS visit
        WHERE visit.form_id = session.form_id
          AND visit.response_id = session.response_id
      )
    UNION
    SELECT DISTINCT event.form_id, event.response_id
    FROM public.form_page_events AS event
    WHERE event.form_id = ANY(v_form_ids)
      AND event.event_type = 'form_complete'
      AND event.created_at >= p_since
      AND event.created_at < p_until
  ),
  page_stats AS (
    SELECT
      visit.form_id,
      visit.page_id,
      visit.page_index,
      max(NULLIF(visit.page_title, '')) AS page_title,
      count(DISTINCT visit.response_id)::BIGINT AS reached,
      count(DISTINCT visit.response_id) FILTER (
        WHERE visit.reverse_visit_order = 1
          AND completed.response_id IS NULL
      )::BIGINT AS dropoffs,
      CASE WHEN count(DISTINCT visit.response_id) = 0 THEN 0
        ELSE round(
          100.0 * count(DISTINCT visit.response_id) FILTER (
            WHERE visit.reverse_visit_order = 1
              AND completed.response_id IS NULL
          ) / count(DISTINCT visit.response_id),
          1
        )
      END AS dropoff_percent,
      round(COALESCE(avg(visit.time_on_page_ms) FILTER (
        WHERE visit.time_on_page_ms BETWEEN 0 AND 3600000
      ), 0), 0)::NUMERIC AS avg_time_on_page_ms,
      round(COALESCE(avg(visit.hesitation_ms) FILTER (
        WHERE visit.hesitation_ms BETWEEN 0 AND 3600000
      ), 0), 0)::NUMERIC AS avg_hesitation_ms,
      round(COALESCE(avg(visit.interaction_count) FILTER (
        WHERE visit.interaction_count BETWEEN 0 AND 10000
      ), 0), 1)::NUMERIC AS avg_interactions
    FROM page_visits AS visit
    LEFT JOIN completed_responses AS completed
      ON completed.form_id = visit.form_id
     AND completed.response_id = visit.response_id
    GROUP BY visit.form_id, visit.page_id, visit.page_index
  ),
  source_stats AS (
    SELECT
      session.form_id,
      CASE
        WHEN NULLIF(btrim(session.query_params->>'utm_source'), '') IS NOT NULL
          THEN left(lower(btrim(session.query_params->>'utm_source')), 120)
        WHEN NULLIF(btrim(session.referrer), '') IS NULL THEN 'direto'
        ELSE left(lower(split_part(regexp_replace(session.referrer, '^https?://', '', 'i'), '/', 1)), 120)
      END AS source,
      count(DISTINCT session.response_id)::BIGINT AS sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status = 'completed')::BIGINT AS completed
    FROM current_sessions AS session
    GROUP BY session.form_id, 2
  ),
  device_stats AS (
    SELECT
      session.form_id,
      CASE
        WHEN COALESCE(session.user_agent, '') ~* '(ipad|tablet|kindle|silk)'
          OR (
            COALESCE(session.user_agent, '') ~* 'android'
            AND COALESCE(session.user_agent, '') !~* 'mobile'
          ) THEN 'tablet'
        WHEN COALESCE(session.user_agent, '') ~* '(mobile|android|iphone|ipod)' THEN 'mobile'
        ELSE 'desktop'
      END AS device,
      count(DISTINCT session.response_id)::BIGINT AS sessions,
      count(DISTINCT session.response_id) FILTER (WHERE session.status = 'completed')::BIGINT AS completed
    FROM current_sessions AS session
    GROUP BY session.form_id, 2
  ),
  delivery_stats AS (
    SELECT
      delivery.form_id,
      delivery.delivery_type,
      delivery.status,
      count(*)::BIGINT AS total,
      COALESCE(max(delivery.updated_at), max(delivery.created_at)) AS last_activity_at
    FROM public.form_response_deliveries AS delivery
    WHERE delivery.form_id = ANY(v_form_ids)
      AND delivery.created_at >= p_since
      AND delivery.created_at < p_until
    GROUP BY delivery.form_id, delivery.delivery_type, delivery.status
  ),
  pixel_stats AS (
    SELECT
      pixel.form_id,
      pixel.platform,
      count(*)::BIGINT AS total,
      count(*) FILTER (WHERE pixel.fired_client)::BIGINT AS fired_client,
      count(*) FILTER (WHERE pixel.fired_server)::BIGINT AS fired_server,
      max(pixel.created_at) AS last_activity_at
    FROM public.pixel_events_log AS pixel
    WHERE pixel.form_id = ANY(v_form_ids)
      AND pixel.created_at >= p_since
      AND pixel.created_at < p_until
    GROUP BY pixel.form_id, pixel.platform
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'since', p_since,
    'until', p_until,
    'summary', (
      SELECT jsonb_build_object(
        'total_sessions', COALESCE(sum(stats.total_sessions), 0),
        'completed_sessions', COALESCE(sum(stats.completed_sessions), 0),
        'incomplete_sessions', COALESCE(sum(stats.incomplete_sessions), 0),
        'active_sessions', COALESCE(sum(stats.active_sessions), 0),
        'unique_leads', COALESCE(sum(stats.unique_leads), 0),
        'completion_rate', CASE WHEN COALESCE(sum(stats.total_sessions), 0) = 0 THEN 0
          ELSE round(100.0 * sum(stats.completed_sessions) / sum(stats.total_sessions), 1)
        END,
        'avg_duration_ms', CASE WHEN COALESCE(sum(stats.valid_duration_count), 0) = 0 THEN 0
          ELSE round(sum(stats.duration_sum_ms) / sum(stats.valid_duration_count), 0)
        END,
        'p50_duration_ms', COALESCE((
          SELECT round(
            (percentile_cont(0.50) WITHIN GROUP (ORDER BY current.valid_duration_ms))::NUMERIC,
            0
          )
          FROM current_sessions AS current
          WHERE current.valid_duration_ms IS NOT NULL
        ), 0),
        'p95_duration_ms', COALESCE((
          SELECT round(
            (percentile_cont(0.95) WITHIN GROUP (ORDER BY current.valid_duration_ms))::NUMERIC,
            0
          )
          FROM current_sessions AS current
          WHERE current.valid_duration_ms IS NOT NULL
        ), 0),
        'avg_pages_visited', COALESCE((
          SELECT round(avg(current.pages_visited) FILTER (WHERE current.pages_visited >= 0), 1)
          FROM current_sessions AS current
        ), 0),
        'previous_total_sessions', COALESCE(sum(stats.previous_total_sessions), 0),
        'previous_completed_sessions', COALESCE(sum(stats.previous_completed_sessions), 0),
        'previous_completion_rate', CASE WHEN COALESCE(sum(stats.previous_total_sessions), 0) = 0 THEN 0
          ELSE round(100.0 * sum(stats.previous_completed_sessions) / sum(stats.previous_total_sessions), 1)
        END
      )
      FROM form_stats AS stats
    ),
    'forms', COALESCE((
      SELECT jsonb_agg(to_jsonb(stats) ORDER BY stats.total_sessions DESC, stats.title)
      FROM form_stats AS stats
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(to_jsonb(daily) ORDER BY daily.date, daily.form_id)
      FROM daily_stats AS daily
    ), '[]'::jsonb),
    'pages', COALESCE((
      SELECT jsonb_agg(to_jsonb(page) ORDER BY page.form_id, page.page_index NULLS LAST, page.page_id)
      FROM page_stats AS page
    ), '[]'::jsonb),
    'sources', COALESCE((
      SELECT jsonb_agg(to_jsonb(source) ORDER BY source.sessions DESC, source.source)
      FROM source_stats AS source
    ), '[]'::jsonb),
    'devices', COALESCE((
      SELECT jsonb_agg(to_jsonb(device) ORDER BY device.form_id, device.sessions DESC)
      FROM device_stats AS device
    ), '[]'::jsonb),
    'deliveries', COALESCE((
      SELECT jsonb_agg(to_jsonb(delivery) ORDER BY delivery.form_id, delivery.delivery_type, delivery.status)
      FROM delivery_stats AS delivery
    ), '[]'::jsonb),
    'pixels', COALESCE((
      SELECT jsonb_agg(to_jsonb(pixel) ORDER BY pixel.form_id, pixel.platform)
      FROM pixel_stats AS pixel
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_analytics_dashboard(TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_dashboard(TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.get_analytics_dashboard(TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS
  'Owner/admin-only full-period dashboard aggregation without raw PII or browser row caps.';
