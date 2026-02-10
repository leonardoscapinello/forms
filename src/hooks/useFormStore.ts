import { useState, useCallback, useEffect, useRef } from 'react';
import { FormData, DEFAULT_FORM_STYLE, createDefaultFunnelPage } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const DEBOUNCE_MS = 1000;

interface DbForm {
  id: string;
  user_id: string;
  title: string;
  data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

function dbToForm(row: DbForm): FormData {
  const d = row.data as Record<string, unknown>;
  return {
    ...(d as unknown as FormData),
    id: row.id,
    title: row.title,
    status: row.status as FormData['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formToDb(form: FormData, userId: string) {
  const { id, title, status, createdAt, updatedAt, ...rest } = form;
  return {
    id,
    user_id: userId,
    title,
    status,
    data: JSON.parse(JSON.stringify(rest)),
  };
}

export function useFormStore() {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pendingUpdates = useRef<Map<string, Partial<FormData>>>(new Map());
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Load forms from DB on auth
  useEffect(() => {
    if (!user) {
      setForms([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('forms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (!cancelled && data) {
        setForms((data as unknown as DbForm[]).map(dbToForm));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Flush pending update to DB
  const flushUpdate = useCallback(async (id: string, fullForm: FormData) => {
    if (!user) return;
    const row = formToDb(fullForm, user.id);
    await supabase.from('forms').update({
      title: row.title,
      status: row.status,
      data: row.data,
    }).eq('id', id);
  }, [user]);

  const updateForm = useCallback((id: string, patch: Partial<FormData>) => {
    setForms(prev => {
      const updated = prev.map(f =>
        f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f
      );

      // Debounced DB save
      const existing = debounceTimers.current.get(id);
      if (existing) clearTimeout(existing);

      const merged = { ...(pendingUpdates.current.get(id) || {}), ...patch };
      pendingUpdates.current.set(id, merged);

      const timer = setTimeout(() => {
        const form = updated.find(f => f.id === id);
        if (form) {
          flushUpdate(id, form);
          pendingUpdates.current.delete(id);
        }
        debounceTimers.current.delete(id);
      }, DEBOUNCE_MS);
      debounceTimers.current.set(id, timer);

      return updated;
    });
  }, [flushUpdate]);

  const createForm = useCallback(async (): Promise<FormData | null> => {
    if (!user) return null;
    const now = new Date().toISOString();
    const form: FormData = {
      id: crypto.randomUUID(),
      title: 'Formulário sem título',
      questions: [],
      pages: [createDefaultFunnelPage('Página 1')],
      globalPageStyle: {
        backgroundColor: '',
        fontFamily: 'Inter',
        gap: 32,
        paddingX: 24,
        paddingY: 32,
      },
      style: { ...DEFAULT_FORM_STYLE },
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      responseCount: 0,
      completionRate: 0,
    };

    const row = formToDb(form, user.id);
    const { error } = await supabase.from('forms').insert(row);
    if (error) {
      console.error('Error creating form:', error);
      return null;
    }

    setForms(prev => [...prev, form]);
    return form;
  }, [user]);

  const deleteForm = useCallback(async (id: string) => {
    // Cancel any pending debounce
    const timer = debounceTimers.current.get(id);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(id);
    pendingUpdates.current.delete(id);

    setForms(prev => prev.filter(f => f.id !== id));
    await supabase.from('forms').delete().eq('id', id);
  }, []);

  const getForm = useCallback((id: string) => {
    return forms.find(f => f.id === id);
  }, [forms]);

  return { forms, createForm, updateForm, deleteForm, getForm, loaded };
}
