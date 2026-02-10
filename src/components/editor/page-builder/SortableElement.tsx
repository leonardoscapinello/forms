import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageElement } from '@/types/pageElements';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ElementPreview from './ElementPreview';

interface Props {
  element: PageElement;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function SortableElement({ element, isSelected, onSelect, onDelete }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg transition-all ${
        isSelected
          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'hover:ring-1 hover:ring-border'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Drag handle + delete */}
      <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity ${
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <button
          {...attributes}
          {...listeners}
          className="p-1 rounded hover:bg-muted cursor-grab active:cursor-grabbing text-muted-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <ElementPreview element={element} />
    </div>
  );
}
