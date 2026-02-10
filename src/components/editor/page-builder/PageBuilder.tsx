import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
// modifiers removed — not installed
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const selectedElement = elements.find(e => e.id === selectedId) || null;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = elements.findIndex(e => e.id === active.id);
      const newIndex = elements.findIndex(e => e.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove(elements, oldIndex, newIndex));
      }
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

  // Handle drop from sidebar (native HTML drag)
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={elements.map(e => e.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-8 min-h-[200px]">
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
                    elements.map((el, idx) => {
                      const formFieldIndex = elements.slice(0, idx + 1).filter(e => e.type.startsWith('input_')).length;
                      const isField = el.type.startsWith('input_');
                      return (
                        <SortableElement
                          key={el.id}
                          element={el}
                          isSelected={selectedId === el.id}
                          onSelect={() => setSelectedId(el.id)}
                          onDelete={() => handleDelete(el.id)}
                          stepNumber={isField ? formFieldIndex : undefined}
                        />
                      );
                    })
                  )}
                </div>
              </SortableContext>
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
          <div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">
            <div>
              <p className="text-sm font-medium">Nenhum elemento selecionado</p>
              <p className="text-xs mt-1">Clique em um elemento para editar suas propriedades</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
