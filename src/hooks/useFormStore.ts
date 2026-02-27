import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { FormData, DEFAULT_FORM_STYLE, createDefaultFunnelPage } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import React from 'react';

const DEBOUNCE_MS = 1000;

interface DbForm {
  id: string;
  user_id: string;
  title: string;
  data: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  folder_id?: string | null;
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
    folderId: row.folder_id ?? null,
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

interface FormStoreContextType {
  forms: FormData[];
  loaded: boolean;
  createForm: (folderId?: string | null) => Promise<FormData | null>;
  updateForm: (id: string, patch: Partial<FormData>) => void;
  deleteForm: (id: string) => Promise<void>;
  getForm: (id: string) => FormData | undefined;
  getSaveStatus: (id: string) => 'saved' | 'saving' | 'idle';
  getLastSavedAt: (id: string) => string | null;
  moveFormToFolder: (formId: string, folderId: string | null) => Promise<void>;
}

const FormStoreContext = createContext<FormStoreContextType | null>(null);

export function FormStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [forms, setForms] = useState<FormData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saveStatuses, setSaveStatuses] = useState<Map<string, 'saved' | 'saving' | 'idle'>>(new Map());
  const [lastSavedTimes, setLastSavedTimes] = useState<Map<string, string>>(new Map());
  // Keep a ref to latest forms for debounce callbacks
  const formsRef = useRef<FormData[]>(forms);
  formsRef.current = forms;

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
        .select('id,user_id,title,data,status,created_at,updated_at,folder_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (!cancelled && data) {
        setForms((data as unknown as DbForm[]).map(dbToForm));
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Realtime sync: only current user's forms (avoids cross-tenant noise)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`forms-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'forms',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as unknown as DbForm;
            setForms(prev => {
              const existing = prev.find(f => f.id === row.id);
              if (!existing) return prev;
              if (debounceTimers.current.has(row.id)) return prev;
              return prev.map(f => (f.id === row.id ? dbToForm(row) : f));
            });
          } else if (payload.eventType === 'INSERT') {
            const row = payload.new as unknown as DbForm;
            setForms(prev => {
              if (prev.some(f => f.id === row.id)) return prev;
              return [...prev, dbToForm(row)];
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string };
            if (oldRow.id) {
              setForms(prev => prev.filter(f => f.id !== oldRow.id));
            }
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user]);

  // Flush pending update to DB
  const flushUpdate = useCallback(async (id: string) => {
    if (!user) return;

    const form = formsRef.current.find(f => f.id === id);
    if (!form) return;

    setSaveStatuses(prev => new Map(prev).set(id, 'saving'));

    const row = formToDb(form, user.id);
    const { error } = await supabase
      .from('forms')
      .update({
        title: row.title,
        status: row.status,
        data: row.data,
      })
      .eq('id', id);

    if (error) {
      setSaveStatuses(prev => new Map(prev).set(id, 'idle'));
      return;
    }

    const now = new Date().toISOString();
    setSaveStatuses(prev => new Map(prev).set(id, 'saved'));
    setLastSavedTimes(prev => new Map(prev).set(id, now));
  }, [user]);

  const updateForm = useCallback((id: string, patch: Partial<FormData>) => {
    setForms(prev => {
      const updated = prev.map(f =>
        f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f
      );
      return updated;
    });

    // Debounced DB save
    const existing = debounceTimers.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      flushUpdate(id);
      debounceTimers.current.delete(id);
    }, DEBOUNCE_MS);
    debounceTimers.current.set(id, timer);
  }, [flushUpdate]);

  // Flush pending debounced saves when user leaves/changes tab to avoid losing structural edits
  useEffect(() => {
    const flushAllPending = () => {
      for (const [id, timer] of debounceTimers.current.entries()) {
        clearTimeout(timer);
        debounceTimers.current.delete(id);
        flushUpdate(id);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushAllPending();
    };

    window.addEventListener('pagehide', flushAllPending);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushAllPending);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushAllPending();
    };
  }, [flushUpdate]);

  const createForm = useCallback(async (folderId: string | null = null): Promise<FormData | null> => {
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

    const row = { ...formToDb(form, user.id), folder_id: folderId };
    const { error } = await supabase.from('forms').insert(row);
    if (error) {
      console.error('Error creating form:', error);
      return null;
    }

    const formWithFolder = { ...form, folderId };
    setForms(prev => [...prev, formWithFolder]);
    return formWithFolder;
  }, [user]);

  const deleteForm = useCallback(async (id: string) => {
    const timer = debounceTimers.current.get(id);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(id);

    setForms(prev => prev.filter(f => f.id !== id));
    await supabase.from('forms').delete().eq('id', id);
  }, []);

  const getForm = useCallback((id: string) => {
    return forms.find(f => f.id === id);
  }, [forms]);

  const getSaveStatus = useCallback((id: string): 'saved' | 'saving' | 'idle' => {
    return saveStatuses.get(id) || 'idle';
  }, [saveStatuses]);

  const getLastSavedAt = useCallback((id: string): string | null => {
    return lastSavedTimes.get(id) || null;
  }, [lastSavedTimes]);

  const moveFormToFolder = useCallback(async (formId: string, folderId: string | null) => {
    setForms(prev => prev.map(f => f.id === formId ? { ...f, folderId } : f));
    await supabase.from('forms').update({ folder_id: folderId }).eq('id', formId);
  }, []);

  const value = { forms, loaded, createForm, updateForm, deleteForm, getForm, getSaveStatus, getLastSavedAt, moveFormToFolder };

  return React.createElement(FormStoreContext.Provider, { value }, children);
}

export function useFormStore() {
  const ctx = useContext(FormStoreContext);
  if (!ctx) throw new Error('useFormStore must be used within FormStoreProvider');
  return ctx;
}

/** Safe version that returns null when no provider exists (e.g. public form route) */
export function useFormStoreSafe() {
  return useContext(FormStoreContext);
}
