import { useCallback, useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PageElement, ColumnData, createDefaultPageElement, PageElementType, PAGE_ELEMENT_LABELS, ELEMENT_CATEGORIES, ElementCategory } from '@/types/pageElements';
import type { FormVariable } from '@/types/form';
import ElementPreview from './ElementPreview';
import type { ElementLookup } from '@/components/editor/shared/VariableHighlightOverlay';
import { Plus, Trash2, GripVertical, ArrowUpFromLine, ArrowLeft, ArrowRight, ChevronUp, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

// Wrapper that registers each column as a dnd-kit droppable
function ColumnDropZone({ columnsElementId, colIdx, col, dragState, handleColDragOver, handleInternalDragOver, handleInternalDrop, handleColDrop, children }: {
  columnsElementId: string;
  colIdx: number;
  col: { id: string; elements: PageElement[] };
  dragState: { colIdx: number; elIdx: number } | null;
  handleColDragOver: (e: React.DragEvent, colIdx: number) => void;
  handleInternalDragOver: (e: React.DragEvent, colIdx: number, elIdx: number) => void;
  handleInternalDrop: (e: React.DragEvent) => void;
  handleColDrop: (e: React.DragEvent, colIdx: number) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col-drop:${columnsElementId}:${colIdx}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[100px] rounded-xl border-2 border-dashed p-3 space-y-2 transition-colors flex flex-col ${
        isOver ? 'border-primary/60 bg-primary/5' : 'border-border/60 hover:border-primary/30'
      }`}
      onDragOver={(e) => {
        handleColDragOver(e, colIdx);
        if (dragState) handleInternalDragOver(e, colIdx, col.elements.length);
      }}
      onDrop={(e) => {
        if (dragState) {
          handleInternalDrop(e);
        } else {
          handleColDrop(e, colIdx);
        }
      }}
    >
      {children}
    </div>
  );
}

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onRemoveFromMain?: (elementId: string) => void;
  onMoveToMain?: (element: PageElement, sourceColumnsId: string, colIdx: number) => void;
  selectedId?: string | null;
  onSelectElement?: (id: string) => void;
  designMode?: boolean;
  elementLookup?: ElementLookup;
  variables?: FormVariable[];

export default function ColumnsEditor({ element, onChange, onRemoveFromMain, onMoveToMain, selectedId, onSelectElement, designMode, elementLookup, variables }: Props) {
  const columnCount = element.columnCount || 2;
  const columns = element.columnData || [];
  const [dragState, setDragState] = useState<{ colIdx: number; elIdx: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ colIdx: number; elIdx: number } | null>(null);
  // Track which element is being dragged via grip handle
  const gripDragRef = useRef<string | null>(null);

  const updateColumn = useCallback((colIdx: number, elements: PageElement[]) => {
    const updated = columns.map((col, i) => i === colIdx ? { ...col, elements } : col);
    onChange({ columnData: updated });
  }, [columns, onChange]);

  const addElement = useCallback((colIdx: number, type: PageElementType) => {
    const el = createDefaultPageElement(type);
    const updated = [...(columns[colIdx]?.elements || []), el];
    updateColumn(colIdx, updated);
  }, [columns, updateColumn]);

  const deleteElement = useCallback((colIdx: number, elId: string) => {
    const updated = (columns[colIdx]?.elements || []).filter(e => e.id !== elId);
    updateColumn(colIdx, updated);
  }, [columns, updateColumn]);

  const moveElementToColumn = useCallback((fromCol: number, elId: string, toCol: number) => {
    const el = columns[fromCol]?.elements.find(e => e.id === elId);
    if (!el || toCol < 0 || toCol >= columnCount) return;
    const newColumns = columns.map((col, i) => ({
      ...col,
      elements: i === fromCol
        ? col.elements.filter(e => e.id !== elId)
        : i === toCol
          ? [...col.elements, el]
          : [...col.elements],
    }));
    onChange({ columnData: newColumns });
  }, [columns, columnCount, onChange]);

  const reorderInColumn = useCallback((colIdx: number, elIdx: number, direction: -1 | 1) => {
    const col = columns[colIdx];
    if (!col) return;
    const newIdx = elIdx + direction;
    if (newIdx < 0 || newIdx >= col.elements.length) return;
    const newElements = [...col.elements];
    [newElements[elIdx], newElements[newIdx]] = [newElements[newIdx], newElements[elIdx]];
    updateColumn(colIdx, newElements);
  }, [columns, updateColumn]);

  // External drag (from toolbar or main canvas) into column
  const handleColDragOver = useCallback((e: React.DragEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleColDrop = useCallback((e: React.DragEvent, colIdx: number) => {
    e.preventDefault();
    e.stopPropagation();

    // Check for element move from main canvas
    const moveJson = e.dataTransfer.getData('element-move-json');
    const moveSource = e.dataTransfer.getData('element-move-source');

    if (moveJson && moveSource === 'main') {
      try {
        const el = JSON.parse(moveJson) as PageElement;
        if (el.type !== 'columns') {
          const updated = [...(columns[colIdx]?.elements || []), el];
          updateColumn(colIdx, updated);
          onRemoveFromMain?.(el.id);
          return;
        }
      } catch { /* ignore parse errors */ }
    }

    // Check for new element from toolbar
    const type = e.dataTransfer.getData('element-type') as PageElementType;
    if (type && type !== 'columns') {
      addElement(colIdx, type);
    }
  }, [addElement, columns, updateColumn, onRemoveFromMain]);

  // Internal reorder via native drag (only initiated by grip handle)
  const handleInternalDragStart = useCallback((e: React.DragEvent, colIdx: number, elIdx: number) => {
    setDragState({ colIdx, elIdx });
    gripDragRef.current = columns[colIdx]?.elements[elIdx]?.id || null;
    const el = columns[colIdx]?.elements[elIdx];
    if (el) {
      e.dataTransfer.setData('element-move-json', JSON.stringify(el));
      e.dataTransfer.setData('element-move-source', `column:${element.id}:${colIdx}:${elIdx}`);
      e.dataTransfer.effectAllowed = 'move';
    }
  }, [columns, element.id]);

  const handleInternalDragOver = useCallback((e: React.DragEvent, colIdx: number, elIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget({ colIdx, elIdx });
  }, []);

  const handleInternalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragState || !dropTarget) {
      setDragState(null);
      setDropTarget(null);
      gripDragRef.current = null;
      return;
    }

    const srcCol = columns[dragState.colIdx];
    const el = srcCol?.elements[dragState.elIdx];
    if (!el) {
      setDragState(null);
      setDropTarget(null);
      gripDragRef.current = null;
      return;
    }

    const newColumns = columns.map(c => ({ ...c, elements: [...c.elements] }));
    // Remove from source
    newColumns[dragState.colIdx].elements.splice(dragState.elIdx, 1);
    // Insert at target
    newColumns[dropTarget.colIdx].elements.splice(dropTarget.elIdx, 0, el);

    onChange({ columnData: newColumns });
    setDragState(null);
    setDropTarget(null);
    gripDragRef.current = null;
  }, [dragState, dropTarget, columns, onChange]);

  // Clean up drag state when drag ends
  const handleInternalDragEnd = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
    gripDragRef.current = null;
  }, []);

  // Types allowed inside columns (no nested columns)
  const allowedCategories = (Object.entries(ELEMENT_CATEGORIES) as [ElementCategory, typeof ELEMENT_CATEGORIES[ElementCategory]][])
    .map(([key, cat]) => ({
      key,
      label: cat.label,
      types: cat.types.filter(t => t !== 'columns' && t !== 'notification'),
    }))
    .filter(c => c.types.length > 0);

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}
    >
      {columns.slice(0, columnCount).map((col, colIdx) => (
        <ColumnDropZone
          key={col.id}
          columnsElementId={element.id}
          colIdx={colIdx}
          col={col}
          dragState={dragState}
          handleColDragOver={handleColDragOver}
          handleInternalDragOver={handleInternalDragOver}
          handleInternalDrop={handleInternalDrop}
          handleColDrop={handleColDrop}
        >
          {/* Empty state */}
          {col.elements.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-4 gap-2">
              <span className="text-[11px] text-muted-foreground/50">Coluna {colIdx + 1} vazia</span>
              {!designMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full py-2.5 rounded-lg border-2 border-dashed border-primary/20 bg-primary/[0.03] text-primary/50 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/[0.06] transition-colors flex items-center justify-center gap-1.5 text-xs font-medium">
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar elemento
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-48">
                    {allowedCategories.map(cat => (
                      <DropdownMenuSub key={cat.key}>
                        <DropdownMenuSubTrigger className="text-xs">{cat.label}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-40">
                          {cat.types.map(t => (
                            <DropdownMenuItem key={t} className="text-xs" onClick={() => addElement(colIdx, t)}>
                              {PAGE_ELEMENT_LABELS[t]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}

          {col.elements.map((el, elIdx) => (
            <div
              key={el.id}
              onDragOver={designMode ? undefined : (e) => handleInternalDragOver(e, colIdx, elIdx)}
              onDrop={designMode ? undefined : (e) => handleInternalDrop(e)}
              onDragEnd={designMode ? undefined : handleInternalDragEnd}
              onPointerDownCapture={designMode ? (e) => { e.stopPropagation(); onSelectElement?.(el.id); } : undefined}
              onClick={!designMode ? (e) => { e.stopPropagation(); onSelectElement?.(el.id); } : undefined}
              className={`relative group rounded-lg transition-all cursor-pointer ${
                dropTarget?.colIdx === colIdx && dropTarget?.elIdx === elIdx
                  ? 'border-t-2 border-primary'
                  : selectedId === el.id
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    : 'hover:ring-1 hover:ring-border'
              }`}
            >
              {/* Floating controls — left side (reorder + grip) */}
              {!designMode && (
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex flex-col gap-0.5">
                  {elIdx > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); reorderInColumn(colIdx, elIdx, -1); }}
                      className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Mover para cima"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                  )}
                  {/* Grip handle — ONLY this is draggable */}
                  <div
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleInternalDragStart(e, colIdx, elIdx); }}
                    className="cursor-grab active:cursor-grabbing p-0.5 rounded bg-background border border-border shadow-sm hover:bg-muted text-muted-foreground transition-colors"
                    title="Arrastar para reordenar"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </div>
                  {elIdx < (columns[colIdx]?.elements.length || 0) - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); reorderInColumn(colIdx, elIdx, 1); }}
                      className="p-0.5 rounded bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Mover para baixo"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Floating controls — right side (move between columns + delete) */}
              {!designMode && (
                <div className="absolute -right-1 -top-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-0.5">
                  {colIdx > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveElementToColumn(colIdx, el.id, colIdx - 1); }}
                      className="p-1 rounded-md bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Mover para coluna anterior"
                    >
                      <ArrowLeft className="h-3 w-3" />
                    </button>
                  )}
                  {colIdx < columnCount - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveElementToColumn(colIdx, el.id, colIdx + 1); }}
                      className="p-1 rounded-md bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Mover para próxima coluna"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  {onMoveToMain && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMoveToMain(el, element.id, colIdx); }}
                      className="p-1 rounded-md bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors"
                      title="Mover para fora da coluna"
                    >
                      <ArrowUpFromLine className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteElement(colIdx, el.id); }}
                    className="p-1 rounded-md bg-background border border-border shadow-sm hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Element content */}
              <ElementPreview element={el} elementLookup={elementLookup} variables={variables} />
            </div>
          ))}

          {/* Always-visible add button */}
          {col.elements.length > 0 && !designMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full py-2.5 rounded-lg border-2 border-dashed border-primary/20 bg-primary/[0.03] text-primary/50 hover:border-primary/40 hover:text-primary/70 hover:bg-primary/[0.06] transition-colors flex items-center justify-center gap-1.5 text-xs font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar elemento
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {allowedCategories.map(cat => (
                  <DropdownMenuSub key={cat.key}>
                    <DropdownMenuSubTrigger className="text-xs">{cat.label}</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-40">
                      {cat.types.map(t => (
                        <DropdownMenuItem key={t} className="text-xs" onClick={() => addElement(colIdx, t)}>
                          {PAGE_ELEMENT_LABELS[t]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </ColumnDropZone>
      ))}
    </div>
  );
}
