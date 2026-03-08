import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseImageUploadOptions {
  /** Path prefix for uploaded files, e.g. 'quiz-images', 'carousel' */
  pathPrefix?: string;
  /** Max file size in MB after compression (default: 1) */
  maxSizeMB?: number;
  /** Callback when upload succeeds */
  onSuccess?: (url: string) => void;
  /** Callback on upload error */
  onError?: (err: unknown) => void;
}

/**
 * Lightweight hook that wraps the raw minio-upload pattern used across
 * the editor. Automatically compresses images before upload.
 */
export function useImageUpload(opts: UseImageUploadOptions = {}) {
  const { pathPrefix = 'images', maxSizeMB = 1, onSuccess, onError } = opts;
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef(false);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    abortRef.current = false;
    try {
      let fileToUpload: File = file;

      // Compress images before upload (skip SVGs and non-image files)
      if (file.type.startsWith('image/') && !file.type.includes('svg')) {
        try {
          const imageCompression = (await import('browser-image-compression')).default;
          fileToUpload = await imageCompression(file, {
            maxSizeMB,
            maxWidthOrHeight: 2048,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.82,
          });
        } catch {
          // If compression fails, upload original
          fileToUpload = file;
        }
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);
      const ext = fileToUpload.type === 'image/webp' ? '.webp' : '';
      const name = ext && !file.name.endsWith('.webp') ? file.name.replace(/\.[^.]+$/, ext) : file.name;
      formData.append('path', `${pathPrefix}/${crypto.randomUUID()}-${name}`);
      const { data, error } = await supabase.functions.invoke('minio-upload', { body: formData });
      if (error) throw error;
      if (abortRef.current) return null;
      const url = data?.url as string | undefined;
      if (url) {
        onSuccess?.(url);
        return url;
      }
      return null;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Upload failed:', err);
      onError?.(err);
      return null;
    } finally {
      setUploading(false);
    }
  }, [pathPrefix, maxSizeMB, onSuccess, onError]);

  /** Helper for attaching to <input type="file"> onChange */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return null;
    const url = await upload(file);
    e.target.value = '';
    return url;
  }, [upload]);

  return { uploading, upload, handleFileChange };
}
