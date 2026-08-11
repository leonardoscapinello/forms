import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './authContext';
import { toast } from 'sonner';
import { hasSingleIdAck } from '@/lib/databaseAck';

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
  const userId = user?.id;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchFolders = useCallback(async () => {
    if (!userId) {
      setFolders([]);
      setLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .order('name');
    if (error) {
      toast.error('Não foi possível carregar as pastas.');
    } else if (data) {
      setFolders(data as Folder[]);
    }
    setLoaded(true);
  }, [userId]);

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
    const { data, error } = await supabase
      .from('folders')
      .update({ name: name.trim() })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(data, id)) { toast.error('Erro ao renomear pasta'); return; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    const { data, error } = await supabase.from('folders').delete().eq('id', id).select('id').maybeSingle();
    if (error || !hasSingleIdAck(data, id)) { toast.error('Erro ao excluir pasta'); return false; }
    // Remove folder and all children (cascades in DB, remove locally too)
    const allIds = new Set<string>();
    const collectIds = (fid: string) => {
      allIds.add(fid);
      folders.filter(f => f.parent_folder_id === fid).forEach(f => collectIds(f.id));
    };
    collectIds(id);
    setFolders(prev => prev.filter(f => !allIds.has(f.id)));
    return true;
  }, [folders]);

  const moveFolder = useCallback(async (id: string, newParentId: string | null): Promise<boolean> => {
    const descendantIds = new Set<string>();
    const collectDescendants = (folderId: string) => {
      folders.filter((folder) => folder.parent_folder_id === folderId).forEach((folder) => {
        if (descendantIds.has(folder.id)) return;
        descendantIds.add(folder.id);
        collectDescendants(folder.id);
      });
    };
    collectDescendants(id);
    if (newParentId === id || (newParentId !== null && descendantIds.has(newParentId))) {
      toast.error('Uma pasta não pode ser movida para dentro dela mesma.');
      return false;
    }
    const { data, error } = await supabase
      .from('folders')
      .update({ parent_folder_id: newParentId })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error || !hasSingleIdAck(data, id)) { toast.error('Erro ao mover pasta'); return false; }
    setFolders(prev => prev.map(f => f.id === id ? { ...f, parent_folder_id: newParentId } : f));
    return true;
  }, [folders]);

  const tree = buildFolderTree(folders);

  return { folders, tree, loaded, createFolder, renameFolder, deleteFolder, moveFolder, refetch: fetchFolders };
}
