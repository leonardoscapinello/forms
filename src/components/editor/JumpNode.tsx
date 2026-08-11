import { Handle, Position } from '@xyflow/react';
import { CornerDownRight, ExternalLink, Trash2 } from 'lucide-react';
import { JumpNodeData, FunnelPage, FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import VariableInput from './shared/VariableInput';
import type { InputElementGroup } from './VariableAssignPanel';

interface Props {
  data: {
    nodeData: JumpNodeData;
    pages: FunnelPage[];
    variables?: FormVariable[];
    integrationNodes?: IntegrationNodeData[];
    allInputElements?: InputElementGroup[];
    trackedParams?: TrackedParam[];
    onChange: (patch: Partial<JumpNodeData>) => void;
    onDelete: () => void;
  };
}

export default function JumpNode({ data }: Props & { data: Props['data'] & { isNodeDisabled?: boolean } }) {
  const {
    nodeData,
    pages,
    variables = [],
    integrationNodes = [],
    allInputElements = [],
    trackedParams,
    onChange,
    onDelete,
    isNodeDisabled = false,
  } = data;
  const destinationType = nodeData.destinationType || (nodeData.redirectUrl ? 'url' : 'page');

  return (
    <div className={`bg-card rounded-xl border border-node-jump-accent/30 shadow-sm w-72 overflow-hidden ${isNodeDisabled ? 'opacity-50 grayscale' : ''}`}>
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

      <div className="px-3 py-3 nodrag nopan nowheel space-y-2" onPointerDown={e => e.stopPropagation()}>
        <Select
          value={destinationType}
          onValueChange={(value: 'page' | 'url') => onChange({ destinationType: value })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">Pular para outra página</SelectItem>
            <SelectItem value="url">Concluir e redirecionar</SelectItem>
          </SelectContent>
        </Select>

        {destinationType === 'page' ? (
          <Select value={nodeData.targetPageId || ''} onValueChange={(value: string) => onChange({ targetPageId: value })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar página..." />
            </SelectTrigger>
            <SelectContent>
              {pages.map((page: FunnelPage) => (
                <SelectItem key={page.id} value={page.id}>{page.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <ExternalLink className="h-3 w-3" /> URL após confirmação do envio
            </div>
            <VariableInput
              value={nodeData.redirectUrl || ''}
              onChange={redirectUrl => onChange({ redirectUrl })}
              placeholder="https://site.com/{{field:...}}"
              variables={variables}
              integrationNodes={integrationNodes}
              allInputElements={allInputElements}
              trackedParams={trackedParams}
              className="min-h-8 text-xs font-mono"
            />
            <p className="text-[9px] leading-snug text-muted-foreground">
              HTTPS ou /caminho-interno. O redirecionamento ocorre só depois que a resposta for confirmada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
