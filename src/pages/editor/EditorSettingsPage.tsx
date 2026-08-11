import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/editorFormContext';

const FormSettings = lazy(() => import('@/components/editor/FormSettings'));

export default function EditorSettings() {
  const { form, updateFormData } = useEditorForm();
  return <FormSettings form={form} onUpdate={(patch) => updateFormData(patch)} />;
}
