-- Remove Supabase storage bucket (uploads go to MinIO only)
DROP POLICY IF EXISTS "Authenticated users can upload form files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view form uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete form files" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'form-uploads';