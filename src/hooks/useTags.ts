import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export function useTags() {
  const { user } = useAuth();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .order('name');
    if (!error && data) setTags(data as Tag[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.id) fetchTags();
  }, [user?.id, fetchTags]);

  const createTag = useCallback(async (name: string, color: string) => {
    if (!user?.id) return null;
    const { data, error } = await supabase
      .from('tags')
      .insert({ name: name.trim(), color, created_by: user.id })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') toast.error('Já existe uma tag com esse nome');
      else toast.error('Erro ao criar tag');
      return null;
    }
    setTags(prev => [...prev, data as Tag].sort((a, b) => a.name.localeCompare(b.name)));
    return data as Tag;
  }, [user?.id]);

  const updateTag = useCallback(async (id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) => {
    const { data, error } = await supabase
      .from('tags')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) { toast.error('Erro ao atualizar tag'); return; }
    setTags(prev => prev.map(t => t.id === id ? data as Tag : t).sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir tag'); return; }
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tags, loading, fetchTags, createTag, updateTag, deleteTag };
}

export function useFormTags(formId: string | null) {
  const [formTagIds, setFormTagIds] = useState<string[]>([]);

  const fetchFormTags = useCallback(async () => {
    if (!formId) return;
    const { data } = await supabase
      .from('form_tags')
      .select('tag_id')
      .eq('form_id', formId);
    if (data) setFormTagIds(data.map((r: { tag_id: string }) => r.tag_id));
  }, [formId]);

  useEffect(() => { fetchFormTags(); }, [fetchFormTags]);

  const addTagToForm = useCallback(async (tagId: string) => {
    if (!formId) return;
    const { error } = await supabase
      .from('form_tags')
      .insert({ form_id: formId, tag_id: tagId });
    if (!error) setFormTagIds(prev => [...prev, tagId]);
  }, [formId]);

  const removeTagFromForm = useCallback(async (tagId: string) => {
    if (!formId) return;
    const { error } = await supabase
      .from('form_tags')
      .delete()
      .eq('form_id', formId)
      .eq('tag_id', tagId);
    if (!error) setFormTagIds(prev => prev.filter(id => id !== tagId));
  }, [formId]);

  return { formTagIds, addTagToForm, removeTagFromForm, refetch: fetchFormTags };
}

// Load all form tags at once (for Dashboard)
export function useAllFormTags(formIds: string[]) {
  const [map, setMap] = useState<Record<string, string[]>>({});
  const key = useMemo(() => formIds.slice().sort().join(','), [formIds]);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    supabase
      .from('form_tags')
      .select('form_id, tag_id')
      .in('form_id', ids)
      .then(({ data }) => {
        if (!data) return;
        const result: Record<string, string[]> = {};
        for (const r of data as { form_id: string; tag_id: string }[]) {
          if (!result[r.form_id]) result[r.form_id] = [];
          result[r.form_id].push(r.tag_id);
        }
        setMap(result);
      });
  }, [key]);

  return map;
}
