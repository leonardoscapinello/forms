-- Rate-limit identities include response/node keys and would otherwise grow
-- forever. Keep a short indexed retention horizon and prune in bounded,
-- skip-locked batches so cleanup never stalls request-time consumption.

CREATE INDEX IF NOT EXISTS idx_edge_rate_limits_window_started_at
  ON public.edge_rate_limits(window_started_at);

CREATE OR REPLACE FUNCTION public.cleanup_edge_rate_limits(
  p_retention INTERVAL DEFAULT INTERVAL '24 hours',
  p_batch_size INTEGER DEFAULT 100000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  IF p_retention < INTERVAL '10 minutes'
    OR p_retention > INTERVAL '30 days'
    OR p_batch_size < 1
    OR p_batch_size > 100000
  THEN
    RAISE EXCEPTION 'invalid_rate_limit_cleanup_arguments' USING ERRCODE = '22023';
  END IF;

  WITH expired AS (
    SELECT bucket, key_hash
    FROM public.edge_rate_limits
    WHERE window_started_at < statement_timestamp() - p_retention
    ORDER BY window_started_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.edge_rate_limits AS limits
  USING expired
  WHERE limits.bucket = expired.bucket
    AND limits.key_hash = expired.key_hash;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_edge_rate_limits(INTERVAL, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_edge_rate_limits(INTERVAL, INTEGER)
  TO service_role;

DO $$
DECLARE
  v_existing RECORD;
BEGIN
  FOR v_existing IN
    SELECT jobid FROM cron.job WHERE jobname = 'edge-rate-limits-cleanup'
  LOOP
    PERFORM cron.unschedule(v_existing.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'edge-rate-limits-cleanup',
    '*/15 * * * *',
    $job$SELECT public.cleanup_edge_rate_limits(INTERVAL '24 hours', 100000);$job$
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_edge_rate_limits(INTERVAL, INTEGER) IS
  'Deletes expired Edge rate-limit identities in bounded skip-locked batches.';
