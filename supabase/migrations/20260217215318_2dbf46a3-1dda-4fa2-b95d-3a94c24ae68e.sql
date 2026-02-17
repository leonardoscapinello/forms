
-- ─── form_sessions: uma linha por visita ao formulário ──────────────────────
CREATE TABLE IF NOT EXISTS public.form_sessions (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id         TEXT         NOT NULL,
  response_id     TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'dropped'
  started_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  current_page_index INTEGER    DEFAULT 0,
  pages_visited   INTEGER      DEFAULT 0,
  total_pages     INTEGER,
  source_url      TEXT,
  referrer        TEXT,
  user_agent      TEXT,
  ip_address      TEXT,
  query_params    JSONB        DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_sessions_form_id    ON public.form_sessions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_sessions_created_at ON public.form_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_sessions_status     ON public.form_sessions(status);
CREATE INDEX IF NOT EXISTS idx_form_sessions_response   ON public.form_sessions(response_id);

ALTER TABLE public.form_sessions ENABLE ROW LEVEL SECURITY;

-- Visitantes anônimos podem inserir (formulários são públicos)
CREATE POLICY "Anyone can insert form sessions"
  ON public.form_sessions FOR INSERT WITH CHECK (true);

-- Visitantes anônimos podem atualizar a própria sessão (via response_id)
CREATE POLICY "Anyone can update own form session"
  ON public.form_sessions FOR UPDATE USING (true);

-- Apenas usuários autenticados leem
CREATE POLICY "Authenticated users can view form sessions"
  ON public.form_sessions FOR SELECT USING (auth.role() = 'authenticated');


-- ─── form_page_events: evento por página visitada ────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_page_events (
  id              UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID,                    -- referência lógica a form_sessions.id
  form_id         TEXT         NOT NULL,
  response_id     TEXT         NOT NULL,
  page_id         TEXT,
  page_index      INTEGER,
  page_title      TEXT,
  event_type      TEXT         NOT NULL,   -- 'page_view' | 'form_start' | 'form_complete' | 'form_drop'
  time_on_page_ms INTEGER,                 -- ms no step antes de avançar
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_page_events_form_id    ON public.form_page_events(form_id);
CREATE INDEX IF NOT EXISTS idx_form_page_events_created_at ON public.form_page_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_page_events_response   ON public.form_page_events(response_id);
CREATE INDEX IF NOT EXISTS idx_form_page_events_page_index ON public.form_page_events(page_index);

ALTER TABLE public.form_page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert form page events"
  ON public.form_page_events FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can view form page events"
  ON public.form_page_events FOR SELECT USING (auth.role() = 'authenticated');
