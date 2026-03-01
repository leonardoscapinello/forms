import { useEffect, lazy, Suspense } from 'react';
import { useEditorForm } from '@/hooks/useEditorForm';
import { createDefaultPageElement } from '@/types/pageElements';
import type { PageElement } from '@/types/pageElements';
import type { FunnelPageStyle, FormData } from '@/types/form';
import { Loader2 } from 'lucide-react';

const PageListPanel = lazy(() => import('@/components/editor/PageListPanel'));
const PageBuilder = lazy(() => import('@/components/editor/page-builder/PageBuilder'));

export default function EditorPages() {
  const ctx = useEditorForm();
  const {
    form, editingPageId, setEditingPageId,
    editingWelcome, setEditingWelcome, editingThankYou, setEditingThankYou,
    handleAddPage, handleDeletePage, handleRenamePage, handlePageChange,
    disconnectedPageIds, welcomePage, thankYouPage, editingPage,
    editorIntegrationNodes, editorInputElements, updateFormData,
    handleAddVariable, handleUpdateVariable, handleDeleteVariable,
    lockElement, unlockElement, isLockedByOther,
  } = ctx;

  // Auto-select first page
  useEffect(() => {
    if (!editingPageId && !editingWelcome && !editingThankYou && form?.pages?.length) {
      setEditingPageId(form.pages[0].id);
    }
  }, [editingPageId, editingWelcome, editingThankYou, form?.pages]);

  return (
    <>
      <PageListPanel
        pages={form.pages || []}
        selectedPageId={editingWelcome || editingThankYou ? null : editingPageId}
        onSelectPage={(id) => { setEditingWelcome(false); setEditingThankYou(false); setEditingPageId(id); }}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onRenamePage={handleRenamePage}
        showWelcomeScreen={form.showWelcomeScreen}
        onToggleWelcomeScreen={(enabled) => {
          const patch: Partial<FormData> = { showWelcomeScreen: enabled };
          if (enabled && !form.welcomePage) {
            const heading = createDefaultPageElement('heading');
            heading.content = form.welcomeTitle || form.title || 'Bem-vindo!';
            const text = createDefaultPageElement('text');
            text.content = form.welcomeDescription || 'Clique em começar para iniciar.';
            const btn = createDefaultPageElement('button');
            btn.content = 'Começar';
            btn.buttonAction = 'next';
            patch.welcomePage = { id: 'welcome', title: 'Tela de início', elements: [heading, text, btn], pageStyle: form.globalPageStyle };
          }
          updateFormData(patch);
        }}
        isWelcomeSelected={editingWelcome}
        onSelectWelcome={() => { setEditingWelcome(true); setEditingThankYou(false); setEditingPageId(null); }}
        isThankYouSelected={editingThankYou}
        onSelectThankYou={() => { setEditingThankYou(true); setEditingWelcome(false); setEditingPageId(null); }}
        variables={form.variables || []}
        onAddVariable={handleAddVariable}
        onUpdateVariable={handleUpdateVariable}
        onDeleteVariable={handleDeleteVariable}
        disconnectedPageIds={disconnectedPageIds}
      />
      {editingWelcome ? (
        <PageBuilder
          elements={welcomePage.elements || []}
          onChange={(elements: PageElement[]) => updateFormData({ welcomePage: { ...welcomePage, elements } })}
          pageStyle={form.globalPageStyle}
          onPageStyleChange={(patch: Partial<FunnelPageStyle>) => updateFormData({ globalPageStyle: { ...(form.globalPageStyle || {}), ...patch } })}
          pages={form.pages || []}
          pageId="welcome"
          variables={form.variables || []}
          integrationNodes={editorIntegrationNodes}
          allInputElements={editorInputElements}
          trackedParams={form.trackedParams}
          lockElement={lockElement}
          unlockElement={unlockElement}
          isLockedByOther={isLockedByOther}
          formStyle={form.style}
        />
      ) : editingThankYou ? (
        <PageBuilder
          elements={thankYouPage.elements || []}
          onChange={(elements: PageElement[]) => updateFormData({ thankYouPage: { ...thankYouPage, elements } })}
          pageStyle={form.globalPageStyle}
          onPageStyleChange={(patch: Partial<FunnelPageStyle>) => updateFormData({ globalPageStyle: { ...(form.globalPageStyle || {}), ...patch } })}
          pages={form.pages || []}
          pageId="thank-you"
          variables={form.variables || []}
          integrationNodes={editorIntegrationNodes}
          allInputElements={editorInputElements}
          trackedParams={form.trackedParams}
          lockElement={lockElement}
          unlockElement={unlockElement}
          isLockedByOther={isLockedByOther}
          formStyle={form.style}
        />
      ) : editingPage ? (
        <PageBuilder
          elements={editingPage.elements || []}
          onChange={(elements: PageElement[]) => handlePageChange(editingPage.id, { elements })}
          pageStyle={form.globalPageStyle}
          onPageStyleChange={(patch: Partial<FunnelPageStyle>) => updateFormData({ globalPageStyle: { ...(form.globalPageStyle || {}), ...patch } })}
          pages={form.pages || []}
          pageId={editingPage.id}
          variables={form.variables || []}
          integrationNodes={editorIntegrationNodes}
          allInputElements={editorInputElements}
          trackedParams={form.trackedParams}
          lockElement={lockElement}
          unlockElement={unlockElement}
          isLockedByOther={isLockedByOther}
          formStyle={form.style}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Selecione uma página para editar</p>
        </div>
      )}
    </>
  );
}
