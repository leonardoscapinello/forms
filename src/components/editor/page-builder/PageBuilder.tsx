// PageBuilder – drag-and-drop page editor
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { normalizeFontFamily } from '@/lib/fontUtils';
import { FunnelPage, FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import { CollaboratorPresence } from '@/hooks/useRealtimeCollaboration';
import type { ElementLookup } from '@/components/editor/shared/VariableHighlightOverlay';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  pointerWithin,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  DragOverlay,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { PageElement, createDefaultPageElement, PageElementType } from '@/types/pageElements';
import { FunnelPageStyle } from '@/types/form';
import SortableElement from './SortableElement';
import ElementToolbar from './ElementToolbar';
import ElementSettingsPanel from './ElementSettingsPanel';
import PageGeneralSettings from './PageGeneralSettings';
import ElementPreview from './ElementPreview';
import { LayoutTemplate, Plus, Trash2, ArrowUp, ArrowDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  elements: PageElement[];
  onChange: (elements: PageElement[]) => void;
  pageStyle?: FunnelPageStyle;
  onPageStyleChange?: (patch: Partial<FunnelPageStyle>) => void;
  pages?: FunnelPage[];
  pageId?: string;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: import('../VariableAssignPanel').InputElementGroup[];
  trackedParams?: TrackedParam[];
  lockElement?: (elementId: string) => void;
  unlockElement?: () => void;
  isLockedByOther?: (elementId: string) => CollaboratorPresence | null;
  formStyle?: import('@/types/form').FormStyle;
  hideToolbar?: boolean;
  /** Read-only mode: no selection, no drag, no settings panel */
  readOnly?: boolean;
  /** Design mode: allows clicking to select for styling (no editing, no drag) */
  designMode?: boolean;
  designSelectedId?: string | null;
  onDesignSelect?: (id: string | null) => void;
  onMoveElementToPage?: (element: PageElement, targetPageId: string) => void;
}

export default function PageBuilder({ elements, onChange, pageStyle, onPageStyleChange, pages, pageId, variables, integrationNodes, allInputElements, trackedParams, lockElement, unlockElement, isLockedByOther, formStyle, hideToolbar, readOnly, designMode, designSelectedId, onDesignSelect, onMoveElementToPage }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number>(-1);
  const dragCounterRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastColumnOverRef = useRef<string | null>(null);
  const externalPageDropTargetRef = useRef<string | null>(null);

  // Build elementId → friendly label lookup from all known input elements + page scan fallback
  const elementLookup = useMemo<ElementLookup>(() => {
    const lookup: ElementLookup = {};

    for (const group of allInputElements || []) {
      for (const el of group.elements || []) {
        if (el.elementId && el.elementLabel) lookup[el.elementId] = el.elementLabel;
      }
    }

    const scanElements = (items: PageElement[] = []) => {
      for (const el of items) {
        if (el.label) lookup[el.id] = el.label;
        else if (el.type.startsWith('input_')) lookup[el.id] = el.type.replace('input_', '').replace(/_/g, ' ');

        if (el.type === 'columns' && el.columnData) {
          for (const col of el.columnData) {
            scanElements(col.elements || []);
          }
        }
      }
    };

    for (const page of pages || []) {
      scanElements(page.elements || []);
    }
    scanElements(elements || []);

    return lookup;
  }, [allInputElements, pages, elements]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!activeId) {
      externalPageDropTargetRef.current = null;
      window.dispatchEvent(new CustomEvent('element-drag-over-page', { detail: { pageId: null } }));
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const pageTarget = el?.closest('[data-page-drop-id]') as HTMLElement | null;
      const targetId = pageTarget?.dataset.pageDropId || null;
      externalPageDropTargetRef.current = targetId;
      window.dispatchEvent(new CustomEvent('element-drag-over-page', { detail: { pageId: targetId } }));
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.dispatchEvent(new CustomEvent('element-drag-over-page', { detail: { pageId: null } }));
    };
  }, [activeId]);

  // Custom collision: prioritize column droppables, fall back to sortable reorder
  const customCollision: CollisionDetection = useCallback((args) => {
    // Filter droppable containers to only column ones, then use pointerWithin
    const columnContainers = args.droppableContainers.filter(c => String(c.id).startsWith('col-drop:'));
    if (columnContainers.length > 0) {
      const columnArgs = { ...args, droppableContainers: columnContainers };
      const hits = pointerWithin(columnArgs);
      if (hits.length > 0) return [hits[0]];
    }
    // Otherwise use closestCenter for sortable reorder  
    return closestCenter(args);
  }, []);

  // Find selected element — search top-level and inside columns
  const findElementById = useCallback((id: string | null): PageElement | null => {
    if (!id) return null;
    const topLevel = elements.find(e => e.id === id);
    if (topLevel) return topLevel;
    for (const el of elements) {
      if (el.type === 'columns' && el.columnData) {
        for (const col of el.columnData) {
          const found = col.elements.find(e => e.id === id);
          if (found) return found;
        }
      }
    }
    return null;
  }, [elements]);

  const selectedElement = findElementById(selectedId);
  const activeElement = elements.find(e => e.id === activeId) || null;

  // Filter allInputElements to only show fields BEFORE the selected element
  const filteredInputElements = useMemo(() => {
    if (!selectedId || !allInputElements || !pageId) return allInputElements || [];
    const pageIdx = allInputElements.findIndex(g => g.pageId === pageId);
    if (pageIdx === -1) return allInputElements;

    // Find the selected element's position within the current page's elements list
    const currentPageGroup = allInputElements[pageIdx];
    // Get the base element ID (strip sub-key like ".street")
    const baseSelectedId = selectedId.includes('.') ? selectedId : selectedId;
    const elIdx = currentPageGroup.elements.findIndex(
      el => el.elementId === baseSelectedId || el.elementId.startsWith(baseSelectedId + '.')
    );

    return allInputElements.map((group, gIdx) => {
      if (gIdx < pageIdx) return group; // previous pages: show all
      if (gIdx > pageIdx) return { ...group, elements: [] }; // later pages: show none
      // Current page: only elements before the selected one
      if (elIdx <= 0) return { ...group, elements: [] };
      return { ...group, elements: group.elements.filter((el) => {
        const thisElIdx = currentPageGroup.elements.indexOf(el);
        return thisElIdx < elIdx;
      })};
    }).filter(g => g.elements.length > 0);
  }, [selectedId, allInputElements, pageId]);

  

  const effectiveStyle: FunnelPageStyle = {
    backgroundColor: '',
    fontFamily: 'Borna',
    gap: 32,
    paddingX: 24,
    paddingY: 32,
    ...pageStyle,
  };

  // --- dnd-kit handlers (reorder existing) ---
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    lastColumnOverRef.current = null;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    if (overId?.startsWith('col-drop:')) {
      lastColumnOverRef.current = overId;
    } else {
      lastColumnOverRef.current = null;
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    const draggedElement = elements.find(e => e.id === active.id);

    // External drop target (page row in left sidebar) — works with dnd-kit drag
    const externalTargetPageId = externalPageDropTargetRef.current;
    externalPageDropTargetRef.current = null;
    if (draggedElement && externalTargetPageId && onMoveElementToPage && pageId && externalTargetPageId !== pageId) {
      const targetPage = pages?.find(p => p.id === externalTargetPageId);
      const targetName = externalTargetPageId === 'welcome' ? 'Tela de início'
        : externalTargetPageId === 'thank-you' ? 'Tela de obrigado'
        : targetPage?.title || 'Sem título';
      onMoveElementToPage(draggedElement, externalTargetPageId);
      if (selectedId === active.id) setSelectedId(null);
      // Show toast feedback
      import('sonner').then(({ toast }) => toast.success(`Elemento movido para "${targetName}"`));
      return;
    }

    if (!over && !lastColumnOverRef.current) return;

    // Determine the actual drop target — prefer lastColumnOverRef for column drops
    // since collision detection can be unreliable during layout shifts
    const overId = over ? String(over.id) : '';
    const columnDropId = overId.startsWith('col-drop:') ? overId : lastColumnOverRef.current;
    lastColumnOverRef.current = null;

    // Check if dropped on a column droppable (id format: col-drop:{columnsElementId}:{colIdx})
    if (columnDropId) {
      const parts = columnDropId.split(':');
      const columnsElementId = parts[1];
      const colIdx = parseInt(parts[2]);

      if (draggedElement && draggedElement.type !== 'columns') {
        // Remove from main list and add to column
        const remaining = elements.filter(e => e.id !== active.id);
        const updated = remaining.map(item => {
          if (item.id === columnsElementId && item.columnData) {
            return {
              ...item,
              columnData: item.columnData.map((col, i) =>
                i === colIdx ? { ...col, elements: [...col.elements, draggedElement] } : col
              ),
            };
          }
          return item;
        });
        onChange(updated);
        if (selectedId === active.id) setSelectedId(null);
        return;
      }
    }

    // Normal reorder
    if (over && active.id !== over.id) {
      const oldIndex = elements.findIndex(e => e.id === active.id);
      const newIndex = elements.findIndex(e => e.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(elements, oldIndex, newIndex));
      }
    }
  }, [elements, onChange, selectedId, onMoveElementToPage, pageId]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    externalPageDropTargetRef.current = null;
  }, []);

  // Move element from a column back to the main canvas
  const handleMoveToMain = useCallback((el: PageElement, sourceColumnsId: string, colIdx: number) => {
    // Find the columns element position to insert after it
    const columnsIdx = elements.findIndex(e => e.id === sourceColumnsId);
    const insertAt = columnsIdx !== -1 ? columnsIdx + 1 : elements.length;

    // Remove from column and insert into main list
    const updated = elements.map(item => {
      if (item.id === sourceColumnsId && item.columnData) {
        return {
          ...item,
          columnData: item.columnData.map((col, i) =>
            i === colIdx ? { ...col, elements: col.elements.filter(e => e.id !== el.id) } : col
          ),
        };
      }
      return item;
    });
    updated.splice(insertAt, 0, el);
    onChange(updated);
    setSelectedId(el.id);
  }, [elements, onChange]);

  const handleAdd = useCallback((element: PageElement) => {
    onChange([...elements, element]);
    setSelectedId(element.id);
  }, [elements, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(elements.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [elements, onChange, selectedId]);

  const handleElementChange = useCallback((id: string, patch: Partial<PageElement>) => {
    // Check if top-level
    if (elements.some(e => e.id === id)) {
      onChange(elements.map(e => e.id === id ? { ...e, ...patch } : e));
      return;
    }
    // Search inside columns
    onChange(elements.map(el => {
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
    }));
  }, [elements, onChange]);

  // --- Native drag handlers (toolbar → canvas with positional insert) ---

  const computeDropIndex = useCallback((clientY: number) => {
    if (!listRef.current) return elements.length;
    // Get all sortable element wrappers
    const children = listRef.current.querySelectorAll('[data-sortable-id]');
    if (children.length === 0) return 0;

    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return children.length;
  }, [elements.length]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (isExternalDragOver) {
      setDropIndex(computeDropIndex(e.clientY));
    }
  }, [isExternalDragOver, computeDropIndex]);

  const handleCanvasDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsExternalDragOver(true);
    }
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsExternalDragOver(false);
      setDropIndex(-1);
    }
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsExternalDragOver(false);
    const insertAt = dropIndex >= 0 ? dropIndex : elements.length;
    setDropIndex(-1);

    // Check for element move from column → main canvas
    const moveJson = e.dataTransfer.getData('element-move-json');
    const moveSource = e.dataTransfer.getData('element-move-source');

    if (moveJson && moveSource?.startsWith('column:')) {
      try {
        const el = JSON.parse(moveJson) as PageElement;
        const parts = moveSource.split(':');
        const columnsElementId = parts[1];
        const colIdx = parseInt(parts[2]);

        // Build updated list with element inserted at position
        const updated = [...elements];
        updated.splice(insertAt, 0, el);

        // Remove the element from the source column
        const finalUpdated = updated.map(item => {
          if (item.id === columnsElementId && item.columnData) {
            return {
              ...item,
              columnData: item.columnData.map((col, i) =>
                i === colIdx ? { ...col, elements: col.elements.filter(e => e.id !== el.id) } : col
              ),
            };
          }
          return item;
        });

        onChange(finalUpdated);
        setSelectedId(el.id);
        return;
      } catch { /* ignore */ }
    }

    // Check for element move from main → main (ignore, handled by dnd-kit)
    if (moveJson && moveSource === 'main') return;

    // New element from toolbar
    const type = e.dataTransfer.getData('element-type') as PageElementType;
    if (type) {
      const el = createDefaultPageElement(type);
      const updated = [...elements];
      updated.splice(insertAt, 0, el);
      onChange(updated);
      setSelectedId(el.id);
    }
  }, [elements, onChange, dropIndex]);

  // --- Render drop indicator line ---
  const renderDropIndicator = () => (
    <div className="flex items-center gap-2 py-1 animate-fade-in" key="drop-indicator">
      <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm flex-shrink-0" />
      <div className="flex-1 h-0.5 bg-primary rounded-full" />
      <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm flex-shrink-0" />
    </div>
  );

  // Separate notification elements (pinned) from normal elements (sortable)
  const notificationElements = elements.filter(e => e.type === 'notification');
  const sortableElements = elements.filter(e => e.type !== 'notification');

  // Build element list with drop indicator injected at the right position
  const buildElementsWithIndicator = () => {
    const result: React.ReactNode[] = [];

    if (isExternalDragOver && dropIndex === 0) {
      result.push(renderDropIndicator());
    }

    sortableElements.forEach((el, idx) => {
      const formFieldIndex = sortableElements.slice(0, idx + 1).filter(e => e.type.startsWith('input_')).length;
      const isField = el.type.startsWith('input_');
      const lockedBy = isLockedByOther?.(el.id) || null;
      result.push(
        <SortableElement
          key={el.id}
          element={el}
          isSelected={designMode ? designSelectedId === el.id : (!readOnly && selectedId === el.id)}
          isDragActive={!readOnly && !designMode && activeId !== null}
          onSelect={designMode ? () => { onDesignSelect?.(el.id); } : readOnly ? () => {} : () => {
            if (lockedBy) return;
            setSelectedId(el.id);
            lockElement?.(el.id);
          }}
          onDelete={readOnly || designMode ? () => {} : () => handleDelete(el.id)}
          onElementChange={!readOnly && !designMode ? (patch) => handleElementChange(el.id, patch) : undefined}
          onRemoveFromMain={readOnly || designMode ? undefined : (elementId) => {
            onChange(elements.filter(e => e.id !== elementId));
            if (selectedId === elementId) setSelectedId(null);
          }}
          onMoveToMain={readOnly || designMode ? undefined as any : handleMoveToMain}
          selectedId={designMode ? designSelectedId : readOnly ? null : selectedId}
          onSelectElement={designMode ? (id) => onDesignSelect?.(id) : readOnly ? () => {} : (id) => setSelectedId(id)}
          stepNumber={isField ? formFieldIndex : undefined}
          lockedBy={lockedBy}
          designMode={designMode}
          formStyle={formStyle}
          elementLookup={elementLookup}
          variables={variables}
        />
      );
      if (isExternalDragOver && dropIndex === idx + 1) {
        result.push(renderDropIndicator());
      }
    });

    return result;
  };

  return (
    <div className="flex h-full w-full">
      {!hideToolbar && <ElementToolbar onAdd={handleAdd} />}

      {/* Center — Preview canvas */}
      <div
        className={`flex-1 overflow-auto flex flex-col transition-colors duration-200 ${
          isExternalDragOver && !readOnly && !designMode ? 'bg-primary/[0.03]' : 'bg-muted/30'
        }`}
        onClick={designMode ? () => onDesignSelect?.(null) : readOnly ? undefined : () => { setSelectedId(null); unlockElement?.(); }}
        onDragOver={readOnly || designMode ? undefined : handleCanvasDragOver}
        onDragEnter={readOnly || designMode ? undefined : handleCanvasDragEnter}
        onDragLeave={readOnly || designMode ? undefined : handleCanvasDragLeave}
        onDrop={readOnly || designMode ? undefined : handleCanvasDrop}
        style={{
          ['--primary' as any]: '48 24% 62%',
          ...(() => {
            const bgType = formStyle?.backgroundType || 'solid';
            const rawBg = effectiveStyle.backgroundColor || formStyle?.backgroundColor || '#FAFAF6';
            const bg = rawBg.startsWith('#') ? rawBg : `hsl(${rawBg})`;
            const result: React.CSSProperties = {
              fontFamily: normalizeFontFamily(effectiveStyle.fontFamily),
              color: formStyle?.textColor || undefined,
            };
            if (isExternalDragOver) return result;
            if (bgType === 'gradient' && formStyle?.backgroundGradient) {
              result.background = formStyle.backgroundGradient;
            } else if (bgType === 'image' && formStyle?.backgroundImage) {
              result.backgroundColor = bg;
              result.backgroundImage = `url(${formStyle.backgroundImage})`;
              result.backgroundSize = formStyle.backgroundSize || 'cover';
              result.backgroundPosition = 'center';
              result.backgroundRepeat = 'no-repeat';
            } else {
              result.backgroundColor = bg;
            }
            return result;
          })(),
        }}
      >
        {/* Pinned notification elements */}
        {notificationElements.length > 0 && (
          <div className="sticky top-0 z-20">
            <div className="bg-muted/60 backdrop-blur-sm px-4 pt-3 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Notificação fixa</span>
                <div className="h-px flex-1 bg-border/50" />
              </div>
              {notificationElements.map(el => (
                <div
                  key={el.id}
                  className={`relative group rounded-xl transition-all duration-200 ${
                    readOnly && !designMode ? 'cursor-default' : 'cursor-pointer'
                  } ${
                    (designMode ? designSelectedId === el.id : (!readOnly && selectedId === el.id))
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : (!readOnly || designMode) ? 'hover:ring-1 hover:ring-border' : ''
                  }`}
                  onClick={designMode
                    ? (e) => { e.stopPropagation(); onDesignSelect?.(el.id); }
                    : readOnly ? undefined
                    : (e) => { e.stopPropagation(); setSelectedId(el.id); }}
                >
                  {!readOnly && !designMode && (
                    <div className={`absolute -left-6 top-1/2 -translate-y-1/2 transition-opacity duration-150 ${
                      selectedId === el.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(el.id); }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <ElementPreview element={el} formStyle={formStyle} elementLookup={elementLookup} variables={variables} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logo */}
        {formStyle?.logoUrl && (
          <div className="px-6 pt-4">
            <img
              src={formStyle.logoUrl}
              alt="Logo"
              className="object-contain"
              style={{ height: formStyle.logoHeight || 40, maxWidth: 128 }}
            />
          </div>
        )}

        <div
          className="mx-auto w-full flex-1 flex flex-col justify-center"
          style={{
            maxWidth: 672 + (effectiveStyle.paddingX || 0) * 2,
            paddingLeft: effectiveStyle.paddingX,
            paddingRight: effectiveStyle.paddingX,
            paddingTop: effectiveStyle.paddingY ?? 32,
            paddingBottom: effectiveStyle.paddingY ?? 32,
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={customCollision}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={sortableElements.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div
                ref={listRef}
                className="min-h-[200px]"
                style={{ display: 'flex', flexDirection: 'column', gap: effectiveStyle.gap }}
              >
                {sortableElements.length === 0 && !isExternalDragOver ? (
                  <div className="py-24 text-center text-muted-foreground flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                      <LayoutTemplate className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-base font-medium">Página vazia</p>
                      <p className="text-sm mt-1">Clique em um elemento na barra de ferramentas à esquerda para começar</p>
                    </div>
                  </div>
                ) : sortableElements.length === 0 && isExternalDragOver ? (
                  // Empty state with drop indicator
                  <div className="border-2 border-dashed border-primary/40 rounded-xl bg-primary/5 py-8 flex flex-col items-center gap-2 animate-fade-in pointer-events-none">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-primary/70">Solte aqui para adicionar</p>
                  </div>
                ) : (
                  buildElementsWithIndicator()
                )}
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
              {activeElement ? (
                <div className="rounded-xl bg-card/95 shadow-xl ring-2 ring-primary/40 p-4 max-w-2xl opacity-90 backdrop-blur-sm">
                  <ElementPreview
                    element={activeElement}
                    formStyle={formStyle}
                    elementLookup={elementLookup}
                    variables={variables}
                    stepNumber={
                      activeElement.type.startsWith('input_')
                        ? elements.slice(0, elements.indexOf(activeElement) + 1).filter(e => e.type.startsWith('input_')).length
                        : undefined
                    }
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Design mode — mock navigation bar */}
        {designMode && (
          <div className="sticky bottom-4 z-30 flex justify-center pointer-events-none pb-4">
            <div className="pointer-events-auto flex items-center gap-2 bg-card/90 backdrop-blur-md border border-border rounded-full shadow-lg px-2 py-1.5">
              {pageId !== 'welcome' && (pages || []).length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 gap-1.5 text-xs cursor-default"
                    style={{
                      backgroundColor: formStyle?.backButtonBgColor || 'transparent',
                      color: formStyle?.backButtonTextColor || undefined,
                      borderRadius: formStyle?.backButtonBorderRadius ?? 9999,
                      border: (formStyle?.backButtonBorderWidth ?? 0) > 0
                        ? `${formStyle?.backButtonBorderWidth}px solid ${formStyle?.backButtonBorderColor || 'transparent'}`
                        : undefined,
                    }}
                    tabIndex={-1}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Voltar</span>
                  </Button>
                  <div className="w-px h-5 bg-border" />
                </>
              )}
              <Button
                variant="default"
                size="sm"
                className="h-9 gap-1.5 text-xs cursor-default"
                style={{
                  backgroundColor: formStyle?.buttonBgColor || formStyle?.primaryColor || undefined,
                  color: formStyle?.buttonTextColor || undefined,
                  borderRadius: formStyle?.buttonBorderRadius ?? undefined,
                  padding: formStyle?.buttonSize === 'sm' ? '6px 16px' : formStyle?.buttonSize === 'lg' ? '14px 32px' : '10px 24px',
                  fontSize: formStyle?.buttonSize === 'sm' ? 13 : formStyle?.buttonSize === 'lg' ? 16 : undefined,
                }}
                tabIndex={-1}
              >
                {pageId === 'thank-you' ? (
                  <span>✓ Enviado</span>
                ) : pageId === 'welcome' ? (
                  <>
                    <span>Começar</span>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </>
                ) : (() => {
                  const idx = (pages || []).findIndex(p => p.id === pageId);
                  const isLast = idx === (pages || []).length - 1;
                  return isLast ? (
                    <>
                      <span>Enviar</span>
                      <Send className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </>
                  );
                })()}
              </Button>
              {pageId !== 'welcome' && pageId !== 'thank-you' && (
                <span className="text-[10px] text-muted-foreground/60 px-1 hidden sm:block">Enter ⏎</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right — Settings panel */}
      <AnimatePresence>
        {!readOnly && !designMode && selectedElement && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 288, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="border-l border-border bg-card flex flex-col h-full flex-shrink-0 overflow-hidden"
          >
            <div className="w-72 h-full flex flex-col">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedElement.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="h-full flex flex-col"
                >
                  <ElementSettingsPanel
                    element={selectedElement}
                    onChange={patch => handleElementChange(selectedElement.id, patch)}
                    onClose={() => setSelectedId(null)}
                    pages={pages}
                    variables={variables}
                    integrationNodes={integrationNodes}
                    allInputElements={filteredInputElements}
                    trackedParams={trackedParams}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
