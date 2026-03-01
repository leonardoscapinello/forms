import { lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';
import { Loader2 } from 'lucide-react';

const FlowCanvas = lazy(() => import('@/components/editor/FlowCanvas'));

export default function EditorWorkflow() {
  const ctx = useEditorForm();

  return (
    <div className="flex-1 overflow-hidden">
      <FlowCanvas
        form={ctx.form}
        onPageChange={ctx.handlePageChange}
        onPageDelete={ctx.handleDeletePage}
        onPageAddAtPosition={ctx.handlePageAddAtPosition}
        onConditionAddAtPosition={ctx.handleConditionAddAtPosition}
        onConditionChange={ctx.handleConditionChange}
        onConditionDelete={ctx.handleConditionDelete}
        onVariableOpAddAtPosition={ctx.handleVariableOpAddAtPosition}
        onVariableOpChange={ctx.handleVariableOpChange}
        onVariableOpDelete={ctx.handleVariableOpDelete}
        onIntegrationAddAtPosition={ctx.handleIntegrationAddAtPosition}
        onIntegrationChange={ctx.handleIntegrationChange}
        onIntegrationDelete={ctx.handleIntegrationDelete}
        onAnalyticsAddAtPosition={ctx.handleAnalyticsAddAtPosition}
        onAnalyticsChange={ctx.handleAnalyticsChange}
        onAnalyticsDelete={ctx.handleAnalyticsDelete}
        onWhatsAppAddAtPosition={ctx.handleWhatsAppAddAtPosition}
        onWhatsAppChange={ctx.handleWhatsAppChange}
        onWhatsAppDelete={ctx.handleWhatsAppDelete}
        onEmailAddAtPosition={ctx.handleEmailAddAtPosition}
        onEmailChange={ctx.handleEmailChange}
        onEmailDelete={ctx.handleEmailDelete}
        onABTestAddAtPosition={ctx.handleABTestAddAtPosition}
        onABTestChange={ctx.handleABTestChange}
        onABTestDelete={ctx.handleABTestDelete}
        onWaitAddAtPosition={ctx.handleWaitAddAtPosition}
        onWaitChange={ctx.handleWaitChange}
        onWaitDelete={ctx.handleWaitDelete}
        onJumpAddAtPosition={ctx.handleJumpAddAtPosition}
        onJumpChange={ctx.handleJumpChange}
        onJumpDelete={ctx.handleJumpDelete}
        onFormUpdate={ctx.updateFormData}
        onPageSelect={ctx.handlePageSelectFromWorkflow}
        onCreateVariable={(newVar) => {
          ctx.updateFormData({ variables: [...(ctx.form.variables || []), newVar] });
        }}
      />
    </div>
  );
}
