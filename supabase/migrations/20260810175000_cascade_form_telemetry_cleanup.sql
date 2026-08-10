-- Telemetry tables use text form IDs and therefore cannot rely on the UUID
-- foreign key cascade from forms. Keep the lifecycle atomic at the database
-- boundary so deleting a form never leaves responses or analytics behind.
CREATE OR REPLACE FUNCTION public.cleanup_deleted_form_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.form_page_events WHERE form_id = OLD.id::text;
  DELETE FROM public.pixel_events_log WHERE form_id = OLD.id::text;
  DELETE FROM public.form_responses WHERE form_id = OLD.id::text;
  DELETE FROM public.form_sessions WHERE form_id = OLD.id::text;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_deleted_form_telemetry() FROM PUBLIC;

DROP TRIGGER IF EXISTS cleanup_form_telemetry_before_delete ON public.forms;
CREATE TRIGGER cleanup_form_telemetry_before_delete
BEFORE DELETE ON public.forms
FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_form_telemetry();

-- Remove historical orphan telemetry, including disposable QA fixtures.
DELETE FROM public.form_page_events event
WHERE NOT EXISTS (SELECT 1 FROM public.forms form WHERE form.id::text = event.form_id);

DELETE FROM public.pixel_events_log event
WHERE NOT EXISTS (SELECT 1 FROM public.forms form WHERE form.id::text = event.form_id);

DELETE FROM public.form_responses response
WHERE NOT EXISTS (SELECT 1 FROM public.forms form WHERE form.id::text = response.form_id);

DELETE FROM public.form_sessions session
WHERE NOT EXISTS (SELECT 1 FROM public.forms form WHERE form.id::text = session.form_id);
