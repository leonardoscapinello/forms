import { useEffect, useCallback } from 'react';
import { useEditorForm } from '@/hooks/editorFormContext';
import { createDefaultPageElement } from '@/types/pageElements';
import type { PageElement } from '@/types/pageElements';
import type { FunnelPageStyle, FormData } from '@/types/form';
import PageListPanel from '@/components/editor/PageListPanel';
import PageBuilder from '@/components/editor/page-builder/PageBuilder';
import { scanElementReferences, autoFixReferencesOnMove } from '@/lib/elementReferenceScanner';
import { validateFormIntegrity } from '@/lib/formIntegrityValidator';
import { toast } from 'sonner';
import CompletionRedirectControls from '@/components/editor/CompletionRedirectControls';

/* v3 cache-bust */ export default function EditorPages() {
  const ctx = useEditorForm();
  const {
    form, editingPageId, setEditingPageId,
    editingWelcome, setEditingWelcome, editingThankYou, setEditingThankYou,
    handleAddPage, handleDeletePage, handleRenamePage, handlePageChange,
    disconnectedPageIds, flowOrderedPages, welcomePage, thankYouPage, editingPage,
    editorIntegrationNodes, editorInputElements, updateFormData,
    handleAddVariable, handleUpdateVariable, handleDeleteVariable,
    lockElement, unlockElement, isLockedByOther,
  } = ctx;

  // Auto-select first page
  useEffect(() => {
    if (!editingPageId && !editingWelcome && !editingThankYou && flowOrderedPages.length) {
      setEditingPageId(flowOrderedPages[0].id);
    }
  }, [editingPageId, editingWelcome, editingThankYou, flowOrderedPages, setEditingPageId]);

  // Move element from the current page to another page (single atomic update)
  const handleMoveElementToPage = useCallback((element: PageElement, targetPageId: string) => {
    const sourcePageId = editingWelcome ? 'welcome' : editingThankYou ? 'thank-you' : editingPageId;
    if (!sourcePageId || sourcePageId === targetPageId) return;

    // Scan for references to understand impact
    const refs = scanElementReferences(form, element.id);
    const autoFixPatch = autoFixReferencesOnMove(form, element.id, targetPageId);

    const patch: Partial<FormData> = {};

    // Handle welcome/thank-you as source or target specially
    const isSourceWelcome = sourcePageId === 'welcome';
    const isSourceThankYou = sourcePageId === 'thank-you';
    const isTargetWelcome = targetPageId === 'welcome';
    const isTargetThankYou = targetPageId === 'thank-you';

    if (isSourceWelcome && welcomePage) {
      patch.welcomePage = { ...welcomePage, elements: (welcomePage.elements || []).filter(e => e.id !== element.id) };
    } else if (isSourceThankYou && thankYouPage) {
      patch.thankYouPage = { ...thankYouPage, elements: (thankYouPage.elements || []).filter(e => e.id !== element.id) };
    }

    if (isTargetWelcome && welcomePage) {
      const base = patch.welcomePage || welcomePage;
      patch.welcomePage = { ...base, elements: [...(base.elements || []), element] };
    } else if (isTargetThankYou && thankYouPage) {
      const base = patch.thankYouPage || thankYouPage;
      patch.thankYouPage = { ...base, elements: [...(base.elements || []), element] };
    }

    // For regular pages, update pages array in one shot
    if (!isSourceWelcome && !isSourceThankYou || !isTargetWelcome && !isTargetThankYou) {
      const updatedPages = (form.pages || []).map(p => {
        if (p.id === sourcePageId && !isSourceWelcome && !isSourceThankYou) {
          return { ...p, elements: (p.elements || []).filter(e => e.id !== element.id) };
        }
        if (p.id === targetPageId && !isTargetWelcome && !isTargetThankYou) {
          return { ...p, elements: [...(p.elements || []), element] };
        }
        return p;
      });
      patch.pages = updatedPages;
    }

    // Merge auto-fix patch (e.g. variable sourcePageId updates)
    if (autoFixPatch.variables) {
      patch.variables = autoFixPatch.variables;
    }

    updateFormData(patch);

    // Show impact feedback
    const autoFixed = refs.filter(r => r.autoFixable);
    const warnings = refs.filter(r => !r.autoFixable);

    if (autoFixed.length > 0) {
      toast.info(
        `${autoFixed.length} referência${autoFixed.length > 1 ? 's' : ''} atualizada${autoFixed.length > 1 ? 's' : ''} automaticamente`,
        { description: autoFixed.map(r => r.label).join('\n'), duration: 5000 }
      );
    }

    if (warnings.length > 0) {
      toast.warning(
        `⚠️ ${warnings.length} referência${warnings.length > 1 ? 's' : ''} pode${warnings.length > 1 ? 'm' : ''} ser afetada${warnings.length > 1 ? 's' : ''}`,
        {
          description: warnings.map(r => `• ${r.label}`).join('\n'),
          duration: 8000,
        }
      );
    }

    // Check ordering integrity AFTER the move (simulate the patched form)
    const patchedForm = { ...form, ...patch };
    const integrityIssues = validateFormIntegrity(patchedForm);
    const elementRelatedIssues = integrityIssues.filter(i => i.elementId === element.id || i.elementId.startsWith(`${element.id}.`));

    if (elementRelatedIssues.length > 0) {
      toast.error(
        `🚫 ${elementRelatedIssues.length} problema${elementRelatedIssues.length > 1 ? 's' : ''} de ordenação — publicação bloqueada`,
        {
          description: elementRelatedIssues.map(i => `• ${i.nodeLabel}: ${i.description}`).join('\n'),
          duration: 10000,
        }
      );
    }
  }, [editingWelcome, editingThankYou, editingPageId, welcomePage, thankYouPage, form, updateFormData]);

  return (
    <>
      <PageListPanel
        pages={flowOrderedPages}
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
        onMoveElementToPage={handleMoveElementToPage}
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
          onMoveElementToPage={handleMoveElementToPage}
        />
      ) : editingThankYou ? (
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border bg-card px-4 py-3">
            <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-3">
              <CompletionRedirectControls
                action={form.completionAction}
                redirectUrl={form.completionRedirectUrl}
                onChange={updateFormData}
                variables={form.variables || []}
                integrationNodes={editorIntegrationNodes}
                allInputElements={editorInputElements}
                trackedParams={form.trackedParams}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1">
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
              onMoveElementToPage={handleMoveElementToPage}
            />
          </div>
        </div>
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
          onMoveElementToPage={handleMoveElementToPage}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Selecione uma página para editar</p>
        </div>
      )}
    </>
  );
}
