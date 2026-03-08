import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle } from 'lucide-react';

interface Props {
  isDisabled: boolean;
  onToggle: () => void;
}

/** Small switch shown in node headers to enable/disable the node */
export function NodeToggleSwitch({ isDisabled, onToggle }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="nodrag nopan"
          onClick={e => { e.stopPropagation(); onToggle(); }}
        >
          <Switch
            checked={!isDisabled}
            className="scale-[0.6] origin-center data-[state=unchecked]:bg-muted-foreground/30"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {isDisabled ? 'Nó desativado — clique para ativar' : 'Nó ativo — clique para desativar'}
      </TooltipContent>
    </Tooltip>
  );
}

/** Badge shown on disabled nodes */
export function DisabledBadge() {
  return (
    <span className="node-disabled-overlay text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      Desativado
    </span>
  );
}

/** Badge shown when node is part of an infinite loop */
export function LoopWarningBadge() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-warning bg-warning/15 px-1.5 py-0.5 rounded cursor-help">
          <AlertTriangle className="h-3 w-3" />
          Loop infinito
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        Este nó faz parte de um circuito que nunca alcança o fim do formulário. Adicione uma saída para evitar loops infinitos.
      </TooltipContent>
    </Tooltip>
  );
}
