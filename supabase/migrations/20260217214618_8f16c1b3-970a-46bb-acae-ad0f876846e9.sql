
-- Tabela para log de eventos de pixel/analytics disparados
CREATE TABLE IF NOT EXISTS public.pixel_events_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id TEXT NOT NULL,
  response_id TEXT,
  platform TEXT NOT NULL,           -- 'meta_pixel', 'google_analytics', 'tiktok_pixel', 'linkedin_pixel'
  event_name TEXT NOT NULL,         -- 'PageView', 'Lead', 'Purchase', custom...
  event_id TEXT,                    -- deduplication ID
  trigger_type TEXT NOT NULL DEFAULT 'flow_node', -- 'load_event' | 'flow_node'
  fired_client BOOLEAN DEFAULT FALSE,
  fired_server BOOLEAN DEFAULT FALSE,
  server_response JSONB,            -- resposta da CAPI/API server-side
  source_url TEXT,
  user_agent TEXT,
  custom_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index para consultas por formulário e data
CREATE INDEX IF NOT EXISTS idx_pixel_events_log_form_id ON public.pixel_events_log(form_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_log_created_at ON public.pixel_events_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_events_log_platform ON public.pixel_events_log(platform);
CREATE INDEX IF NOT EXISTS idx_pixel_events_log_event_name ON public.pixel_events_log(event_name);

-- RLS: sem autenticação por formulário (preview é público), mas insert aberto com anon
ALTER TABLE public.pixel_events_log ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode inserir (formulários são disparados por visitantes anônimos)
CREATE POLICY "Anyone can insert pixel event logs"
ON public.pixel_events_log
FOR INSERT
WITH CHECK (true);

-- Apenas usuários autenticados podem ler (para o painel de analytics)
CREATE POLICY "Authenticated users can view pixel event logs"
ON public.pixel_events_log
FOR SELECT
USING (auth.role() = 'authenticated');
