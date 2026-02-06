
-- Table to store integration settings (MinIO, webhooks, etc.)
CREATE TABLE public.integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type TEXT NOT NULL, -- 'minio_s3', 'webhook', 'smtp', etc.
  label TEXT NOT NULL DEFAULT '',
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- For now, allow all authenticated users to manage settings
-- (in production you'd restrict to admin roles)
CREATE POLICY "Authenticated users can view integration settings"
  ON public.integration_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert integration settings"
  ON public.integration_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update integration settings"
  ON public.integration_settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete integration settings"
  ON public.integration_settings FOR DELETE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_integration_settings_updated_at
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
