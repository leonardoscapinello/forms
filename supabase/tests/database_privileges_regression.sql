BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(56);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relkind = 'r'
      AND relation.relname = ANY(ARRAY[
        'app_settings', 'application_setup_state', 'edge_rate_limits', 'email_validations', 'folders',
        'form_page_events', 'form_response_deliveries', 'form_responses',
        'form_sessions', 'form_tags', 'form_workflow_executions', 'forms',
        'gallery_files', 'gallery_folders', 'google_sheets_sync_leases',
        'integration_settings',
        'pixel_events_log', 'profiles', 'tags', 'user_roles'
      ])
      AND relation.relrowsecurity = true
  ),
  20::BIGINT,
  'all application tables have RLS enabled'
);

SELECT ok(has_table_privilege('anon', 'public.app_settings', 'SELECT'),
  'anon can read public brand settings');
SELECT ok(has_table_privilege('authenticated', 'public.app_settings', 'SELECT'),
  'authenticated can read public brand settings');
SELECT ok(has_table_privilege('authenticated', 'public.app_settings', 'INSERT'),
  'authenticated brand insert is available to the admin RLS policy');
SELECT ok(has_table_privilege('authenticated', 'public.app_settings', 'UPDATE'),
  'authenticated brand update is available to the admin RLS policy');
SELECT ok(has_table_privilege('authenticated', 'public.app_settings', 'DELETE'),
  'authenticated brand delete is available to the admin RLS policy');

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relkind = 'r'
      AND relation.relname <> 'app_settings'
      AND has_table_privilege(
        'anon', format('public.%I', relation.relname), 'SELECT'
      )
  ),
  0::BIGINT,
  'anon cannot read any other application table'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relkind = 'r'
      AND (
        has_table_privilege('anon', format('public.%I', relation.relname), 'INSERT')
        OR has_table_privilege('anon', format('public.%I', relation.relname), 'UPDATE')
        OR has_table_privilege('anon', format('public.%I', relation.relname), 'DELETE')
        OR has_table_privilege('anon', format('public.%I', relation.relname), 'TRUNCATE')
        OR has_table_privilege('anon', format('public.%I', relation.relname), 'REFERENCES')
        OR has_table_privilege('anon', format('public.%I', relation.relname), 'TRIGGER')
      )
  ),
  0::BIGINT,
  'anon has no write, truncate, references or trigger table privileges'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relkind = 'r'
      AND (
        has_table_privilege('authenticated', format('public.%I', relation.relname), 'TRUNCATE')
        OR has_table_privilege('authenticated', format('public.%I', relation.relname), 'REFERENCES')
        OR has_table_privilege('authenticated', format('public.%I', relation.relname), 'TRIGGER')
      )
  ),
  0::BIGINT,
  'authenticated has no truncate, references or trigger table privileges'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.relnamespace = 'public'::regnamespace
      AND relation.relkind = 'r'
      AND (
        has_table_privilege('service_role', format('public.%I', relation.relname), 'TRUNCATE')
        OR has_table_privilege('service_role', format('public.%I', relation.relname), 'REFERENCES')
        OR has_table_privilege('service_role', format('public.%I', relation.relname), 'TRIGGER')
      )
  ),
  0::BIGINT,
  'service_role has no truncate, references or trigger table privileges'
);

SELECT ok(has_table_privilege('authenticated', 'public.forms', 'SELECT'),
  'authenticated can select forms through RLS');
SELECT ok(has_table_privilege('authenticated', 'public.forms', 'INSERT'),
  'authenticated can insert forms through RLS');
SELECT ok(has_table_privilege('authenticated', 'public.forms', 'UPDATE'),
  'authenticated can update forms through RLS');
SELECT ok(has_table_privilege('authenticated', 'public.forms', 'DELETE'),
  'authenticated can delete forms through RLS');

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'form_responses', 'form_sessions', 'form_page_events', 'pixel_events_log'
    ]) AS telemetry(table_name)
    WHERE has_table_privilege(
      'authenticated', format('public.%I', telemetry.table_name), 'SELECT'
    )
  ),
  4::BIGINT,
  'authenticated can read all owner-scoped telemetry tables'
);

SELECT is(
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'form_responses', 'form_sessions', 'form_page_events', 'pixel_events_log'
    ]) AS telemetry(table_name)
    WHERE has_table_privilege('authenticated', format('public.%I', telemetry.table_name), 'INSERT')
      OR has_table_privilege('authenticated', format('public.%I', telemetry.table_name), 'UPDATE')
      OR has_table_privilege('authenticated', format('public.%I', telemetry.table_name), 'DELETE')
  ),
  0::BIGINT,
  'authenticated cannot write respondent telemetry directly'
);

