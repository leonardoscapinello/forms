CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (bucket, key_hash)
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_bucket TEXT,
  p_key_hash TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF p_bucket = '' OR p_key_hash = '' OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit_arguments';
  END IF;

  INSERT INTO public.edge_rate_limits AS limits (
    bucket,
    key_hash,
    window_started_at,
    request_count
  )
  VALUES (p_bucket, p_key_hash, now(), 1)
  ON CONFLICT (bucket, key_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE limits.window_started_at
    END,
    request_count = CASE
      WHEN limits.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE limits.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

