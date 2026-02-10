import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText } from 'lucide-react';
import { FunnelPage } from '@/types/form';

interface PageNodeData {
  page: FunnelPage;
  index: number;
  onChange: (patch: Partial<FunnelPage>) => void;
  onDelete: () => void;
  onSelect: () => void;
}

function PageNode({ data, selected }: NodeProps & { data: PageNodeData }) {
  const { page, index, onSelect, onChange } = data;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(page.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(page.title);
  }, [page.title]);

  const startEditing = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue !== page.title) {
      onChange({ title: editValue });
    }
  }, [editValue, page.title, onChange]);

  const elementCount = page.elements?.length || 0;

  return (
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all cursor-pointer hover:shadow-md ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
      onDoubleClick={onSelect}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/20 bg-primary/5 rounded-t-xl">
        <div className="flex items-center gap-1.5 text-primary">
          <FileText className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wide">Página</span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 ml-auto">#{index + 1}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditValue(page.title); setEditing(false); } }}
            className="text-sm font-medium text-foreground w-full bg-transparent border-0 border-b border-primary outline-none px-0 py-0.5"
            placeholder="Título da página"
          />
        ) : (
          <p
            className="text-sm font-medium text-foreground truncate hover:text-primary/80 cursor-text"
            onClick={startEditing}
          >
            {page.title || 'Sem título'}
          </p>
        )}

        {/* Elements count */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {elementCount === 0 ? 'Nenhum elemento' : `${elementCount} elemento${elementCount > 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Mini preview of element types */}
        {elementCount > 0 && (
          <div className="flex flex-wrap gap-1">
            {page.elements.slice(0, 5).map(el => (
              <span
                key={el.id}
                className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {el.type.replace('input_', '').replace('_', ' ')}
              </span>
            ))}
            {elementCount > 5 && (
              <span className="text-[9px] text-muted-foreground/50">+{elementCount - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PageNode);
