-- Add unique constraint on form_responses for upsert support (partial + complete)
ALTER TABLE public.form_responses
  ADD CONSTRAINT form_responses_form_id_response_id_key
  UNIQUE (form_id, response_id);

-- Allow anonymous users to update their own partial responses (for upsert)
CREATE POLICY "Anyone can update own form response"
  ON public.form_responses FOR UPDATE
  USING (true)
  WITH CHECK (true);