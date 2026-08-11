-- Public, non-secret application identity. Respondents and the login screen may
-- read it; only active administrators may change it.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY CHECK (key = 'brand'),
  value JSONB NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT app_settings_brand_value_check CHECK (
    key <> 'brand'
    OR (
      jsonb_typeof(value->'productName') = 'string'
      AND length(btrim(value->>'productName')) BETWEEN 1 AND 80
      AND jsonb_typeof(value->'ownerName') = 'string'
      AND length(btrim(value->>'ownerName')) BETWEEN 1 AND 120
      AND jsonb_typeof(value->'description') = 'string'
      AND length(btrim(value->>'description')) BETWEEN 1 AND 320
    )
  )
);

INSERT INTO public.app_settings (key, value)
VALUES (
  'brand',
  jsonb_build_object(
    'productName', 'Forms',
    'ownerName', 'Leonardo Scapinello',
    'description', 'Projeto pessoal para criar, publicar e analisar formulários e quizzes interativos.',
    'logoUrl', '/images/brand-icon.svg',
    'faviconUrl', '/images/brand-favicon.svg'
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_app_settings_audit_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_app_settings_audit_fields_trigger ON public.app_settings;
CREATE TRIGGER set_app_settings_audit_fields_trigger
BEFORE INSERT OR UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_app_settings_audit_fields();

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read application brand" ON public.app_settings;
CREATE POLICY "Public can read application brand"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (key = 'brand');

DROP POLICY IF EXISTS "Active admins manage application brand" ON public.app_settings;
CREATE POLICY "Active admins manage application brand"
ON public.app_settings
FOR ALL
TO authenticated
USING (key = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (key = 'brand' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Supabase's local `postgres` default ACL grants TRUNCATE/REFERENCES/TRIGGER to
-- API roles. RLS does not protect TRUNCATE, so revoke every inherited table
-- privilege before granting only the operations this table actually exposes.
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_settings TO service_role;

REVOKE ALL ON FUNCTION public.set_app_settings_audit_fields() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.app_settings IS
  'Public non-secret application identity; active administrators are the only writers.';
