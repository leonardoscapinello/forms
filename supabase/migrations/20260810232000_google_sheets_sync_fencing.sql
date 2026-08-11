-- Serialize destructive/manual Google Sheets replacement with durable per-lead
-- writes. The short, renewable lease has a fencing token and is visible only to
-- service-role Edge Functions. A crashed sync cannot block the worker forever.

CREATE TABLE IF NOT EXISTS public.google_sheets_sync_leases (
  destination_key TEXT PRIMARY KEY
    CHECK (destination_key ~ '^google_sheets:[0-9a-f]{64}$'),
  lease_token UUID NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_sheets_sync_leases_expiry
  ON public.google_sheets_sync_leases(lease_until);

ALTER TABLE public.google_sheets_sync_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_sheets_sync_leases
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.google_sheets_sync_leases
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_google_sheets_sync_lease(
  p_destination_key TEXT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 300);
  v_token UUID := gen_random_uuid();
  v_claimed UUID;
BEGIN
  IF p_destination_key IS NULL
    OR p_destination_key !~ '^google_sheets:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_google_sheets_destination_key';
  END IF;

  INSERT INTO public.google_sheets_sync_leases AS lease (
    destination_key,
    lease_token,
    lease_until,
    created_at,
    updated_at
  ) VALUES (
    p_destination_key,
    v_token,
    v_now + make_interval(secs => v_seconds),
    v_now,
    v_now
  )
  ON CONFLICT (destination_key) DO UPDATE
  SET lease_token = EXCLUDED.lease_token,
      lease_until = EXCLUDED.lease_until,
      updated_at = EXCLUDED.updated_at
  WHERE lease.lease_until <= v_now
  RETURNING lease_token INTO v_claimed;

  RETURN v_claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_google_sheets_sync_lease(
  p_destination_key TEXT,
  p_lease_token UUID,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 120), 30), 300);
  v_rows INTEGER := 0;
BEGIN
  IF p_destination_key IS NULL
    OR p_destination_key !~ '^google_sheets:[0-9a-f]{64}$'
    OR p_lease_token IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.google_sheets_sync_leases
  SET lease_until = v_now + make_interval(secs => v_seconds),
      updated_at = v_now
  WHERE destination_key = p_destination_key
    AND lease_token = p_lease_token
    AND lease_until > v_now;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_google_sheets_sync_lease(
  p_destination_key TEXT,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  IF p_destination_key IS NULL OR p_lease_token IS NULL THEN RETURN false; END IF;
  DELETE FROM public.google_sheets_sync_leases
  WHERE destination_key = p_destination_key
    AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_google_sheets_sync_lease_active(
  p_destination_key TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.google_sheets_sync_leases AS lease
    WHERE lease.destination_key = p_destination_key
      AND lease.lease_until > clock_timestamp()
  );
$$;

-- Per-lead delivery writes the same deterministic row used by manual sync.
-- The composite index keeps the rank lookup bounded to one form.
CREATE INDEX IF NOT EXISTS idx_form_responses_sheet_sequence
  ON public.form_responses(form_id, created_at, id);

CREATE OR REPLACE FUNCTION public.get_form_response_sheet_sequence(
  p_form_id TEXT,
  p_response_id TEXT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::BIGINT
  FROM public.form_responses AS candidate
  JOIN public.form_responses AS target
    ON target.form_id = p_form_id
   AND target.response_id = p_response_id
  WHERE candidate.form_id = p_form_id
    AND (candidate.created_at, candidate.id) <= (target.created_at, target.id);
$$;

-- Once every write and the trailing clear are acknowledged, manual sync may
-- acknowledge (or backfill) the durable ledger for completed rows in the same
-- database snapshot. This also recovers prior dead-letter rows without causing
-- a second provider write.
CREATE OR REPLACE FUNCTION public.ack_google_sheets_manual_sync(
  p_form_id TEXT,
  p_destination_key TEXT,
  p_destination TEXT,
  p_snapshot_created_at TIMESTAMPTZ,
  p_lease_token UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_count BIGINT := 0;
  v_expected_key TEXT;
BEGIN
  IF p_form_id IS NULL OR p_destination IS NULL OR p_destination = ''
    OR p_snapshot_created_at IS NULL
    OR p_lease_token IS NULL
    OR p_snapshot_created_at > v_now + interval '1 minute' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_google_sheets_manual_sync_ack';
  END IF;
  v_expected_key := 'google_sheets:'
    || encode(sha256(convert_to(p_destination, 'UTF8')), 'hex');
  IF p_destination_key IS DISTINCT FROM v_expected_key THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'google_sheets_destination_key_mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.google_sheets_sync_leases AS sheet_lease
    WHERE sheet_lease.destination_key = p_destination_key
      AND sheet_lease.lease_token = p_lease_token
      AND sheet_lease.lease_until > v_now
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'google_sheet_sync_lease_lost';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.forms AS form_record
    WHERE form_record.id::TEXT = p_form_id
      AND form_record.data->>'googleSheetId' = p_destination
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'google_sheet_not_connected_to_form';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.form_response_deliveries AS active_delivery
    WHERE active_delivery.delivery_type = 'google_sheets'
      AND active_delivery.destination_key = p_destination_key
      AND active_delivery.status = 'processing'
      AND active_delivery.lease_until > v_now
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'google_sheet_delivery_in_progress';
  END IF;

  WITH acknowledged AS (
    INSERT INTO public.form_response_deliveries AS delivery (
      form_id,
      response_id,
      delivery_type,
      destination_key,
      destination,
      status,
      attempts,
      next_attempt_at,
      delivered_at,
      last_error,
      lease_until,
      lease_token,
      updated_at
    )
    SELECT
      response.form_id,
      response.response_id,
      'google_sheets',
      p_destination_key,
      p_destination,
      'delivered',
      0,
      NULL,
      v_now,
      NULL,
      NULL,
      NULL,
      v_now
    FROM public.form_responses AS response
    WHERE response.form_id = p_form_id
      AND response.completed_at IS NOT NULL
      AND response.created_at <= p_snapshot_created_at
    ON CONFLICT (form_id, response_id, destination_key) DO UPDATE
    SET destination = EXCLUDED.destination,
        status = 'delivered',
        next_attempt_at = NULL,
        delivered_at = v_now,
        last_error = NULL,
        lease_until = NULL,
        lease_token = NULL,
        dead_lettered_at = NULL,
        updated_at = v_now
    WHERE delivery.status <> 'processing'
      OR COALESCE(delivery.lease_until, '-infinity'::timestamptz) <= v_now
    RETURNING 1
  )
  SELECT count(*)::BIGINT INTO v_count FROM acknowledged;
  RETURN v_count;
END;
$$;

-- Do not spend delivery attempts while an operator-triggered replacement owns
-- the sheet. The worker still checks the lease immediately before provider I/O
-- to close the claim-vs-lease race.
CREATE OR REPLACE FUNCTION public.claim_form_response_deliveries(
  p_batch_size INTEGER DEFAULT 25,
  p_lease_seconds INTEGER DEFAULT 45,
  p_max_attempts INTEGER DEFAULT 8
)
RETURNS SETOF public.form_response_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_batch_size INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 25), 1), 100);
  v_lease_seconds INTEGER := LEAST(GREATEST(COALESCE(p_lease_seconds, 45), 15), 300);
  v_max_attempts INTEGER := LEAST(GREATEST(COALESCE(p_max_attempts, 8), 1), 50);
