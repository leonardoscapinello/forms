import { Handle, Position } from '@xyflow/react';
import { Clock, Trash2 } from 'lucide-react';
import { WaitNodeData, WaitUnit } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UNIT_LABELS: Record<WaitUnit, string> = {
  seconds: 'segundos',
  minutes: 'minutos',
  hours: 'horas',
};

interface Props {
  data: {
    nodeData: WaitNodeData;
    onChange: (patch: Partial<WaitNodeData>) => void;
    onDelete: () => void;
  };
}

export default function WaitNode({ data }: Props) {
  const { nodeData, onChange, onDelete } = data;

  return (
    <div className="bg-card rounded-xl border border-node-wait-accent/30 shadow-sm w-64 overflow-hidden">
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-node-wait-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-node-wait border-b border-node-wait-accent/20">
        <div className="h-6 w-6 rounded-md bg-node-wait-accent/20 flex items-center justify-center">
          <Clock className="h-3.5 w-3.5 text-node-wait-accent" />
        </div>
        <span className="text-sm font-medium text-foreground flex-1">
          {nodeData.label || 'Espera'}
        </span>
        <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Config */}
      <div className="p-3 flex items-center gap-2">
        <Input
          type="number"
          min={1}
          value={nodeData.duration || 5}
          onChange={e => onChange({ duration: Number(e.target.value) })}
          className="w-16 h-8 text-sm text-center"
        />
        <Select value={nodeData.unit || 'seconds'} onValueChange={(v: WaitUnit) => onChange({ unit: v })}>
          <SelectTrigger className="h-8 text-sm flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(UNIT_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-node-wait-accent !border-2 !border-card" />
    </div>
  );
}
