import { createContext, useContext } from 'react';
import type { EditorFormContextType } from './useEditorForm';

export const EditorFormContext = createContext<EditorFormContextType | null>(null);

export function useEditorForm() {
  const context = useContext(EditorFormContext);
  if (!context) throw new Error('useEditorForm must be used within EditorFormProvider');
  return context;
}
