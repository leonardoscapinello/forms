import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageElement } from '@/types/pageElements';
import { GripVertical, Trash2 } from 'lucide-react';
import ElementPreview from './ElementPreview';

interface Props {
  element: PageElement;
  isSelected: boolean;
  isDragActive?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  stepNumber?: number;
}

export default function SortableElement({ element, isSelected, isDragActive, onSelect, onDelete, stepNumber }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: element.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl transition-all duration-200 ${
        isDragging
          ? 'opacity-30 scale-[0.98] bg-primary/5 border-2 border-dashed border-primary/30 rounded-xl'
          : isOver && isDragActive
            ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background shadow-md'
            : isSelected
              ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
              : 'hover:ring-1 hover:ring-border'
      }`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Drop indicator line */}
      {isOver && isDragActive && !isDragging && (
        <div className="absolute -top-1.5 left-0 right-0 flex items-center z-10">
          <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm" />
          <div className="flex-1 h-0.5 bg-primary rounded-full" />
          <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm" />
        </div>
      )}

      {/* Drag handle + delete */}
      <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity duration-150 ${
        isDragging ? 'opacity-0' : isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}>
        <button
          {...attributes}
          {...listeners}
          className="p-1.5 rounded-md hover:bg-muted cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={`transition-opacity duration-200 ${isDragging ? 'opacity-0' : 'opacity-100'}`}>
        <ElementPreview element={element} stepNumber={stepNumber} />
      </div>
    </div>
  );
}
