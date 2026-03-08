import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageElement } from '@/types/pageElements';
import type { FormStyle, FormVariable } from '@/types/form';
import { GripVertical, Trash2 } from 'lucide-react';
import ElementPreview from './ElementPreview';
import ColumnsEditor from './ColumnsEditor';
import ElementLockIndicator from '@/components/editor/collaboration/ElementLockIndicator';
import { CollaboratorPresence } from '@/hooks/useRealtimeCollaboration';
import type { ElementLookup } from '@/components/editor/shared/VariableHighlightOverlay';

interface Props {
  element: PageElement;
  isSelected: boolean;
  isDragActive?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onElementChange?: (patch: Partial<PageElement>) => void;
  onRemoveFromMain?: (elementId: string) => void;
  onMoveToMain?: (element: PageElement, sourceColumnsId: string, colIdx: number) => void;
  selectedId?: string | null;
  onSelectElement?: (id: string) => void;
  stepNumber?: number;
  lockedBy?: CollaboratorPresence | null;
  designMode?: boolean;
  formStyle?: FormStyle;
  elementLookup?: ElementLookup;
  variables?: FormVariable[];
}

export default function SortableElement({ element, isSelected, isDragActive, onSelect, onDelete, onElementChange, onRemoveFromMain, onMoveToMain, selectedId, onSelectElement, stepNumber, lockedBy, designMode, formStyle, elementLookup, variables }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: element.id, disabled: !!designMode || !!lockedBy });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  const handleNativeDragStart = (e: React.DragEvent) => {
    // Don't allow dragging columns elements to other containers
    if (element.type === 'columns') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('element-move-json', JSON.stringify(element));
    e.dataTransfer.setData('element-move-source', 'main');
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        ...(lockedBy ? { '--tw-ring-color': lockedBy.color } as React.CSSProperties : {}),
      }}
      data-sortable-id={element.id}
      draggable={!designMode && element.type !== 'columns' && !lockedBy}
      onDragStart={handleNativeDragStart}
      className={`group relative rounded-xl transition-all duration-200 border ${
        lockedBy
          ? 'ring-2 ring-offset-2 ring-offset-background opacity-70 cursor-not-allowed border-border/40'
          : isDragging
            ? 'opacity-30 scale-[0.98] bg-primary/5 border-2 border-dashed border-primary/30 rounded-xl'
            : isOver && isDragActive
              ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background shadow-md border-primary/30'
              : isSelected
                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary/30'
                : 'border-border/30 hover:border-border/60 hover:ring-1 hover:ring-border'
      }`}
      onClick={(e) => { e.stopPropagation(); if (!lockedBy) onSelect(); }}
    >
      {/* Lock indicator */}
      {lockedBy && <ElementLockIndicator lockedBy={lockedBy} />}

      {/* Drop indicator line */}
      {isOver && isDragActive && !isDragging && (
        <div className="absolute -top-1.5 left-0 right-0 flex items-center z-10">
          <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm" />
          <div className="flex-1 h-0.5 bg-primary rounded-full" />
          <div className="w-3 h-3 rounded-full bg-primary border-2 border-background shadow-sm" />
        </div>
      )}

      {/* Drag handle + delete */}
      {!designMode && (
        <div className={`absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 transition-opacity duration-150 ${
          isDragging ? 'opacity-0' : isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            {...attributes}
            {...listeners}
            onDragStart={(e) => { e.stopPropagation(); e.preventDefault(); }}
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
      )}

      <div className={`transition-opacity duration-200 ${isDragging ? 'opacity-0' : 'opacity-100'}`}>
        {element.type === 'columns' ? (
          <ColumnsEditor
            element={element}
            onChange={onElementChange || (() => {})}
            onRemoveFromMain={onRemoveFromMain}
            onMoveToMain={onMoveToMain}
            selectedId={selectedId}
            onSelectElement={onSelectElement}
            designMode={designMode}
            elementLookup={elementLookup}
            variables={variables}
          />
        ) : (
          <ElementPreview element={element} stepNumber={stepNumber} formStyle={formStyle} elementLookup={elementLookup} variables={variables} />
        )}
      </div>
    </div>
  );
}
