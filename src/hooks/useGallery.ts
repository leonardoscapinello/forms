import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface GalleryFolder {
  id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GalleryFile {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  url: string;
  path: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export function useGallery() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [fRes, fiRes] = await Promise.all([
      supabase.from('gallery_folders').select('*').eq('user_id', user.id).order('name'),
      supabase.from('gallery_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (fRes.data) setFolders(fRes.data as GalleryFolder[]);
    if (fiRes.data) setFiles(fiRes.data as GalleryFile[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('gallery_folders')
      .insert({ name: name.trim(), user_id: user.id, parent_folder_id: parentId })
      .select().single();
    if (error) { toast.error('Erro ao criar pasta'); return null; }
    const folder = data as GalleryFolder;
    setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
    return folder;
  }, [user]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from('gallery_folders').update({ name: name.trim() }).eq('id', id);
    if (error) { toast.error('Erro ao renomear pasta'); return; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    // Delete files in this folder first
    await supabase.from('gallery_files').delete().eq('folder_id', id);
    const { error } = await supabase.from('gallery_folders').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir pasta'); return; }
    setFolders(prev => prev.filter(f => f.id !== id));
    setFiles(prev => prev.filter(f => f.folder_id !== id));
    toast.success('Pasta excluída');
  }, []);

  const uploadFile = useCallback(async (file: File, folderId: string | null = null): Promise<GalleryFile | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop() || '';
    const path = `gallery/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', path);

      const { data: uploadResult, error: uploadError } = await supabase.functions.invoke('minio-upload', { body: formData });
      if (uploadError || !uploadResult?.success) {
        toast.error(uploadResult?.message || 'Erro no upload');
        return null;
      }

      const { data, error } = await supabase.from('gallery_files').insert({
        user_id: user.id,
        folder_id: folderId,
        name: file.name,
        url: uploadResult.url,
        path: uploadResult.path,
        file_type: file.type,
        file_size: file.size,
      }).select().single();

      if (error) { toast.error('Erro ao salvar arquivo'); return null; }
      const gf = data as GalleryFile;
      setFiles(prev => [gf, ...prev]);
      return gf;
    } catch {
      toast.error('Erro no upload');
      return null;
    }
  }, [user]);

  const deleteFile = useCallback(async (id: string) => {
    const file = files.find(f => f.id === id);
    if (file) {
      await supabase.functions.invoke('minio-delete', { body: { path: file.path } });
    }
    const { error } = await supabase.from('gallery_files').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir arquivo'); return; }
    setFiles(prev => prev.filter(f => f.id !== id));
    toast.success('Arquivo excluído');
  }, [files]);

  const moveFile = useCallback(async (fileId: string, folderId: string | null) => {
    const { error } = await supabase.from('gallery_files').update({ folder_id: folderId }).eq('id', fileId);
    if (error) { toast.error('Erro ao mover arquivo'); return; }
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: folderId } : f));
  }, []);

  return { folders, files, loading, createFolder, renameFolder, deleteFolder, uploadFile, deleteFile, moveFile, refetch: fetchAll };
}
