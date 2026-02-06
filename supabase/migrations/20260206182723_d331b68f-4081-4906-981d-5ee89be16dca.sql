-- Create storage bucket for form file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('form-uploads', 'form-uploads', true, 20971520); -- 20MB limit

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload form files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'form-uploads');

-- Allow public read access
CREATE POLICY "Public can view form uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'form-uploads');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete form files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'form-uploads');