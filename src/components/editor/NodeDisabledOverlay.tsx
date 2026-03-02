import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
      Desativado
    </span>
  );
}
