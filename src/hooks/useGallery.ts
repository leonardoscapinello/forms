import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './authContext';
import { toast } from 'sonner';
import { hasExactIdAcks, hasSingleIdAck } from '@/lib/databaseAck';

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

export function collectGalleryFolderIds(folders: GalleryFolder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  const collectChildren = (parentId: string) => {
    folders.filter((folder) => folder.parent_folder_id === parentId).forEach((folder) => {
      if (ids.has(folder.id)) return;
      ids.add(folder.id);
      collectChildren(folder.id);
    });
  };
  collectChildren(rootId);
  return ids;
}

export function useGallery() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setFolders([]);
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [fRes, fiRes] = await Promise.all([
      supabase.from('gallery_folders').select('*').eq('user_id', user.id).order('name'),
      supabase.from('gallery_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    if (fRes.error || fiRes.error) {
      toast.error('Não foi possível carregar a galeria.');
    }
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
    const { data, error } = await supabase
      .from('gallery_folders')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(data, id)) { toast.error('Erro ao renomear pasta'); return; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    const folderIds = collectGalleryFolderIds(folders, id);
    const affectedFiles = files.filter((file) => file.folder_id && folderIds.has(file.folder_id));

    // Keep database metadata until every object deletion has an explicit ACK.
    for (const file of affectedFiles) {
      const { data, error } = await supabase.functions.invoke('minio-delete', { body: { path: file.path } });
      if (error || data?.success !== true) {
        toast.error('Não foi possível excluir todos os arquivos da pasta. Tente novamente.');
        return false;
      }
    }

    if (affectedFiles.length > 0) {
      const expectedIds = new Set(affectedFiles.map((file) => file.id));
      const { data: deletedFiles, error: filesError } = await supabase
        .from('gallery_files')
        .delete()
        .in('id', [...expectedIds])
        .select('id');
      if (filesError || !hasExactIdAcks(deletedFiles, expectedIds)) {
        toast.error('Os arquivos foram removidos do armazenamento, mas a galeria ainda precisa ser sincronizada. Tente novamente.');
        return false;
      }
    }
    const { data: deletedFolder, error } = await supabase
      .from('gallery_folders')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(deletedFolder, id)) { toast.error('Erro ao excluir pasta'); return false; }
    setFolders(prev => prev.filter(folder => !folderIds.has(folder.id)));
    setFiles(prev => prev.filter(file => !affectedFiles.some((affected) => affected.id === file.id)));
    toast.success('Pasta excluída');
    return true;
  }, [files, folders]);

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

      if (error) {
        await supabase.functions.invoke('minio-delete', { body: { path: uploadResult.path } });
        toast.error('O upload foi revertido porque não foi possível salvar o arquivo na galeria.');
        return null;
      }
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
      const { data, error } = await supabase.functions.invoke('minio-delete', { body: { path: file.path } });
      if (error || data?.success !== true) {
        toast.error('Não foi possível remover o arquivo do armazenamento.');
        return;
      }
    }
    const { data: deletedFile, error } = await supabase
      .from('gallery_files')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(deletedFile, id)) { toast.error('Erro ao excluir arquivo'); return; }
    setFiles(prev => prev.filter(f => f.id !== id));
    toast.success('Arquivo excluído');
  }, [files]);

  const moveFile = useCallback(async (fileId: string, folderId: string | null) => {
    const { data, error } = await supabase
      .from('gallery_files')
      .update({ folder_id: folderId })
      .eq('id', fileId)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(data, fileId)) { toast.error('Erro ao mover arquivo'); return; }
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: folderId } : f));
  }, []);

  return { folders, files, loading, createFolder, renameFolder, deleteFolder, uploadFile, deleteFile, moveFile, refetch: fetchAll };
}
