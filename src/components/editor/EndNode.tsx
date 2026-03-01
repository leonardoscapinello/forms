import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CheckCircle } from 'lucide-react';

function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`w-40 rounded-xl border bg-card shadow-sm text-center transition-all ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#B3AB86', borderColor: 'hsl(var(--card))' }} className="!w-3 !h-3 !border-2" />
      <div className="flex items-center justify-center gap-2 px-4 py-4">
        <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
          <CheckCircle className="h-4 w-4 text-success" />
        </div>
        <span className="text-sm font-medium text-foreground">Fim</span>
      </div>
    </div>
  );
}

export default memo(EndNode);
