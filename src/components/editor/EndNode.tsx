import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CheckCircle, ExternalLink } from 'lucide-react';
import type { FormData, FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import type { InputElementGroup } from './VariableAssignPanel';
import CompletionRedirectControls from './CompletionRedirectControls';

interface EndNodeData extends Record<string, unknown> {
  form: Pick<FormData, 'completionAction' | 'completionRedirectUrl'>;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
  onFormUpdate: (patch: Partial<FormData>) => void;
}

function EndNode({ selected, data }: NodeProps) {
  const nodeData = data as EndNodeData;
  const redirects = nodeData.form.completionAction === 'redirect';
  return (
    <div
      className={`w-80 rounded-xl border bg-card shadow-sm transition-all ${
        selected ? 'border-primary shadow-md ring-2 ring-primary/10' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-card" />
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
          {redirects
            ? <ExternalLink className="h-4 w-4 text-success" />
            : <CheckCircle className="h-4 w-4 text-success" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Fim do formulário</p>
          <p className="text-[10px] text-muted-foreground">
            {redirects ? 'Envia, anima e redireciona' : 'Envia e mostra o agradecimento'}
          </p>
        </div>
      </div>
      <div className="nodrag nopan nowheel px-3 py-3" onPointerDown={event => event.stopPropagation()}>
        <CompletionRedirectControls
          compact
          action={nodeData.form.completionAction}
          redirectUrl={nodeData.form.completionRedirectUrl}
          onChange={nodeData.onFormUpdate}
          variables={nodeData.variables}
          integrationNodes={nodeData.integrationNodes}
          allInputElements={nodeData.allInputElements}
          trackedParams={nodeData.trackedParams}
        />
      </div>
    </div>
  );
}

export default memo(EndNode);