SELECT ok(NOT has_table_privilege('authenticated', 'public.integration_settings', 'SELECT'),
  'authenticated cannot read integration secrets directly');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.integration_settings', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.integration_settings', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.integration_settings', 'DELETE'),
  'authenticated cannot write integration secrets directly'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.application_setup_state', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.application_setup_state', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.application_setup_state', 'SELECT'),
  'setup claim state is private even from direct service-role table access'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.initial_admin_setup_available()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.initial_admin_setup_available()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.claim_initial_admin_setup()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.claim_initial_admin_setup()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.release_initial_admin_setup(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.complete_initial_admin_setup(uuid,uuid)', 'EXECUTE'),
  'browser roles cannot inspect, claim, release or complete administrator bootstrap'
);
SELECT ok(
  has_function_privilege('service_role', 'public.initial_admin_setup_available()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.claim_initial_admin_setup()', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.release_initial_admin_setup(uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.complete_initial_admin_setup(uuid,uuid)', 'EXECUTE'),
  'service role can execute the complete serialized bootstrap contract'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.get_admin_users(timestamptz,uuid,integer)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.get_admin_users(timestamptz,uuid,integer)', 'EXECUTE'),
  'only authenticated callers can reach the internally admin-authorized user directory'
);
SELECT ok(
  has_table_privilege('service_role', 'public.integration_settings', 'SELECT')
  AND has_table_privilege('service_role', 'public.integration_settings', 'INSERT')
  AND has_table_privilege('service_role', 'public.integration_settings', 'UPDATE')
  AND has_table_privilege('service_role', 'public.integration_settings', 'DELETE'),
  'service_role can manage integration settings for Edge Functions'
);
SELECT ok(
  has_table_privilege('service_role', 'public.form_response_deliveries', 'SELECT')
  AND has_table_privilege('service_role', 'public.form_response_deliveries', 'INSERT')
  AND has_table_privilege('service_role', 'public.form_response_deliveries', 'UPDATE')
  AND has_table_privilege('service_role', 'public.form_response_deliveries', 'DELETE'),
  'service_role can manage the response outbox'
);
SELECT ok(
  has_table_privilege('service_role', 'public.google_sheets_sync_leases', 'SELECT')
  AND has_table_privilege('service_role', 'public.google_sheets_sync_leases', 'INSERT')
  AND has_table_privilege('service_role', 'public.google_sheets_sync_leases', 'UPDATE')
  AND has_table_privilege('service_role', 'public.google_sheets_sync_leases', 'DELETE'),
  'service_role can manage Google Sheets sync fencing leases'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.google_sheets_sync_leases', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.google_sheets_sync_leases', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.google_sheets_sync_leases', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.google_sheets_sync_leases', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.google_sheets_sync_leases', 'DELETE'),
  'browser roles cannot inspect or mutate Google Sheets sync leases'
);
SELECT ok(
  has_table_privilege('service_role', 'public.form_workflow_executions', 'SELECT')
  AND has_table_privilege('service_role', 'public.form_workflow_executions', 'INSERT')
  AND has_table_privilege('service_role', 'public.form_workflow_executions', 'UPDATE')
  AND has_table_privilege('service_role', 'public.form_workflow_executions', 'DELETE'),
  'service_role can manage workflow idempotency rows'
);

SELECT ok(has_table_privilege('authenticated', 'public.email_validations', 'SELECT'),
  'authenticated validation reads are available to admin RLS');
SELECT ok(has_table_privilege('authenticated', 'public.email_validations', 'DELETE'),
  'authenticated validation deletes are available to admin RLS');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.email_validations', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.email_validations', 'UPDATE'),
  'email validation writes remain service-only'
);

