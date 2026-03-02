
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('form-html', 'form-html', true, 524288, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read form-html" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'form-html');

CREATE POLICY "Service write form-html" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'form-html' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service update form-html" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'form-html' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service delete form-html" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'form-html' AND has_role(auth.uid(), 'admin'::app_role));
