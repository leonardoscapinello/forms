-- Make a completed response immutable and track each external completion
-- delivery independently. This prevents a late partial autosave from
-- downgrading a completed lead and prevents duplicate webhook/Sheets effects
-- when the browser retries the final save.

ALTER TABLE public.form_responses
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill rows whose completion is already represented by a completed
-- session. Plaintext legacy metadata is handled as a second fallback; encrypted
-- metadata cannot be inspected in SQL and is therefore left unchanged unless a
-- completed session exists.
UPDATE public.form_responses AS response
SET completed_at = session.completed_at
FROM public.form_sessions AS session
WHERE response.form_id = session.form_id
  AND response.response_id = session.response_id
  AND session.status = 'completed'
  AND session.completed_at IS NOT NULL
  AND response.completed_at IS NULL;

UPDATE public.form_responses
SET completed_at = created_at
WHERE completed_at IS NULL
  AND jsonb_typeof(metadata) = 'object'
  AND (metadata->>'status' = 'complete' OR metadata ? 'submitted_at');

CREATE OR REPLACE FUNCTION public.preserve_completed_form_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- The first complete save is canonical. Any delayed partial request (or a
  -- repeated complete request) becomes a no-op instead of overwriting answers.
  IF OLD.completed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preserve_completed_form_response_trigger ON public.form_responses;
CREATE TRIGGER preserve_completed_form_response_trigger
BEFORE UPDATE ON public.form_responses
FOR EACH ROW
EXECUTE FUNCTION public.preserve_completed_form_response();

REVOKE ALL ON FUNCTION public.preserve_completed_form_response() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.form_response_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('google_sheets', 'completion_webhook')),
  destination_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_response_deliveries_response_fk
    FOREIGN KEY (form_id, response_id)
    REFERENCES public.form_responses(form_id, response_id)
    ON DELETE CASCADE,
  CONSTRAINT form_response_deliveries_destination_key
    UNIQUE (form_id, response_id, destination_key)
);

CREATE INDEX IF NOT EXISTS idx_form_response_deliveries_pending
  ON public.form_response_deliveries(status, lease_until)
  WHERE status <> 'delivered';

ALTER TABLE public.form_response_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.form_response_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_response_deliveries TO service_role;

COMMENT ON TABLE public.form_response_deliveries IS
  'Service-only idempotency ledger for response completion webhooks and Google Sheets writes.';
