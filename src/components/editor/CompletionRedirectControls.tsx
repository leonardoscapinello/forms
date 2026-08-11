import type { FormVariable, IntegrationNodeData, TrackedParam } from '@/types/form';
import type { InputElementGroup } from './VariableAssignPanel';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VariableInput from '@/components/editor/shared/VariableInput';
import { resolveRedirectDestination } from '@/lib/redirectDestination';

interface Props {
  action?: 'thank_you' | 'redirect';
  redirectUrl?: string;
  onChange: (patch: { completionAction?: 'thank_you' | 'redirect'; completionRedirectUrl?: string }) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
  compact?: boolean;
}
export default function CompletionRedirectControls({
  action = 'thank_you',
  redirectUrl = '',
  onChange,
  variables = [],
  integrationNodes = [],
  allInputElements = [],
  trackedParams,
  compact = false,
}: Props) {
  const invalidDestination = action === 'redirect'
    && redirectUrl.trim().length > 0
    && !resolveRedirectDestination(redirectUrl, variables, {}, 'https://forms.example/preview');

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="space-y-1.5">
        <Label className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs'}>
          Depois do envio confirmado
        </Label>
        <Select
          value={action}
          onValueChange={value => onChange({ completionAction: value as 'thank_you' | 'redirect' })}
        >
          <SelectTrigger className={compact ? 'h-8 text-xs' : 'h-9 text-sm'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="thank_you">Mostrar tela de obrigado</SelectItem>
            <SelectItem value="redirect">Redirecionar para uma URL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {action === 'redirect' && (
        <div className="space-y-1.5">
          <Label className={compact ? 'text-[10px] text-muted-foreground' : 'text-xs'}>
            URL de destino
          </Label>
          <VariableInput
            value={redirectUrl}
            onChange={value => onChange({ completionRedirectUrl: value })}
            placeholder="https://site.com/obrigado/{{field:...}}"
            variables={variables}
            integrationNodes={integrationNodes}
            allInputElements={allInputElements}
            trackedParams={trackedParams}
            className={compact ? 'min-h-8 text-xs font-mono' : 'min-h-9 text-sm font-mono'}
          />
          <p className={invalidDestination ? 'text-[10px] text-destructive' : 'text-[10px] text-muted-foreground'}>
            {invalidDestination
              ? 'Use HTTPS ou /caminho-interno. O domínio não pode ser uma variável.'
              : 'Use o botão { } para inserir campos, variáveis, contexto, parâmetros GET e retornos de webhook.'}
          </p>
        </div>
      )}
    </div>
  );
}
