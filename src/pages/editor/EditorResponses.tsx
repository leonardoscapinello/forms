import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/editorFormContext';

const FormResponses = lazy(() => import('@/components/editor/FormResponses'));

export default function EditorResponses() {
  const { form } = useEditorForm();
  return <FormResponses form={form} />;
}
