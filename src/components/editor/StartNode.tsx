import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';

function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`w-40 rounded-xl border bg-card shadow-sm text-center transition-all ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
    >
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />
      <div className="flex items-center justify-center gap-2 px-4 py-4">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Play className="h-4 w-4 text-primary ml-0.5" />
        </div>
        <span className="text-sm font-medium text-foreground">Início</span>
      </div>
    </div>
  );
}

export default memo(StartNode);
