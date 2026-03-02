import { lazy, Suspense, useEffect } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PageElement } from '@/types/pageElements';
import type { FunnelPageStyle } from '@/types/form';

const FormDesignSettings = lazy(() => import('@/components/editor/FormDesignSettings'));
const PageBuilder = lazy(() => import('@/components/editor/page-builder/PageBuilder'));

export default function EditorDesign() {
  const {
    form, updateFormData,
    editingPageId, setEditingPageId,
    editingWelcome, setEditingWelcome,
    editingThankYou, setEditingThankYou,
    handlePageChange,
    welcomePage, thankYouPage, editingPage,
    editorIntegrationNodes, editorInputElements,
    lockElement, unlockElement, isLockedByOther,
  } = useEditorForm();

  // Auto-select first page for preview
  useEffect(() => {
    if (!editingPageId && !editingWelcome && !editingThankYou && form?.pages?.length) {
      setEditingPageId(form.pages[0].id);
    }
  }, [editingPageId, editingWelcome, editingThankYou, form?.pages]);

  const currentPage = editingWelcome ? welcomePage : editingThankYou ? thankYouPage : editingPage;
  const currentPageId = editingWelcome ? 'welcome' : editingThankYou ? 'thank-you' : editingPage?.id;

  const handleElementsChange = (elements: PageElement[]) => {
    if (editingWelcome) {
      updateFormData({ welcomePage: { ...welcomePage, elements } });
    } else if (editingThankYou) {
      updateFormData({ thankYouPage: { ...thankYouPage, elements } });
    } else if (editingPage) {
      handlePageChange(editingPage.id, { elements });
    }
  };

  return (
    <>
      {/* Sidebar com configurações de design */}
      <div className="w-[320px] shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Design</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Configurações visuais do formulário</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4">
            <Suspense fallback={null}>
              <FormDesignSettings form={form} onUpdate={(patch) => updateFormData(patch)} />
            </Suspense>
          </div>
        </ScrollArea>
      </div>

      {/* Canvas com preview ao vivo */}
      {currentPage ? (
        <Suspense fallback={null}>
          <PageBuilder
            elements={currentPage.elements || []}
            onChange={handleElementsChange}
            pageStyle={form.globalPageStyle}
            onPageStyleChange={(patch: Partial<FunnelPageStyle>) => updateFormData({ globalPageStyle: { ...(form.globalPageStyle || {}), ...patch } })}
            pages={form.pages || []}
            pageId={currentPageId || ''}
            variables={form.variables || []}
            integrationNodes={editorIntegrationNodes}
            allInputElements={editorInputElements}
            trackedParams={form.trackedParams}
            lockElement={lockElement}
            unlockElement={unlockElement}
            isLockedByOther={isLockedByOther}
            formStyle={form.style}
            hideToolbar
            readOnly
          />
        </Suspense>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Nenhuma página disponível para preview</p>
        </div>
      )}
    </>
  );
}
