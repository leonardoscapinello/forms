import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import { Question } from '@/types/form';
import InlineAddMenu from './InlineAddMenu';

interface StartNodeData {
  onAdd: (question: Question) => void;
  onAddCondition: () => void;
}

function StartNode({ data, selected }: NodeProps & { data: StartNodeData }) {
  return (
    <div className="relative">
      <div
        className={`w-40 rounded-xl border bg-card shadow-sm text-center transition-all ${
          selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
        }`}
      >
        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-primary !border-2 !border-card" />
        <div className="flex items-center justify-center gap-2 px-4 py-4">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Play className="h-4 w-4 text-primary ml-0.5" />
          </div>
          <span className="text-sm font-medium text-foreground">Início</span>
        </div>
      </div>
      {/* Inline add button */}
      <div className="absolute -right-4 top-1/2 translate-x-full -translate-y-1/2 z-10">
        <InlineAddMenu onAdd={data.onAdd} onAddCondition={data.onAddCondition} size="sm" />
      </div>
    </div>
  );
}

export default memo(StartNode);
