-- Disable direct client access (uploads go to MinIO only).
-- Supabase blocks deleting buckets through SQL; keep this empty bucket private
-- so a clean migration remains reproducible on current projects.
DROP POLICY IF EXISTS "Authenticated users can upload form files" ON storage.objects;
DROP POLICY IF EXISTS "Public can view form uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete form files" ON storage.objects;
UPDATE storage.buckets SET public = false WHERE id = 'form-uploads';
