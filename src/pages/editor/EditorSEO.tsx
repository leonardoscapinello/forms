import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';

const FormSEOSettings = lazy(() => import('@/components/editor/FormSEOSettings'));

export default function EditorSEO() {
  const { form, updateFormData } = useEditorForm();
  return <FormSEOSettings form={form} onUpdate={(patch) => updateFormData(patch)} />;
}
