-- Durable server-side outbox for completed response integrations.
--
-- The initial completion request may still attempt delivery synchronously, but
-- every failed or interrupted delivery is now independently claimable by a
-- scheduled worker. Lease tokens prevent a stale worker from acknowledging a
-- job that was reclaimed after its lease expired.

ALTER TABLE public.form_response_deliveries
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

ALTER TABLE public.form_response_deliveries
  DROP CONSTRAINT IF EXISTS form_response_deliveries_status_check;

ALTER TABLE public.form_response_deliveries
  ADD CONSTRAINT form_response_deliveries_status_check
  CHECK (status IN ('processing', 'delivered', 'failed', 'dead_letter'));

ALTER TABLE public.form_response_deliveries
  DROP CONSTRAINT IF EXISTS form_response_deliveries_attempts_check;
ALTER TABLE public.form_response_deliveries
  ALTER COLUMN attempts SET DEFAULT 0;
ALTER TABLE public.form_response_deliveries
  ALTER COLUMN status SET DEFAULT 'failed';
ALTER TABLE public.form_response_deliveries
  ADD CONSTRAINT form_response_deliveries_attempts_check CHECK (attempts >= 0);

-- Existing rows predate destination snapshots. The worker can recover their
-- current configured destination and verifies it against destination_key.
UPDATE public.form_response_deliveries
SET next_attempt_at = COALESCE(next_attempt_at, updated_at, created_at, now())
WHERE status IN ('failed', 'processing');

DROP INDEX IF EXISTS public.idx_form_response_deliveries_pending;
CREATE INDEX idx_form_response_deliveries_claimable
  ON public.form_response_deliveries(next_attempt_at, lease_until, created_at)
  INCLUDE (form_id, response_id, delivery_type, attempts)
  WHERE status IN ('failed', 'processing');

CREATE INDEX idx_form_response_deliveries_dead_letter
  ON public.form_response_deliveries(dead_lettered_at DESC)
  INCLUDE (form_id, response_id, delivery_type, attempts)
  WHERE status = 'dead_letter';

-- Enqueue destinations in the same database transaction that makes a response
-- complete. This closes the crash window between response persistence and the
-- Edge Function's synchronous best-effort delivery.
CREATE OR REPLACE FUNCTION public.enqueue_completed_form_response_deliveries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_form_data JSONB;
  v_destination TEXT;
BEGIN
  IF NEW.completed_at IS NULL
    OR (TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT form_record.data
  INTO v_form_data
  FROM public.forms AS form_record
  WHERE form_record.id::text = NEW.form_id
  LIMIT 1;

  v_destination := NULLIF(v_form_data->>'googleSheetId', '');
  IF v_destination IS NOT NULL THEN
    INSERT INTO public.form_response_deliveries (
      form_id,
      response_id,
      delivery_type,
      destination_key,
      destination,
      status,
      attempts,
      next_attempt_at
    ) VALUES (
      NEW.form_id,
      NEW.response_id,
      'google_sheets',
      'google_sheets:' || encode(sha256(convert_to(v_destination, 'UTF8')), 'hex'),
      v_destination,
      'failed',
      0,
      clock_timestamp()
    ) ON CONFLICT (form_id, response_id, destination_key) DO NOTHING;
  END IF;

  v_destination := NULLIF(v_form_data->>'completionWebhookUrl', '');
  IF v_destination IS NOT NULL THEN
    INSERT INTO public.form_response_deliveries (
      form_id,
      response_id,
      delivery_type,
      destination_key,
      destination,
      status,
      attempts,
      next_attempt_at
    ) VALUES (
      NEW.form_id,
      NEW.response_id,
      'completion_webhook',
      'completion_webhook:' || encode(sha256(convert_to(v_destination, 'UTF8')), 'hex'),
      v_destination,
      'failed',
      0,
      clock_timestamp()
    ) ON CONFLICT (form_id, response_id, destination_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_completed_form_response_deliveries_trigger
  ON public.form_responses;
CREATE TRIGGER enqueue_completed_form_response_deliveries_trigger
AFTER INSERT OR UPDATE OF completed_at ON public.form_responses
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_completed_form_response_deliveries();

REVOKE ALL ON FUNCTION public.enqueue_completed_form_response_deliveries()
  FROM PUBLIC, anon, authenticated;

-- Backfill completed responses that existed before the transactional enqueue
-- trigger. Each destination is snapshotted and deduplicated by its SHA-256 key.
INSERT INTO public.form_response_deliveries (
  form_id,
  response_id,
  delivery_type,
  destination_key,
  destination,
  status,
  attempts,
  next_attempt_at
)
SELECT
  response.form_id,
  response.response_id,
  destination.delivery_type,
  destination.delivery_type || ':'
    || encode(sha256(convert_to(destination.value, 'UTF8')), 'hex'),
  destination.value,
  'failed',
  0,
  now()
FROM public.form_responses AS response
JOIN public.forms AS form_record ON form_record.id::text = response.form_id
CROSS JOIN LATERAL (
  VALUES
    ('google_sheets'::text, NULLIF(form_record.data->>'googleSheetId', '')),
    ('completion_webhook'::text, NULLIF(form_record.data->>'completionWebhookUrl', ''))
) AS destination(delivery_type, value)
WHERE response.completed_at IS NOT NULL
  AND destination.value IS NOT NULL
ON CONFLICT (form_id, response_id, destination_key) DO NOTHING;

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
  -- Exhausted jobs become terminal only after a processing lease expires. This
  -- avoids racing a legitimate in-flight attempt at the max-attempt boundary.
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

REVOKE ALL ON FUNCTION public.claim_form_response_deliveries(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_form_response_deliveries(INTEGER, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_form_response_deliveries(INTEGER, INTEGER, INTEGER) IS
  'Atomically claims due/lease-expired response deliveries using SKIP LOCKED; service role only.';

COMMENT ON COLUMN public.form_response_deliveries.destination IS
  'Service-only destination snapshot captured when the response completed.';
COMMENT ON COLUMN public.form_response_deliveries.lease_token IS
  'Fencing token: only the current claimant may acknowledge or fail the delivery.';
COMMENT ON COLUMN public.form_response_deliveries.next_attempt_at IS
  'Earliest retry time calculated by the Edge Function with exponential jittered backoff.';
