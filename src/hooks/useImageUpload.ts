import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseImageUploadOptions {
  /** Path prefix for uploaded files, e.g. 'quiz-images', 'carousel' */
  pathPrefix?: string;
  /** Callback when upload succeeds */
  onSuccess?: (url: string) => void;
  /** Callback on upload error */
  onError?: (err: unknown) => void;
}

/**
 * Lightweight hook that wraps the raw minio-upload pattern used across
 * the editor.  Keeps a single `uploading` flag per component instance
 * and exposes an imperative `upload(file)` helper.
 */
export function useImageUpload(opts: UseImageUploadOptions = {}) {
  const { pathPrefix = 'images', onSuccess, onError } = opts;
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef(false);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    abortRef.current = false;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', `${pathPrefix}/${crypto.randomUUID()}-${file.name}`);
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
      console.error('Upload failed:', err);
      onError?.(err);
      return null;
    } finally {
      setUploading(false);
    }
  }, [pathPrefix, onSuccess, onError]);

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
