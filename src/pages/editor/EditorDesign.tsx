import { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditorForm } from '@/hooks/useEditorForm';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { PageElement } from '@/types/pageElements';
import type { FunnelPageStyle } from '@/types/form';
import ElementDesignStyleEditor from '@/components/editor/ElementDesignStyleEditor';

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

  const [designSelectedId, setDesignSelectedId] = useState<string | null>(null);

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

  // Find selected element across elements and columns
  const findElement = useCallback((id: string | null): PageElement | null => {
    if (!id || !currentPage?.elements) return null;
    for (const el of currentPage.elements) {
      if (el.id === id) return el;
      if (el.type === 'columns' && el.columnData) {
        for (const col of el.columnData) {
          const found = col.elements.find(e => e.id === id);
          if (found) return found;
        }
      }
    }
    return null;
  }, [currentPage?.elements]);

  const designSelectedElement = findElement(designSelectedId);

  const handleDesignElementChange = useCallback((id: string, patch: Partial<PageElement>) => {
    if (!currentPage?.elements) return;
    // Check top-level
    if (currentPage.elements.some(e => e.id === id)) {
      const updated = currentPage.elements.map(e => e.id === id ? { ...e, ...patch } : e);
      handleElementsChange(updated);
      return;
    }
    // Search inside columns
    const updated = currentPage.elements.map(el => {
      if (el.type === 'columns' && el.columnData) {
        const hasIt = el.columnData.some(col => col.elements.some(e => e.id === id));
        if (hasIt) {
          return {
            ...el,
            columnData: el.columnData.map(col => ({
              ...col,
              elements: col.elements.map(e => e.id === id ? { ...e, ...patch } : e),
            })),
          };
        }
      }
      return el;
    });
    handleElementsChange(updated);
  }, [currentPage?.elements, handleElementsChange]);

  return (
    <>
      {/* Sidebar com configurações de design */}
      <div className="w-[320px] shrink-0 border-r border-border bg-card flex flex-col min-h-0 h-full">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Design</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {designSelectedElement
              ? 'Clique fora para voltar ao estilo global'
              : 'Clique em um elemento para estilizá-lo'}
          </p>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            <AnimatePresence mode="wait">
              {designSelectedElement ? (
                <motion.div
                  key={`element-${designSelectedElement.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <ElementDesignStyleEditor
                    element={designSelectedElement}
                    onChange={(patch) => handleDesignElementChange(designSelectedElement.id, patch)}
                    onDeselect={() => setDesignSelectedId(null)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="global-design"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Suspense fallback={null}>
                    <FormDesignSettings form={form} onUpdate={(patch) => updateFormData(patch)} />
                  </Suspense>
                </motion.div>
              )}
            </AnimatePresence>
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
            designMode
            designSelectedId={designSelectedId}
            onDesignSelect={setDesignSelectedId}
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
