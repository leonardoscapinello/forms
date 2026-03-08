import { Handle, Position } from '@xyflow/react';
import { CornerDownRight, Trash2 } from 'lucide-react';
import { JumpNodeData, FunnelPage } from '@/types/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface Props {
  data: {
    nodeData: JumpNodeData;
    pages: FunnelPage[];
    onChange: (patch: Partial<JumpNodeData>) => void;
    onDelete: () => void;
  };
}

export default function JumpNode({ data }: Props & { data: Props['data'] & { isNodeDisabled?: boolean } }) {
  const { nodeData, pages, onChange, onDelete, isNodeDisabled = false } = data as any;

  return (
    <div className={`bg-card rounded-xl border border-node-jump-accent/30 shadow-sm w-64 overflow-hidden ${isNodeDisabled ? 'opacity-50 grayscale' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-node-jump border-b border-node-jump-accent/20 rounded-t-xl">
        <CornerDownRight className="h-3.5 w-3.5 text-node-jump-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-jump-accent">
          {nodeData.label || 'Pular para'}
        </span>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Page selector */}
      <div className="px-3 py-3 nodrag nopan nowheel" onPointerDown={e => e.stopPropagation()}>
        <Select value={nodeData.targetPageId || ''} onValueChange={(v: string) => onChange({ targetPageId: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecionar página..." />
          </SelectTrigger>
          <SelectContent>
            {pages.map((p: FunnelPage) => (
              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
