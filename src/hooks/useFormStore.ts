import { useState, useCallback } from 'react';
import { FormData, Question, DEFAULT_FORM_STYLE } from '@/types/form';

const STORAGE_KEY = 'formflow_forms';

function loadForms(): FormData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveForms(forms: FormData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}

export function useFormStore() {
  const [forms, setForms] = useState<FormData[]>(loadForms);

  const persist = useCallback((updated: FormData[]) => {
    setForms(updated);
    saveForms(updated);
  }, []);

  const createForm = useCallback((): FormData => {
    const now = new Date().toISOString();
    const form: FormData = {
      id: crypto.randomUUID(),
      title: 'Formulário sem título',
      questions: [],
      style: { ...DEFAULT_FORM_STYLE },
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      responseCount: 0,
      completionRate: 0,
    };
    setForms(prev => {
      const updated = [...prev, form];
      saveForms(updated);
      return updated;
    });
    return form;
  }, []);

  const updateForm = useCallback((id: string, patch: Partial<FormData>) => {
    setForms(prev => {
      const updated = prev.map(f =>
        f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f
      );
      saveForms(updated);
      return updated;
    });
  }, []);

  const deleteForm = useCallback((id: string) => {
    setForms(prev => {
      const updated = prev.filter(f => f.id !== id);
      saveForms(updated);
      return updated;
    });
  }, []);

  const getForm = useCallback((id: string) => {
    return forms.find(f => f.id === id);
  }, [forms]);

  return { forms, createForm, updateForm, deleteForm, getForm };
}
