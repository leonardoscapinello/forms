import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';

const FormShare = lazy(() => import('@/components/editor/FormShare'));

export default function EditorShare() {
  const { form, updateFormData } = useEditorForm();
  return <FormShare form={form} onUpdate={patch => updateFormData(patch)} />;
}
