import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { PageElement } from '@/types/pageElements';
import SortableElement from './SortableElement';
import ElementToolbar from './ElementToolbar';
import ElementSettingsPanel from './ElementSettingsPanel';

interface Props {
  elements: PageElement[];
  onChange: (elements: PageElement[]) => void;
}

export default function PageBuilder({ elements, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const selectedElement = elements.find(e => e.id === selectedId) || null;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = elements.findIndex(e => e.id === active.id);
      const newIndex = elements.findIndex(e => e.id === over.id);
      onChange(arrayMove(elements, oldIndex, newIndex));
    }
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
    onChange(elements.map(e => e.id === id ? { ...e, ...patch } : e));
  }, [elements, onChange]);

  return (
    <div className="flex h-full">
      {/* Main canvas */}
      <div
        className="flex-1 overflow-auto p-8"
        onClick={() => setSelectedId(null)}
      >
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Toolbar */}
          <ElementToolbar onAdd={handleAdd} />

          {/* Sortable elements */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={elements.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1 py-4 pl-12">
                {elements.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    <p className="text-lg font-medium">Página vazia</p>
                    <p className="text-sm mt-1">Use a barra acima para adicionar elementos</p>
                  </div>
                ) : (
                  elements.map(el => (
                    <SortableElement
                      key={el.id}
                      element={el}
                      isSelected={selectedId === el.id}
                      onSelect={() => setSelectedId(el.id)}
                      onDelete={() => handleDelete(el.id)}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {/* Settings panel */}
      {selectedElement && (
        <ElementSettingsPanel
          key={selectedElement.id}
          element={selectedElement}
          onChange={patch => handleElementChange(selectedElement.id, patch)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
