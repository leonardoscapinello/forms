import { createContext, useContext } from 'react';
import type { FormData } from '@/types/form';

export type FormSaveStatus = 'saved' | 'saving' | 'idle' | 'error' | 'conflict';

export interface FormHomeSummary {
  bucketDates: string[];
  responses: number[];
  dropoffs: number[];
}

export interface FormStoreContextValue {
  forms: FormData[];
  homeSummaries: Record<string, FormHomeSummary>;
  loaded: boolean;
  createForm: (folderId?: string | null) => Promise<FormData | null>;
  updateForm: (id: string, patch: Partial<FormData>) => void;
  deleteForm: (id: string) => Promise<void>;
  getForm: (id: string) => FormData | undefined;
  getSaveStatus: (id: string) => FormSaveStatus;
  getLastSavedAt: (id: string) => string | null;
  moveFormToFolder: (formId: string, folderId: string | null) => Promise<void>;
}

export const FormStoreContext = createContext<FormStoreContextValue | null>(null);

export function useFormStore() {
  const context = useContext(FormStoreContext);
  if (!context) throw new Error('useFormStore must be used within FormStoreProvider');
  return context;
}

/** Returns null on the standalone public route, where no admin store exists. */
export function useFormStoreSafe() {
  return useContext(FormStoreContext);
}
