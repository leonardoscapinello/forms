-- Garantir colunas comportamentais em form_page_events
ALTER TABLE public.form_page_events
  ADD COLUMN IF NOT EXISTS hesitation_ms      INTEGER,
  ADD COLUMN IF NOT EXISTS interaction_count  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS answer_char_count  INTEGER;

-- Criar tabela de respostas completas para análise AI e histórico
CREATE TABLE IF NOT EXISTS public.form_responses (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id         TEXT        NOT NULL,
  session_id      UUID,
  response_id     TEXT        NOT NULL UNIQUE,
  answers         JSONB       NOT NULL DEFAULT '{}',
  metadata        JSONB       DEFAULT '{}',
  total_time_ms   INTEGER,
  pages_visited   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_form_responses_form_id    ON public.form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_created_at ON public.form_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_responses_response   ON public.form_responses(response_id);

ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'form_responses' AND policyname = 'Anyone can insert form responses'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can insert form responses"
      ON public.form_responses FOR INSERT WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'form_responses' AND policyname = 'Authenticated users can view form responses'
  ) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can view form responses"
      ON public.form_responses FOR SELECT USING (auth.role() = ''authenticated'')';
  END IF;
END $$;
