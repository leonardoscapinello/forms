-- Durable response integrations need a server-side consumer even when the
-- respondent closes the browser. Secrets remain in Vault and are resolved only
-- when pg_cron invokes the Edge Function; no secret is stored in this migration
-- or in the cron command text.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.configure_form_response_delivery_worker_schedule()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing RECORD;
  v_job_id BIGINT;
  v_project_url TEXT;
  v_worker_secret TEXT;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role')
    AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT rtrim(decrypted_secret, '/')
  INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'delivery_worker_secret'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_project_url IS NULL
    OR v_project_url !~ '^https://[a-z0-9-]+\.supabase\.co$'
    OR v_worker_secret IS NULL
    OR length(v_worker_secret) < 32 THEN
    RAISE EXCEPTION 'delivery_worker_vault_secrets_missing' USING ERRCODE = '22023';
  END IF;

  FOR v_existing IN
    SELECT jobid FROM cron.job WHERE jobname = 'form-response-delivery-worker'
  LOOP
    PERFORM cron.unschedule(v_existing.jobid);
  END LOOP;

  SELECT cron.schedule(
    'form-response-delivery-worker',
    -- pg_cron 1.6 accepts second-based intervals. A ten-second cadence plus a
    -- 10-item claim supports up to 60 deliveries/minute while leaving a wide
    -- margin between bounded provider calls and the 120-second database lease.
    '10 seconds',
    $cron$
      SELECT net.http_post(
        url := (
          SELECT rtrim(decrypted_secret, '/')
          FROM vault.decrypted_secrets
          WHERE name = 'project_url'
          ORDER BY created_at DESC
          LIMIT 1
        ) || '/functions/v1/form-response-delivery-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-delivery-worker-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'delivery_worker_secret'
            ORDER BY created_at DESC
            LIMIT 1
          )
        ),
        body := '{"batchSize":10}'::jsonb,
        timeout_milliseconds := 90000
      );
    $cron$
  )
  INTO v_job_id;

  RETURN v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_form_response_delivery_worker_schedule()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_form_response_delivery_worker_schedule()
  TO service_role;

COMMENT ON FUNCTION public.configure_form_response_delivery_worker_schedule() IS
  'Idempotently schedules the durable response delivery worker after environment-specific Vault secrets exist.';
