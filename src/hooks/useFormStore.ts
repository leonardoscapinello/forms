import { useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react';
import { FormData, DEFAULT_FORM_STYLE, createDefaultFunnelPage } from '@/types/form';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './authContext';
import { useNetworkStatus } from './useNetworkStatus';
import { toast } from 'sonner';
import React from 'react';
import { FormStoreContext, type FormHomeSummary, type FormSaveStatus } from './formStoreContext';
import { hasSingleIdAck } from '@/lib/databaseAck';
import {
  advanceNewerFormAutosaveRevision,
  hasFormAutosaveAck,
  PerFormSaveQueue,
  persistFormAutosaveEntry,
  readFormAutosaveEntries,
  readFormAutosaveEntry,
  removeAllFormAutosaveEntries,
  removeConfirmedFormAutosaveRevision,
  type AutosaveStorage,
  type FormAutosaveJournalEntry,
} from '@/lib/formAutosaveJournal';

export { useFormStore, useFormStoreSafe } from './formStoreContext';

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

function getPersistentAutosaveStorage(): AutosaveStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createAutosaveRevision(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export function FormStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const online = useNetworkStatus();
  const [forms, setForms] = useState<FormData[]>([]);
  const [homeSummaries, setHomeSummaries] = useState<Record<string, FormHomeSummary>>({});
  const [loaded, setLoaded] = useState(false);
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [saveStatuses, setSaveStatuses] = useState<Map<string, FormSaveStatus>>(new Map());
  const [lastSavedTimes, setLastSavedTimes] = useState<Map<string, string>>(new Map());
  const writerIdRef = useRef(crypto.randomUUID());
  const pendingEntriesRef = useRef<Map<string, FormAutosaveJournalEntry>>(new Map());
  const conflictedFormsRef = useRef<Set<string>>(new Set());
  const serverUpdatedAtRef = useRef<Map<string, string>>(new Map());
  const saveQueueRef = useRef(new PerFormSaveQueue());
  const recoveredUserRef = useRef<string | null>(null);
  // Keep a ref to latest forms for debounce callbacks
  const formsRef = useRef<FormData[]>(forms);
  formsRef.current = forms;
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // Load forms from DB on auth
  useEffect(() => {
    if (!user) {
      for (const timer of debounceTimers.current.values()) clearTimeout(timer);
      debounceTimers.current.clear();
      pendingEntriesRef.current.clear();
      conflictedFormsRef.current.clear();
      serverUpdatedAtRef.current.clear();
      recoveredUserRef.current = null;
      setForms([]);
      setHomeSummaries({});
      setSaveStatuses(new Map());
      setLastSavedTimes(new Map());
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1. Fetch forms first
        const formsRes = await supabase
          .from('forms')
          .select('id,user_id,title,data,status,created_at,updated_at,folder_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (cancelled) return;
        if (formsRes.error) {
          console.error('Error loading forms:', formsRes.error);
          setForms([]);
          setLoaded(true);
          return;
        }

        const formRows = (formsRes.data || []) as unknown as DbForm[];
        const formIds = formRows.map(r => r.id);
        serverUpdatedAtRef.current = new Map(formRows.map((row) => [row.id, row.updated_at]));

        // Render forms immediately (do not block UI on response count queries)
        const parsed = formRows.map(row => ({
          ...dbToForm(row),
          responseCount: 0,
        }));
        setForms(parsed);
        setSaveStatuses(new Map(formRows.map((row) => [row.id, 'saved' as const])));
        setLastSavedTimes(new Map(formRows.map((row) => [row.id, row.updated_at])));
        setLoaded(true);

        // Fetch every lifetime count and seven-day sparkline in one owner-scoped
        // PostgreSQL aggregation. This avoids N+1 requests and browser row caps.
        if (formIds.length > 0) {
          (async () => {
            const { data, error } = await supabase.rpc('get_forms_home_summary', { p_days: 7 });
            if (cancelled) return;
            if (error) {
              toast.error('Não foi possível carregar as métricas da página inicial.');
              return;
            }
            const countMap: Record<string, number> = {};
            const summaries: Record<string, FormHomeSummary> = {};
            for (const row of data || []) {
              const responseCount = Number(row.response_count);
              countMap[row.form_id] = Number.isFinite(responseCount) ? responseCount : 0;
              summaries[row.form_id] = {
                bucketDates: Array.isArray(row.bucket_dates) ? row.bucket_dates : [],
                responses: Array.isArray(row.responses_by_day) ? row.responses_by_day.map(Number) : [],
                dropoffs: Array.isArray(row.dropoffs_by_day) ? row.dropoffs_by_day.map(Number) : [],
              };
            }
            setHomeSummaries(summaries);
            setForms(prev =>
              prev.map(f => ({
                ...f,
                responseCount: countMap[f.id] ?? f.responseCount ?? 0,
              }))
            );
          })().catch(() => {
            toast.error('Não foi possível carregar as métricas da página inicial.');
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Unexpected error loading forms:', error);
        setForms([]);
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
            if (pendingEntriesRef.current.has(row.id)
              || debounceTimers.current.has(row.id)
              || saveQueueRef.current.hasPending(row.id)) {
              return;
            }
            serverUpdatedAtRef.current.set(row.id, row.updated_at);
            conflictedFormsRef.current.delete(row.id);
            setForms(prev => {
              const existing = prev.find(f => f.id === row.id);
              if (!existing) return prev;
              return prev.map(f => (f.id === row.id ? { ...dbToForm(row), responseCount: existing.responseCount } : f));
            });
            setSaveStatuses(prev => new Map(prev).set(row.id, 'saved'));
            setLastSavedTimes(prev => new Map(prev).set(row.id, row.updated_at));
          } else if (payload.eventType === 'INSERT') {
            const row = payload.new as unknown as DbForm;
            serverUpdatedAtRef.current.set(row.id, row.updated_at);
            setForms(prev => {
              if (prev.some(f => f.id === row.id)) return prev;
              return [...prev, dbToForm(row)];
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id?: string };
            if (oldRow.id) {
              pendingEntriesRef.current.delete(oldRow.id);
              conflictedFormsRef.current.delete(oldRow.id);
              serverUpdatedAtRef.current.delete(oldRow.id);
              setForms(prev => prev.filter(f => f.id !== oldRow.id));
              setHomeSummaries(prev => {
                const next = { ...prev };
                delete next[oldRow.id!];
                return next;
              });
            }
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [user]);

  const flushUpdateNow = useCallback(async (id: string) => {
    if (!user) return;

    const storage = getPersistentAutosaveStorage();
    const storedEntry = storage
      ? readFormAutosaveEntry(storage, user.id, id, writerIdRef.current)
      : null;
    let entry = pendingEntriesRef.current.get(id) ?? storedEntry;
    if (storedEntry && (!entry || storedEntry.writtenAt > entry.writtenAt)) {
      entry = storedEntry;
      pendingEntriesRef.current.set(id, storedEntry);
    }
    if (!entry) return;
    if (conflictedFormsRef.current.has(id)) {
      setSaveStatuses(prev => new Map(prev).set(id, 'conflict'));
      return;
    }

    // The complete snapshot was already persisted synchronously by updateForm.
    if (!onlineRef.current) {
      const durable = Boolean(storage && readFormAutosaveEntry(
        storage,
        entry.userId,
        entry.formId,
        entry.writerId,
      )?.revision === entry.revision);
      setSaveStatuses(prev => new Map(prev).set(id, durable ? 'idle' : 'error'));
      return;
    }

    setSaveStatuses(prev => new Map(prev).set(id, 'saving'));

    const { data: savedRow, error } = await supabase
      .from('forms')
      .update({
        title: entry.payload.title,
        status: entry.payload.status,
        data: entry.payload.data as Json,
      })
      .eq('id', id)
      .eq('updated_at', entry.expectedUpdatedAt)
      .select('id,updated_at')
      .maybeSingle();

    if (error) {
      setSaveStatuses(prev => new Map(prev).set(id, 'error'));
      toast.error('O servidor não confirmou o salvamento. A alteração continua preservada neste dispositivo.', {
        id: `form-save-error-${id}`,
        duration: 8000,
      });
      return;
    }

    if (!hasFormAutosaveAck(savedRow, id)) {
      conflictedFormsRef.current.add(id);
      setSaveStatuses(prev => new Map(prev).set(id, 'conflict'));
      toast.error('Conflito de edição: este formulário mudou em outra aba ou sessão. Nada foi sobrescrito e sua versão local continua preservada.', {
        id: `form-save-error-${id}`,
        duration: 10000,
      });
      return;
    }

    const acknowledgedUpdatedAt = savedRow.updated_at;
    const currentMemoryEntry = pendingEntriesRef.current.get(id);
    const persistedBeforeAck = storage
      ? readFormAutosaveEntry(storage, user.id, id, entry.writerId)
      : null;
    let journalHandled = true;
    let advancedPersistedEntry: FormAutosaveJournalEntry | null = null;

    if (storage && persistedBeforeAck?.revision === entry.revision) {
      journalHandled = removeConfirmedFormAutosaveRevision(storage, entry);
    } else if (storage && persistedBeforeAck) {
      advancedPersistedEntry = advanceNewerFormAutosaveRevision(
        storage,
        entry,
        acknowledgedUpdatedAt,
      );
      journalHandled = Boolean(advancedPersistedEntry);
    }

    if (!journalHandled) {
      setSaveStatuses(prev => new Map(prev).set(id, 'error'));
      toast.error('A versão foi salva no servidor, mas o rascunho local não pôde ser atualizado com segurança. Recarregue antes de continuar.', {
        id: `form-save-error-${id}`,
        duration: 10000,
      });
      return;
    }

    serverUpdatedAtRef.current.set(id, acknowledgedUpdatedAt);
    conflictedFormsRef.current.delete(id);
    const nextForms = formsRef.current.map(form => (
      form.id === id ? { ...form, updatedAt: acknowledgedUpdatedAt } : form
    ));
    formsRef.current = nextForms;
    setForms(nextForms);
    setLastSavedTimes(prev => new Map(prev).set(id, acknowledgedUpdatedAt));

    if (currentMemoryEntry?.revision === entry.revision) {
      pendingEntriesRef.current.delete(id);
    } else if (currentMemoryEntry
      && currentMemoryEntry.writerId === entry.writerId
      && currentMemoryEntry.expectedUpdatedAt === entry.expectedUpdatedAt) {
      pendingEntriesRef.current.set(id, advancedPersistedEntry ?? {
        ...currentMemoryEntry,
        expectedUpdatedAt: acknowledgedUpdatedAt,
      });
    }

    const stillPending = pendingEntriesRef.current.has(id);
    setSaveStatuses(prev => new Map(prev).set(id, stillPending ? 'idle' : 'saved'));
    toast.dismiss(`form-save-error-${id}`);
  }, [user]);

  const flushUpdate = useCallback((id: string): Promise<void> => {
    return saveQueueRef.current.enqueue(id, () => flushUpdateNow(id)).catch(() => {
      setSaveStatuses(prev => new Map(prev).set(id, 'error'));
      toast.error('Falha inesperada ao salvar. A alteração continua preservada neste dispositivo.', {
        id: `form-save-error-${id}`,
        duration: 8000,
      });
    });
  }, [flushUpdateNow]);

  // Restore the newest durable snapshot after authentication. A stale base or
  // multiple tab drafts is shown as a conflict and is never replayed blindly.
  useEffect(() => {
    if (!loaded || !user || recoveredUserRef.current === user.id) return;
    recoveredUserRef.current = user.id;
    const storage = getPersistentAutosaveStorage();
    if (!storage) return;

    const nextForms = [...formsRef.current];
    const recoveredIds: string[] = [];
    const conflictIds: string[] = [];

    for (let index = 0; index < nextForms.length; index += 1) {
      const form = nextForms[index];
      const entries = readFormAutosaveEntries(storage, user.id, form.id);
      if (entries.length === 0) continue;

      const entry = entries[0];
      const restored = {
        ...form,
        ...(entry.payload.data as Partial<FormData>),
        id: form.id,
        title: entry.payload.title,
        status: entry.payload.status as FormData['status'],
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
        responseCount: form.responseCount,
      };
      nextForms[index] = restored;
      pendingEntriesRef.current.set(form.id, entry);

      if (entries.length > 1 || entry.expectedUpdatedAt !== serverUpdatedAtRef.current.get(form.id)) {
        conflictedFormsRef.current.add(form.id);
        conflictIds.push(form.id);
      } else {
        recoveredIds.push(form.id);
      }
    }

    if (recoveredIds.length === 0 && conflictIds.length === 0) return;
    formsRef.current = nextForms;
    setForms(nextForms);
    setSaveStatuses(prev => {
      const next = new Map(prev);
      recoveredIds.forEach(id => next.set(id, 'idle'));
      conflictIds.forEach(id => next.set(id, 'conflict'));
      return next;
    });

    if (recoveredIds.length > 0) {
      toast.info('Alterações locais pendentes foram recuperadas com segurança.');
      if (onlineRef.current) recoveredIds.forEach(id => { void flushUpdate(id); });
    }
    if (conflictIds.length > 0) {
      toast.error('Há rascunhos locais de outra versão ou aba. Eles foram preservados e não serão enviados até o conflito ser resolvido.', {
        id: 'form-autosave-recovery-conflict',
        duration: 10000,
      });
    }
  }, [flushUpdate, loaded, user]);

  useEffect(() => {
    if (!online || !user) return;
    toast.dismiss('offline-toast');
    for (const [id, entry] of pendingEntriesRef.current.entries()) {
      if (!conflictedFormsRef.current.has(id)
        && entry.expectedUpdatedAt === serverUpdatedAtRef.current.get(id)) {
        void flushUpdate(id);
      }
    }
  }, [flushUpdate, online, user]);

  const updateForm = useCallback((id: string, patch: Partial<FormData>) => {
    if (!user) return;
    const currentForm = formsRef.current.find(form => form.id === id);
    if (!currentForm) return;

    // Keep updatedAt as the last server-issued concurrency token. A client-side
    // edit must never manufacture a value used in an optimistic DB predicate.
    const updatedForm = { ...currentForm, ...patch, updatedAt: currentForm.updatedAt };
    const row = formToDb(updatedForm, user.id);
    const previousEntry = pendingEntriesRef.current.get(id);
    const now = new Date().toISOString();
    const entry: FormAutosaveJournalEntry = {
      version: 1,
      formId: id,
      userId: user.id,
      writerId: writerIdRef.current,
      revision: createAutosaveRevision(),
      expectedUpdatedAt: previousEntry?.expectedUpdatedAt
        ?? serverUpdatedAtRef.current.get(id)
        ?? currentForm.updatedAt,
      writtenAt: now,
      payload: {
        title: row.title,
        status: row.status,
        data: row.data,
      },
    };

    pendingEntriesRef.current.set(id, entry);
    const storage = getPersistentAutosaveStorage();
    const preserved = Boolean(storage && persistFormAutosaveEntry(storage, entry));

    const nextForms = formsRef.current.map(form => form.id === id ? updatedForm : form);
    formsRef.current = nextForms;
    setForms(nextForms);
    const alreadyConflicted = conflictedFormsRef.current.has(id);
    setSaveStatuses(prev => new Map(prev).set(
      id,
      alreadyConflicted ? 'conflict' : preserved ? 'idle' : 'error',
    ));

    if (alreadyConflicted) {
      toast.error('Esta edição continua preservada, mas não será enviada enquanto houver conflito com outra versão.', {
        id: `form-save-error-${id}`,
        duration: 10000,
      });
      return;
    }

    if (!preserved) {
      toast.error('O navegador não permitiu preservar esta alteração localmente. Tentaremos enviá-la agora; mantenha a página aberta.', {
        id: `form-save-error-${id}`,
        duration: 10000,
      });
      void flushUpdate(id);
      return;
    }

    // Debounced DB save
    const existing = debounceTimers.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      debounceTimers.current.delete(id);
      void flushUpdate(id);
    }, DEBOUNCE_MS);
    debounceTimers.current.set(id, timer);
  }, [flushUpdate, user]);

  // Flush pending debounced saves when user leaves/changes tab to avoid losing structural edits
  useEffect(() => {
    const flushAllPending = () => {
      const pendingIds = new Set<string>(pendingEntriesRef.current.keys());
      for (const [id, timer] of debounceTimers.current.entries()) {
        pendingIds.add(id);
        clearTimeout(timer);
        debounceTimers.current.delete(id);
      }
      pendingIds.forEach(id => { void flushUpdate(id); });
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

    // Generate a unique sequential title
    const prefix = 'Meu formulário';
    const existingNumbers = forms
      .map(f => {
        const match = f.title?.match(/^Meu formulário\s*(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    const nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

    const form: FormData = {
      id: crypto.randomUUID(),
      title: `${prefix} ${nextNum}`,
      questions: [],
      pages: [createDefaultFunnelPage('Página 1')],
      globalPageStyle: {
        backgroundColor: '',
        fontFamily: 'FH Duo Display',
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
    const { data: createdRow, error } = await supabase
      .from('forms')
      .insert(row)
      .select('id,updated_at')
      .maybeSingle();
    if (error || !hasFormAutosaveAck(createdRow, form.id)) {
      console.error('Error creating form:', error);
      toast.error('Não foi possível criar o formulário. Tente novamente.');
      return null;
    }

    const formWithFolder = { ...form, folderId, updatedAt: createdRow.updated_at };
    serverUpdatedAtRef.current.set(form.id, createdRow.updated_at);
    setLastSavedTimes(prev => new Map(prev).set(form.id, createdRow.updated_at));
    setSaveStatuses(prev => new Map(prev).set(form.id, 'saved'));
    const nextForms = [...formsRef.current, formWithFolder];
    formsRef.current = nextForms;
    setForms(nextForms);
    return formWithFolder;
  }, [user, forms]);

  const deleteForm = useCallback(async (id: string) => {
    const timer = debounceTimers.current.get(id);
    if (timer) clearTimeout(timer);
    debounceTimers.current.delete(id);

    const currentForms = formsRef.current;
    const removedIndex = currentForms.findIndex((form) => form.id === id);
    const removedForm = removedIndex >= 0 ? currentForms[removedIndex] : undefined;
    const withoutForm = currentForms.filter(form => form.id !== id);
    formsRef.current = withoutForm;
    setForms(withoutForm);
    const { data: deletedRow, error } = await saveQueueRef.current.enqueue(id, async () => {
      let query = supabase.from('forms').delete().eq('id', id);
      const expectedUpdatedAt = serverUpdatedAtRef.current.get(id);
      if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
      return query.select('id').maybeSingle();
    }).catch(cause => ({ data: null, error: cause }));
    if (error || !hasSingleIdAck(deletedRow, id)) {
      if (removedForm) {
        setForms((previous) => {
          if (previous.some((form) => form.id === id)) return previous;
          const restored = [...previous];
          restored.splice(Math.min(removedIndex, restored.length), 0, removedForm);
          formsRef.current = restored;
          return restored;
        });
      }
      toast.error('Não foi possível excluir o formulário porque ele mudou ou o servidor não confirmou a operação. Ele foi restaurado na lista.');
      return;
    }
    pendingEntriesRef.current.delete(id);
    conflictedFormsRef.current.delete(id);
    serverUpdatedAtRef.current.delete(id);
    const storage = getPersistentAutosaveStorage();
    if (storage && user) removeAllFormAutosaveEntries(storage, user.id, id);
    setSaveStatuses(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setLastSavedTimes(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setHomeSummaries(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast.success('Formulário excluído.');
  }, [user]);

  const getForm = useCallback((id: string) => {
    return forms.find(f => f.id === id);
  }, [forms]);

  const getSaveStatus = useCallback((id: string): FormSaveStatus => {
    return saveStatuses.get(id) || 'idle';
  }, [saveStatuses]);

  const getLastSavedAt = useCallback((id: string): string | null => {
    return lastSavedTimes.get(id) || null;
  }, [lastSavedTimes]);

  const moveFormToFolder = useCallback(async (formId: string, folderId: string | null) => {
    const timer = debounceTimers.current.get(formId);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.current.delete(formId);
    }
    if (pendingEntriesRef.current.has(formId)) await flushUpdate(formId);
    if (pendingEntriesRef.current.has(formId)) {
      toast.error('Resolva o salvamento pendente antes de mover este formulário. A pasta não foi alterada.');
      return;
    }

    const currentForm = formsRef.current.find(form => form.id === formId);
    if (!currentForm) return;
    const previousFolderId = currentForm.folderId ?? null;
    const expectedUpdatedAt = serverUpdatedAtRef.current.get(formId) ?? currentForm.updatedAt;
    const movedLocally = formsRef.current.map(form => (
      form.id === formId ? { ...form, folderId } : form
    ));
    formsRef.current = movedLocally;
    setForms(movedLocally);

    const { data: movedRow, error } = await saveQueueRef.current.enqueue(formId, async () => {
      return await supabase
        .from('forms')
        .update({ folder_id: folderId })
        .eq('id', formId)
        .eq('updated_at', expectedUpdatedAt)
        .select('id,updated_at')
        .maybeSingle();
    }).catch(cause => ({ data: null, error: cause }));
    if (error || !hasFormAutosaveAck(movedRow, formId)) {
      const restored = formsRef.current.map(form => (
        form.id === formId ? { ...form, folderId: previousFolderId } : form
      ));
      formsRef.current = restored;
      setForms(restored);
      toast.error('Não foi possível mover o formulário porque ele mudou ou o servidor não confirmou a operação. A pasta anterior foi restaurada.');
      return;
    }

    serverUpdatedAtRef.current.set(formId, movedRow.updated_at);
    setLastSavedTimes(prev => new Map(prev).set(formId, movedRow.updated_at));
    setSaveStatuses(prev => new Map(prev).set(formId, 'saved'));
    const acknowledged = formsRef.current.map(form => (
      form.id === formId ? { ...form, updatedAt: movedRow.updated_at } : form
    ));
    formsRef.current = acknowledged;
    setForms(acknowledged);
  }, [flushUpdate]);

  const value = useMemo(() => ({
    forms, homeSummaries, loaded, createForm, updateForm, deleteForm, getForm, getSaveStatus, getLastSavedAt, moveFormToFolder,
  }), [forms, homeSummaries, loaded, createForm, updateForm, deleteForm, getForm, getSaveStatus, getLastSavedAt, moveFormToFolder]);

  return React.createElement(FormStoreContext.Provider, { value }, children);
}
