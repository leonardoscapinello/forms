import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ImageIcon, Trash2, Settings, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ImageGenNodeData, FormVariable, IntegrationNodeData } from '@/types/form';
import type { InputElementGroup } from './VariableAssignPanel';
import { DisabledBadge } from './NodeDisabledOverlay';
import { lazy, Suspense } from 'react';

const ImageGenConfigDialog = lazy(() => import('./image-gen/ImageGenConfigDialog'));

export interface ImageGenNodeProps {
  nodeData: ImageGenNodeData;
  onChange: (patch: Partial<ImageGenNodeData>) => void;
  onDelete: () => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  onCreateVariable?: (variable: FormVariable) => void;
}

function ImageGenNode({ data, selected }: NodeProps & { data: ImageGenNodeProps & { isNodeDisabled?: boolean; onToggleDisabled?: () => void } }) {
  const { nodeData, onChange, onDelete, variables = [], allInputElements = [], isNodeDisabled = false, onCreateVariable } = data;
  const [dialogOpen, setDialogOpen] = useState(false);

  const outputVariable = variables.find(v => v.id === nodeData.outputVariableId);
  const layerCount = (nodeData.layers || []).length;
  const hasBg = !!nodeData.backgroundImage;
  const hasConfig = hasBg || layerCount > 0 || outputVariable;

  return (
    <>
      <div className={`relative rounded-xl border-2 bg-card shadow-sm w-[200px] transition-all ${
        isNodeDisabled ? 'opacity-50 grayscale'
        : selected
          ? 'border-node-imagegen-accent shadow-md ring-2 ring-node-imagegen-accent/20'
          : 'border-border hover:border-node-imagegen-accent/40'
      }`}>
        {isNodeDisabled && <DisabledBadge />}

        <Handle type="target" position={Position.Left} style={{ top: '50%' }} className="!w-2.5 !h-2.5 !bg-node-imagegen-accent !border-2 !border-card" />
        <Handle type="source" position={Position.Right} id="default" style={{ top: '50%' }} className="!w-2.5 !h-2.5 !bg-node-imagegen-accent !border-2 !border-card" />

        {/* Header */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-node-imagegen-accent/20 bg-node-imagegen rounded-t-xl">
          <ImageIcon className="h-3 w-3 text-node-imagegen-accent flex-shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-node-imagegen-accent flex-1">Imagem Dinâmica</span>

          <div className="flex items-center gap-0">
            {data.onToggleDisabled && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center" onClick={e => e.stopPropagation()}>
                      <Switch
                        checked={!isNodeDisabled}
                        onCheckedChange={() => data.onToggleDisabled?.()}
                        className="scale-[0.55] origin-center"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {isNodeDisabled ? 'Ativar nó' : 'Desativar nó'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button variant="ghost" size="icon" className="h-5 w-5 text-node-imagegen-accent/60 hover:text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-2 space-y-1.5" onClick={e => e.stopPropagation()}>
          {/* Preview thumbnail */}
          {hasBg ? (
            <div className="relative w-full h-16 rounded-md overflow-hidden border border-border/50 bg-muted/30">
              <img src={nodeData.backgroundImage} alt="" className="w-full h-full object-cover" />
              {layerCount > 0 && (
                <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-background/80 rounded-full px-1.5 py-0.5">
                  <Layers className="h-2.5 w-2.5 text-node-imagegen-accent" />
                  <span className="text-[9px] font-medium text-foreground">{layerCount}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-12 rounded-md border border-dashed border-border/50 bg-muted/10 flex items-center justify-center">
              <span className="text-[10px] text-muted-foreground">Sem imagem de fundo</span>
            </div>
          )}

          {/* Summary */}
          <div className="space-y-0.5">
            {layerCount > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {(nodeData.layers || []).filter(l => l.type === 'text').length} texto(s), {(nodeData.layers || []).filter(l => l.type === 'image').length} imagem(ns), {(nodeData.layers || []).filter(l => l.type === 'shape').length} forma(s)
              </p>
            )}
            {outputVariable && (
              <p className="text-[10px] text-muted-foreground truncate">
                Salvar em: <span className="font-mono text-node-imagegen-accent">{`{{${outputVariable.name}}}`}</span>
              </p>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-6 text-[10px] gap-1"
            onClick={() => setDialogOpen(true)}
          >
            <Settings className="h-3 w-3" />
            {hasConfig ? 'Configurar' : 'Configurar camadas'}
          </Button>
        </div>
      </div>

      {dialogOpen && (
        <Suspense fallback={null}>
          <ImageGenConfigDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            nodeData={nodeData}
            onChange={onChange}
            variables={variables}
            allInputElements={allInputElements}
            onCreateVariable={onCreateVariable}
          />
        </Suspense>
      )}
    </>
  );
}

export default memo(ImageGenNode);
