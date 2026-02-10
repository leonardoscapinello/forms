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
import { PageElement, createDefaultPageElement, PageElementType } from '@/types/pageElements';
import SortableElement from './SortableElement';
import ElementToolbar from './ElementToolbar';
import ElementSettingsPanel from './ElementSettingsPanel';
import { LayoutTemplate } from 'lucide-react';

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

  // Handle drop from sidebar
  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('element-type') as PageElementType;
    if (type) {
      const el = createDefaultPageElement(type);
      onChange([...elements, el]);
      setSelectedId(el.id);
    }
  }, [elements, onChange]);

  return (
    <div className="flex h-full w-full">
      {/* Left — Element toolbar */}
      <ElementToolbar onAdd={handleAdd} />

      {/* Center — Preview canvas */}
      <div
        className="flex-1 overflow-auto bg-muted/30"
        onClick={() => setSelectedId(null)}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={handleCanvasDrop}
      >
        <div className="max-w-2xl mx-auto py-8 px-6">
          {/* Phone-like frame */}
          <div className="bg-card rounded-2xl border border-border shadow-sm min-h-[500px] p-6">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={elements.map(e => e.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1 pl-10">
                  {elements.length === 0 ? (
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
      </div>

      {/* Right — Settings panel */}
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
