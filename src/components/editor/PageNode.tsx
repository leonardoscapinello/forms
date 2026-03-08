import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText, Variable, AlertTriangle } from 'lucide-react';
import { FunnelPage, FormVariable, VariableAssignment, IntegrationNodeData } from '@/types/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import VariableAssignPanel, { InputElementGroup } from './VariableAssignPanel';
import { NodeToggleSwitch, DisabledBadge } from './NodeDisabledOverlay';
import { TooltipProvider } from '@/components/ui/tooltip';

interface PageNodeData {
  page: FunnelPage;
  index: number;
  onChange: (patch: Partial<FunnelPage>) => void;
  onDelete: () => void;
  onSelect: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  isDisconnected?: boolean;
  isNodeDisabled?: boolean;
  onToggleDisabled?: () => void;
  onCreateVariable?: (variable: FormVariable) => void;
}

function PageNode({ data, selected }: NodeProps & { data: PageNodeData }) {
  const { page, index, onSelect, onChange, variables = [], integrationNodes = [], allInputElements = [], isDisconnected = false, isNodeDisabled = false, onToggleDisabled, onCreateVariable } = data;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(page.title);
  const [varPopoverOpen, setVarPopoverOpen] = useState(false);
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
  const isEmpty = elementCount === 0;
  const assignmentCount = page.variableAssignments?.length || 0;

  return (
    <TooltipProvider>
    <div
      className={`w-72 rounded-xl border bg-card shadow-sm transition-all cursor-pointer hover:shadow-md ${
        isNodeDisabled ? 'opacity-50 grayscale'
        : selected ? 'border-[#B3AB86] shadow-md ring-2 ring-[#B3AB86]/10'
        : isDisconnected ? 'border-destructive/50 opacity-60'
        : isEmpty ? 'border-warning/50 bg-warning/5'
        : 'border-border'
      }`}
      onDoubleClick={onSelect}
    >
      <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />

      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b rounded-t-xl ${
        isEmpty ? 'border-warning/30 bg-warning/10' : 'border-[#B3AB86]/20 bg-[#B3AB86]/8'
      }`}>
        <div className={`flex items-center gap-1.5 ${isEmpty ? 'text-warning' : 'text-[#8A7D4A]'}`}>
          {isEmpty ? <AlertTriangle className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          <span className="text-[11px] font-medium uppercase tracking-wide">Página</span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 ml-auto flex items-center gap-1.5">
          #{index + 1}
          {onToggleDisabled && <NodeToggleSwitch isDisabled={isNodeDisabled} onToggle={onToggleDisabled} />}
        </span>
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
            className="text-sm font-medium text-foreground w-full bg-transparent border-0 border-b border-[#B3AB86] outline-none px-0 py-0.5"
            placeholder="Título da página"
          />
        ) : (
          <p
            className="text-sm font-medium text-foreground truncate hover:text-[#8A7D4A] cursor-text"
            onClick={startEditing}
          >
            {page.title || 'Sem título'}
          </p>
        )}

        {/* Elements count */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isNodeDisabled && <DisabledBadge />}
          {isEmpty ? (
            <span className="text-[10px] text-warning font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Página vazia — será pulada
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {`${elementCount} elemento${elementCount > 1 ? 's' : ''}`}
            </span>
          )}
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

      {/* Footer: variable assignments button */}
      {variables.length > 0 && (
        <div
          className="border-t border-border/50 px-3 py-1.5"
          onClick={e => e.stopPropagation()}
          onDoubleClick={e => e.stopPropagation()}
        >
          <Popover open={varPopoverOpen} onOpenChange={setVarPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center gap-1.5 text-[10px] w-full rounded px-1.5 py-1 transition-colors ${
                  assignmentCount > 0
                    ? 'text-[#8A7D4A] bg-[#B3AB86]/10 hover:bg-[#B3AB86]/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Variable className="h-3 w-3 flex-shrink-0" />
                {assignmentCount > 0
                  ? `${assignmentCount} variável${assignmentCount > 1 ? 'is' : ''} atribuída${assignmentCount > 1 ? 's' : ''}`
                  : 'Atribuir variáveis'}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              sideOffset={4}
              className="w-80 p-0"
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                <Variable className="h-4 w-4 text-[#8A7D4A]" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Atribuição de variáveis</p>
                  <p className="text-[10px] text-muted-foreground">Executado ao entrar nesta página</p>
                </div>
              </div>
              <div className="p-3">
                <VariableAssignPanel
                  assignments={page.variableAssignments || []}
                  variables={variables}
                  integrationNodes={integrationNodes}
                  allInputElements={allInputElements}
                  onChange={assignments => onChange({ variableAssignments: assignments })}
                  onCreateVariable={onCreateVariable}
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

export default memo(PageNode);
