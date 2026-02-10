import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
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
import { LayoutTemplate, Plus, Trash2 } from 'lucide-react';

interface Props {
  elements: PageElement[];
  onChange: (elements: PageElement[]) => void;
  pageStyle?: FunnelPageStyle;
  onPageStyleChange?: (patch: Partial<FunnelPageStyle>) => void;
}

export default function PageBuilder({ elements, onChange, pageStyle, onPageStyleChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [dropIndex, setDropIndex] = useState<number>(-1);
  const dragCounterRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selectedElement = elements.find(e => e.id === selectedId) || null;
  const activeElement = elements.find(e => e.id === activeId) || null;

  const effectiveStyle: FunnelPageStyle = {
    backgroundColor: '',
    fontFamily: 'Inter',
    gap: 32,
    paddingX: 24,
    paddingY: 32,
    ...pageStyle,
  };

  // --- dnd-kit handlers (reorder existing) ---
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = elements.findIndex(e => e.id === active.id);
      const newIndex = elements.findIndex(e => e.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(elements, oldIndex, newIndex));
      }
    }
  }, [elements, onChange]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleAdd = useCallback((element: PageElement) => {
    onChange([...elements, element]);
    setSelectedId(element.id);
  }, [elements, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(elements.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [elements, onChange, selectedId]);

  const handleElementChange = useCallback((id: string, patch: Partial<PageElement>) => {
    onChange(elements.map(e => e.id === id ? { ...e, ...patch } : e));
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
      result.push(
        <SortableElement
          key={el.id}
          element={el}
          isSelected={selectedId === el.id}
          isDragActive={activeId !== null}
          onSelect={() => setSelectedId(el.id)}
          onDelete={() => handleDelete(el.id)}
          stepNumber={isField ? formFieldIndex : undefined}
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
      <ElementToolbar onAdd={handleAdd} />

      {/* Center — Preview canvas */}
      <div
        className={`flex-1 overflow-auto transition-colors duration-200 ${
          isExternalDragOver ? 'bg-primary/[0.03]' : 'bg-muted/30'
        }`}
        onClick={() => setSelectedId(null)}
        onDragOver={handleCanvasDragOver}
        onDragEnter={handleCanvasDragEnter}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
        style={{
          backgroundColor: isExternalDragOver ? undefined : (effectiveStyle.backgroundColor || undefined),
          fontFamily: effectiveStyle.fontFamily || undefined,
        }}
      >
        {/* Pinned notification elements */}
        {notificationElements.length > 0 && (
          <div className="sticky top-0 z-20 px-4 pt-3 pb-1">
            {notificationElements.map(el => (
              <div
                key={el.id}
                className={`relative group rounded-xl cursor-pointer transition-all duration-200 ${
                  selectedId === el.id
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    : 'hover:ring-1 hover:ring-border'
                }`}
                onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
              >
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
                <ElementPreview element={el} />
              </div>
            ))}
          </div>
        )}

        <div
          className="max-w-2xl mx-auto"
          style={{
            paddingLeft: effectiveStyle.paddingX,
            paddingRight: effectiveStyle.paddingX,
            paddingTop: effectiveStyle.paddingY,
            paddingBottom: effectiveStyle.paddingY,
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
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
                      <p className="text-base font-medium">Arraste elementos aqui</p>
                      <p className="text-sm mt-1">Ou clique em um elemento na barra lateral esquerda</p>
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
      </div>

      {/* Right — Settings panel (always visible) */}
      <div className="w-72 border-l border-border bg-card flex flex-col h-full flex-shrink-0">
        {selectedElement ? (
          <ElementSettingsPanel
            key={selectedElement.id}
            element={selectedElement}
            onChange={patch => handleElementChange(selectedElement.id, patch)}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <PageGeneralSettings
            pageStyle={effectiveStyle}
            onChange={patch => onPageStyleChange?.(patch)}
          />
        )}
      </div>
    </div>
  );
}