BEGIN
  UPDATE public.form_response_deliveries AS exhausted
  SET status = 'dead_letter',
      dead_lettered_at = COALESCE(exhausted.dead_lettered_at, v_now),
      lease_until = NULL,
      lease_token = NULL,
      next_attempt_at = NULL,
      last_error = COALESCE(exhausted.last_error, 'delivery_attempts_exhausted'),
      updated_at = v_now
  WHERE exhausted.attempts >= v_max_attempts
    AND (
      (exhausted.status = 'failed'
        AND COALESCE(exhausted.next_attempt_at, '-infinity'::timestamptz) <= v_now)
      OR
      (exhausted.status = 'processing'
        AND COALESCE(exhausted.lease_until, '-infinity'::timestamptz) <= v_now)
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.form_response_deliveries AS delivery
    WHERE delivery.attempts < v_max_attempts
      AND NOT (
        delivery.delivery_type = 'google_sheets'
        AND EXISTS (
          SELECT 1
          FROM public.google_sheets_sync_leases AS sheet_lease
          WHERE sheet_lease.destination_key = delivery.destination_key
            AND sheet_lease.lease_until > v_now
        )
      )
      AND (
        (delivery.status = 'failed'
          AND COALESCE(delivery.next_attempt_at, '-infinity'::timestamptz) <= v_now)
        OR
        (delivery.status = 'processing'
          AND COALESCE(delivery.lease_until, '-infinity'::timestamptz) <= v_now)
      )
    ORDER BY
      COALESCE(delivery.next_attempt_at, delivery.lease_until, delivery.created_at),
      delivery.created_at,
      delivery.id
    FOR UPDATE SKIP LOCKED
    LIMIT v_batch_size
  )
  UPDATE public.form_response_deliveries AS claimed
  SET status = 'processing',
      attempts = claimed.attempts + 1,
      claimed_at = v_now,
      last_attempt_at = v_now,
      lease_until = v_now + make_interval(secs => v_lease_seconds),
      lease_token = gen_random_uuid(),
      updated_at = v_now
  FROM candidates
  WHERE claimed.id = candidates.id
  RETURNING claimed.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_sheets_sync_lease(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_google_sheets_sync_lease(TEXT, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_google_sheets_sync_lease(TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_google_sheets_sync_lease_active(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_form_response_sheet_sequence(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ack_google_sheets_manual_sync(TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_form_response_deliveries(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_google_sheets_sync_lease(TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_google_sheets_sync_lease(TEXT, UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_google_sheets_sync_lease(TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.is_google_sheets_sync_lease_active(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_form_response_sheet_sequence(TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_google_sheets_manual_sync(TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_form_response_deliveries(INTEGER, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.google_sheets_sync_leases IS
  'Service-only renewable fencing leases that serialize manual Sheets replacement with per-lead delivery.';
COMMENT ON FUNCTION public.get_form_response_sheet_sequence(TEXT, TEXT) IS
  'Returns the canonical 1-based response order used by manual sync and idempotent per-lead Sheets writes.';
COMMENT ON FUNCTION public.ack_google_sheets_manual_sync(TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID) IS
  'Acknowledges completed Google Sheets outbox rows only after a fenced manual replacement has provider ACKs.';
