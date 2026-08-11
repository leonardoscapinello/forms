-- Server-side fireOnce enforcement for public workflow side effects. Browser
-- memory is not an authorization or idempotency boundary, so each response/node
-- execution is claimed here before external email, WhatsApp, AI, pixel or webhook
-- work starts.

CREATE TABLE IF NOT EXISTS public.form_workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id TEXT NOT NULL,
  response_id TEXT NOT NULL,
  node_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  lease_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT form_workflow_executions_unique_node
    UNIQUE (form_id, response_id, node_key)
);

CREATE INDEX IF NOT EXISTS idx_form_workflow_executions_pending
  ON public.form_workflow_executions(status, lease_until)
  WHERE status <> 'delivered';

ALTER TABLE public.form_workflow_executions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.form_workflow_executions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_workflow_executions TO service_role;

COMMENT ON TABLE public.form_workflow_executions IS
  'Service-only idempotency ledger for side-effecting public workflow nodes.';

-- The telemetry cleanup trigger predates this ledger. Recreate its function
-- after the table exists so deleting a form also removes its idempotency rows.
CREATE OR REPLACE FUNCTION public.cleanup_deleted_form_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.form_page_events WHERE form_id = OLD.id::text;
  DELETE FROM public.pixel_events_log WHERE form_id = OLD.id::text;
  DELETE FROM public.form_responses WHERE form_id = OLD.id::text;
  DELETE FROM public.form_sessions WHERE form_id = OLD.id::text;
  DELETE FROM public.form_workflow_executions WHERE form_id = OLD.id::text;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_deleted_form_telemetry() FROM PUBLIC;
