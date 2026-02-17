import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FolderNode extends Folder {
  children: FolderNode[];
}

export function buildFolderTree(flat: Folder[]): FolderNode[] {
  const map: Record<string, FolderNode> = {};
  for (const f of flat) map[f.id] = { ...f, children: [] };
  const roots: FolderNode[] = [];
  for (const f of flat) {
    if (f.parent_folder_id && map[f.parent_folder_id]) {
      map[f.parent_folder_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  }
  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(n => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function useFolders() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    if (!error && data) setFolders(data as Folder[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const createFolder = useCallback(async (name: string, parentId: string | null = null): Promise<Folder | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('folders')
      .insert({ name: name.trim(), user_id: user.id, parent_folder_id: parentId })
      .select()
      .single();
    if (error) { toast.error('Erro ao criar pasta'); return null; }
    const folder = data as Folder;
    setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
    return folder;
  }, [user]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const { error } = await supabase
      .from('folders')
      .update({ name: name.trim() })
      .eq('id', id);
    if (error) { toast.error('Erro ao renomear pasta'); return; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    const { error } = await supabase.from('folders').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir pasta'); return; }
    // Remove folder and all children (cascades in DB, remove locally too)
    const allIds = new Set<string>();
    const collectIds = (fid: string) => {
      allIds.add(fid);
      folders.filter(f => f.parent_folder_id === fid).forEach(f => collectIds(f.id));
    };
    collectIds(id);
    setFolders(prev => prev.filter(f => !allIds.has(f.id)));
  }, [folders]);

  const moveFolder = useCallback(async (id: string, newParentId: string | null) => {
    const { error } = await supabase
      .from('folders')
      .update({ parent_folder_id: newParentId })
      .eq('id', id);
    if (error) { toast.error('Erro ao mover pasta'); return; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, parent_folder_id: newParentId } : f));
  }, []);

  const tree = buildFolderTree(folders);

  return { folders, tree, loaded, createFolder, renameFolder, deleteFolder, moveFolder, refetch: fetchFolders };
}
