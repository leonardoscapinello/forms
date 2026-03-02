import { Handle, Position } from '@xyflow/react';
import { GitMerge, Plus, Trash2 } from 'lucide-react';
import { ABTestNodeData, ABTestVariant } from '@/types/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  data: {
    nodeData: ABTestNodeData;
    onChange: (patch: Partial<ABTestNodeData>) => void;
    onDelete: () => void;
  };
}

export default function ABTestNode({ data }: Props & { data: Props['data'] & { isNodeDisabled?: boolean } }) {
  const { nodeData, onChange, onDelete, isNodeDisabled = false } = data as any;
  const variants = nodeData.variants || [
    { id: crypto.randomUUID(), label: 'A', weight: 50 },
    { id: crypto.randomUUID(), label: 'B', weight: 50 },
  ];

  const updateVariant = (id: string, patch: Partial<ABTestVariant>) => {
    onChange({ variants: variants.map((v: ABTestVariant) => v.id === id ? { ...v, ...patch } : v) });
  };

  const addVariant = () => {
    const newVariant: ABTestVariant = {
      id: crypto.randomUUID(),
      label: String.fromCharCode(65 + variants.length),
      weight: 0,
    };
    const count = variants.length + 1;
    const weight = Math.floor(100 / count);
    const updated = [...variants.map((v: ABTestVariant) => ({ ...v, weight })), { ...newVariant, weight }];
    const diff = 100 - updated.reduce((s: number, v: ABTestVariant) => s + v.weight, 0);
    if (diff !== 0) updated[0].weight += diff;
    onChange({ variants: updated });
  };

  const removeVariant = (id: string) => {
    if (variants.length <= 2) return;
    const remaining = variants.filter((v: ABTestVariant) => v.id !== id);
    const weight = Math.floor(100 / remaining.length);
    const updated = remaining.map((v: ABTestVariant) => ({ ...v, weight }));
    const diff = 100 - updated.reduce((s: number, v: ABTestVariant) => s + v.weight, 0);
    if (diff !== 0) updated[0].weight += diff;
    onChange({ variants: updated });
  };

  return (
    <div className={`bg-card rounded-xl border border-node-abtest-accent/30 shadow-sm w-72 overflow-hidden ${isNodeDisabled ? 'opacity-50 grayscale' : ''}`}>
      <Handle type="target" position={Position.Left} style={{ top: 18 }} className="!w-3 !h-3 !bg-node-abtest-accent !border-2 !border-card" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-node-abtest border-b border-node-abtest-accent/20 rounded-t-xl">
        <GitMerge className="h-3.5 w-3.5 text-node-abtest-accent" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-node-abtest-accent">
          {nodeData.label || 'Teste A/B'}
        </span>
        <div className="ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Variants */}
      <div className="px-3 py-3 space-y-2 nodrag nopan nowheel" onPointerDown={e => e.stopPropagation()}>
        {variants.map((variant: ABTestVariant, i: number) => (
          <div key={variant.id} className="flex items-center gap-2">
            <span className="text-xs font-semibold text-node-abtest-accent w-4">{variant.label}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-node-abtest-accent/60 rounded-full transition-all"
                style={{ width: `${variant.weight}%` }}
              />
            </div>
            <Input
              type="number"
              min={0}
              max={100}
              value={variant.weight}
              onChange={e => updateVariant(variant.id, { weight: Number(e.target.value) })}
              className="w-14 h-7 text-xs text-center px-1"
            />
            <span className="text-xs text-muted-foreground">%</span>
            {variants.length > 2 && (
              <button onClick={() => removeVariant(variant.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={`ab-${variant.id}`}
              className="!w-3 !h-3 !bg-node-abtest-accent !border-2 !border-card"
              style={{ top: `${68 + i * 40}px` }}
            />
          </div>
        ))}
        {variants.length < 5 && (
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs text-muted-foreground" onClick={addVariant}>
            <Plus className="h-3 w-3 mr-1" /> Adicionar variante
          </Button>
        )}
      </div>
    </div>
  );
}
