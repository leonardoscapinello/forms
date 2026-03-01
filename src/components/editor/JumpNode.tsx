import { Handle, Position } from '@xyflow/react';
import { CornerDownRight, Trash2 } from 'lucide-react';
import { JumpNodeData, FunnelPage } from '@/types/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  data: {
    nodeData: JumpNodeData;
    pages: FunnelPage[];
    onChange: (patch: Partial<JumpNodeData>) => void;
    onDelete: () => void;
  };
}

export default function JumpNode({ data }: Props) {
  const { nodeData, pages, onChange, onDelete } = data;

  return (
    <div className="bg-card rounded-xl border border-node-jump-accent/30 shadow-sm w-64 overflow-hidden">
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-jump-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-node-jump border-b border-node-jump-accent/20">
        <div className="h-6 w-6 rounded-md bg-node-jump-accent/20 flex items-center justify-center">
          <CornerDownRight className="h-3.5 w-3.5 text-node-jump-accent" />
        </div>
        <span className="text-sm font-medium text-foreground flex-1">
          {nodeData.label || 'Pular para'}
        </span>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Page selector */}
      <div className="p-3">
        <Select value={nodeData.targetPageId || ''} onValueChange={v => onChange({ targetPageId: v })}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Selecionar página..." />
          </SelectTrigger>
          <SelectContent>
            {pages.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* No source handle — jump redirects the flow */}
    </div>
  );
}
