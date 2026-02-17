-- Allow anyone to read published forms (for public preview)
CREATE POLICY "Published forms are publicly readable"
  ON public.forms
  FOR SELECT
  USING (status = 'published');