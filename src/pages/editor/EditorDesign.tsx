import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';

const FormDesignSettings = lazy(() => import('@/components/editor/FormDesignSettings'));

export default function EditorDesign() {
  const { form, updateFormData } = useEditorForm();
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-6">
        <FormDesignSettings form={form} onUpdate={(patch) => updateFormData(patch)} />
      </div>
    </div>
  );
}