SELECT ok(NOT has_function_privilege(
  'anon', 'public.claim_form_response_deliveries(integer,integer,integer)', 'EXECUTE'
), 'anon cannot claim response deliveries');
SELECT ok(NOT has_function_privilege(
  'authenticated', 'public.claim_form_response_deliveries(integer,integer,integer)', 'EXECUTE'
), 'authenticated cannot claim response deliveries');
SELECT ok(has_function_privilege(
  'service_role', 'public.claim_form_response_deliveries(integer,integer,integer)', 'EXECUTE'
), 'service_role can claim response deliveries');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.migrate_form_response_encryption(uuid,jsonb,jsonb,text,text)', 'EXECUTE'
), 'anon cannot run the response encryption backfill');
SELECT ok(NOT has_function_privilege(
  'authenticated', 'public.migrate_form_response_encryption(uuid,jsonb,jsonb,text,text)', 'EXECUTE'
), 'authenticated cannot run the response encryption backfill RPC directly');
SELECT ok(has_function_privilege(
  'service_role', 'public.migrate_form_response_encryption(uuid,jsonb,jsonb,text,text)', 'EXECUTE'
), 'service_role can run the exact-ACK response encryption backfill');
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_google_sheets_sync_lease(text,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.claim_google_sheets_sync_lease(text,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.renew_google_sheets_sync_lease(text,uuid,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.release_google_sheets_sync_lease(text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.is_google_sheets_sync_lease_active(text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.get_form_response_sheet_sequence(text,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.ack_google_sheets_manual_sync(text,text,text,timestamptz,uuid)', 'EXECUTE'),
  'browser roles cannot fence, inspect or acknowledge Sheets delivery'
);
SELECT ok(
  has_function_privilege('service_role', 'public.claim_google_sheets_sync_lease(text,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.renew_google_sheets_sync_lease(text,uuid,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.release_google_sheets_sync_lease(text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.is_google_sheets_sync_lease_active(text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.get_form_response_sheet_sequence(text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.ack_google_sheets_manual_sync(text,text,text,timestamptz,uuid)', 'EXECUTE'),
  'service_role owns the complete Sheets fencing and deterministic-row contract'
);

SELECT ok(NOT has_function_privilege(
  'anon', 'public.configure_form_response_delivery_worker_schedule()', 'EXECUTE'
), 'anon cannot configure the delivery cron');
SELECT ok(NOT has_function_privilege(
  'authenticated', 'public.configure_form_response_delivery_worker_schedule()', 'EXECUTE'
), 'authenticated cannot configure the delivery cron');
SELECT ok(has_function_privilege(
  'service_role', 'public.configure_form_response_delivery_worker_schedule()', 'EXECUTE'
), 'service_role can configure the delivery cron');

SELECT ok(NOT has_function_privilege(
  'anon', 'public.get_analytics_dashboard(text[],timestamptz,timestamptz,text)', 'EXECUTE'
), 'anon cannot execute corporate analytics');
SELECT ok(has_function_privilege(
  'authenticated', 'public.get_analytics_dashboard(text[],timestamptz,timestamptz,text)', 'EXECUTE'
), 'authenticated can execute corporate analytics through function authorization');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.get_form_page_dropoff(text)', 'EXECUTE'
), 'anon cannot execute page dropoff analytics');
SELECT ok(has_function_privilege(
  'authenticated', 'public.get_form_page_dropoff(text)', 'EXECUTE'
), 'authenticated can execute page dropoff analytics through function authorization');
SELECT ok(NOT has_function_privilege(
  'anon', 'public.get_forms_home_summary(integer)', 'EXECUTE'
), 'anon cannot execute home summary analytics');
SELECT ok(has_function_privilege(
  'authenticated', 'public.get_forms_home_summary(integer)', 'EXECUTE'
), 'authenticated can execute home summary analytics through function authorization');
SELECT ok(NOT has_function_privilege(
  'service_role', 'public.get_forms_home_summary(integer)', 'EXECUTE'
), 'home summary is not exposed as a service-only bypass');

SELECT ok(has_function_privilege(
  'service_role', 'public.consume_edge_rate_limit(text,text,integer,integer)', 'EXECUTE'
), 'service_role can consume rate limits');
SELECT ok(NOT has_function_privilege(
  'authenticated', 'public.consume_edge_rate_limit(text,text,integer,integer)', 'EXECUTE'
), 'authenticated cannot bypass Edge Function rate limiting');
SELECT ok(has_function_privilege(
  'service_role', 'public.cleanup_edge_rate_limits(interval,integer)', 'EXECUTE'
), 'service_role can run bounded rate-limit retention');
SELECT ok(
  NOT has_function_privilege('anon', 'public.cleanup_edge_rate_limits(interval,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cleanup_edge_rate_limits(interval,integer)', 'EXECUTE'),
  'browser roles cannot delete rate-limit state'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS function_record
    CROSS JOIN LATERAL aclexplode(
      COALESCE(function_record.proacl, acldefault('f', function_record.proowner))
    ) AS function_acl
    WHERE function_record.pronamespace = 'public'::regnamespace
      AND function_record.proname = ANY(ARRAY[
        'enqueue_completed_form_response_deliveries',
        'preserve_completed_form_response',
        'protect_profile_security_fields',
        'set_app_settings_audit_fields',
        'cleanup_deleted_form_telemetry'
      ])
      AND function_acl.grantee = 0
      AND function_acl.privilege_type = 'EXECUTE'
  ),
  0::BIGINT,
  'trigger-only security functions are not executable by PUBLIC'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE'),
  'signup trigger function has no direct API-role execution grant'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.cleanup_deleted_form_telemetry()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cleanup_deleted_form_telemetry()', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.cleanup_deleted_form_telemetry()', 'EXECUTE'),
  'form cleanup trigger function has no direct API-role execution grant'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS sequence_record
    WHERE sequence_record.relnamespace = 'public'::regnamespace
      AND sequence_record.relkind = 'S'
      AND (
        has_sequence_privilege('anon', sequence_record.oid, 'USAGE')
        OR has_sequence_privilege('authenticated', sequence_record.oid, 'USAGE')
        OR has_sequence_privilege('service_role', sequence_record.oid, 'USAGE')
      )
  ),
  0::BIGINT,
  'no public sequence leaks usage to API roles'
);

SELECT * FROM finish();
ROLLBACK;
