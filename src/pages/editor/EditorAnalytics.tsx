import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';

const FormAnalytics = lazy(() => import('@/components/editor/FormAnalytics'));

export default function EditorAnalytics() {
  const { form, updateFormData } = useEditorForm();
  return <FormAnalytics form={form} onUpdate={(patch) => updateFormData(patch)} />;
}
