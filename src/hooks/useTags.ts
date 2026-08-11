import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './authContext';
import { toast } from 'sonner';
import { hasSingleIdAck } from '@/lib/databaseAck';

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
    if (error) toast.error('Não foi possível carregar as etiquetas.');
    else if (data) setTags(data as Tag[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (user?.id) void fetchTags();
    else setTags([]);
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
    const { data, error } = await supabase.from('tags').delete().eq('id', id).select('id').maybeSingle();
    if (error || !hasSingleIdAck(data, id)) { toast.error('Erro ao excluir tag'); return; }
    setTags(prev => prev.filter(t => t.id !== id));
  }, []);

  return { tags, loading, fetchTags, createTag, updateTag, deleteTag };
}

export function useFormTags(formId: string | null) {
  const [formTagIds, setFormTagIds] = useState<string[]>([]);

  const fetchFormTags = useCallback(async () => {
    if (!formId) {
      setFormTagIds([]);
      return;
    }
    const { data, error } = await supabase
      .from('form_tags')
      .select('tag_id')
      .eq('form_id', formId);
    if (error) toast.error('Não foi possível carregar as etiquetas deste formulário.');
    else if (data) setFormTagIds(data.map((r: { tag_id: string }) => r.tag_id));
  }, [formId]);

  useEffect(() => { fetchFormTags(); }, [fetchFormTags]);

  const addTagToForm = useCallback(async (tagId: string) => {
    if (!formId) return;
    const { data, error } = await supabase
      .from('form_tags')
      .insert({ form_id: formId, tag_id: tagId })
      .select('form_id, tag_id')
      .maybeSingle();
    if (error || data?.form_id !== formId || data?.tag_id !== tagId) toast.error('Não foi possível adicionar a etiqueta.');
    else setFormTagIds(prev => prev.includes(tagId) ? prev : [...prev, tagId]);
  }, [formId]);

  const removeTagFromForm = useCallback(async (tagId: string) => {
    if (!formId) return;
    const { data, error } = await supabase
      .from('form_tags')
      .delete()
      .eq('form_id', formId)
      .eq('tag_id', tagId)
      .select('form_id, tag_id')
      .maybeSingle();
    if (error || data?.form_id !== formId || data?.tag_id !== tagId) toast.error('Não foi possível remover a etiqueta.');
    else setFormTagIds(prev => prev.filter(id => id !== tagId));
  }, [formId]);

  return { formTagIds, addTagToForm, removeTagFromForm, refetch: fetchFormTags };
}

// Load all form tags at once (for Dashboard)
export function useAllFormTags(formIds: string[]) {
  const [map, setMap] = useState<Record<string, string[]>>({});
  const key = useMemo(() => formIds.slice().sort().join(','), [formIds]);

  useEffect(() => {
    if (!key) {
      setMap({});
      return;
    }
    let cancelled = false;
    const ids = key.split(',');
    supabase
      .from('form_tags')
      .select('form_id, tag_id')
      .in('form_id', ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error('Não foi possível carregar as etiquetas dos formulários.');
          return;
        }
        if (!data) return;
        const result: Record<string, string[]> = {};
        for (const r of data as { form_id: string; tag_id: string }[]) {
          if (!result[r.form_id]) result[r.form_id] = [];
          result[r.form_id].push(r.tag_id);
        }
        setMap(result);
      });
    return () => { cancelled = true; };
  }, [key]);

  return map;
}
