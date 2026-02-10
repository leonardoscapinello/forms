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
import { PageElement, createDefaultPageElement, PageElementType, PAGE_ELEMENT_LABELS } from '@/types/pageElements';
import { FunnelPageStyle } from '@/types/form';
import SortableElement from './SortableElement';
import ElementToolbar from './ElementToolbar';
import ElementSettingsPanel from './ElementSettingsPanel';
import PageGeneralSettings from './PageGeneralSettings';
import ElementPreview from './ElementPreview';
import { LayoutTemplate, Plus } from 'lucide-react';

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
  const [externalDragType, setExternalDragType] = useState<string>('');
  const dragCounterRef = useRef(0);

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

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsExternalDragOver(false);
    setExternalDragType('');
    const type = e.dataTransfer.getData('element-type') as PageElementType;
    if (type) {
      const el = createDefaultPageElement(type);
      onChange([...elements, el]);
      setSelectedId(el.id);
    }
  }, [elements, onChange]);

  const handleCanvasDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) {
      setIsExternalDragOver(true);
      // Try to read type from dataTransfer types
      const types = Array.from(e.dataTransfer.types);
      if (types.includes('element-type')) {
        setExternalDragType('element');
      }
    }
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsExternalDragOver(false);
      setExternalDragType('');
    }
  }, []);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  return (
    <div className="flex h-full w-full">
      {/* Left — Element toolbar */}
      <ElementToolbar onAdd={handleAdd} />

      {/* Center — Preview canvas */}
      <div
        className={`flex-1 overflow-auto transition-colors duration-200 ${
          isExternalDragOver ? 'bg-primary/5' : 'bg-muted/30'
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
              <SortableContext items={elements.map(e => e.id)} strategy={verticalListSortingStrategy}>
                <div className="min-h-[200px]" style={{ display: 'flex', flexDirection: 'column', gap: effectiveStyle.gap }}>
                  {elements.length === 0 && !isExternalDragOver ? (
                    <div className="py-24 text-center text-muted-foreground flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
                        <LayoutTemplate className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-medium">Arraste elementos aqui</p>
                        <p className="text-sm mt-1">Ou clique em um elemento na barra lateral esquerda</p>
                      </div>
                    </div>
                  ) : (
                    elements.map((el, idx) => {
                      const formFieldIndex = elements.slice(0, idx + 1).filter(e => e.type.startsWith('input_')).length;
                      const isField = el.type.startsWith('input_');
                      return (
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
                    })
                  )}

                  {/* Drop zone indicator — visible when dragging from toolbar */}
                  {isExternalDragOver && (
                    <div className="border-2 border-dashed border-primary/40 rounded-xl bg-primary/5 py-8 flex flex-col items-center gap-2 transition-all duration-200 animate-fade-in pointer-events-none">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-primary/70">Solte aqui para adicionar</p>
                    </div>
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
