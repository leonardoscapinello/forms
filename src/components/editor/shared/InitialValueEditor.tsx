import { useEffect, useMemo, useState } from 'react';
import { Braces, Link2, Type } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { PageElement } from '@/types/pageElements';
import { DEFAULT_TRACKED_PARAMS, type FormVariable, type IntegrationNodeData, type TrackedParam } from '@/types/form';
import type { InputElementGroup } from '../VariableAssignPanel';
import {
  buildPrefillParameterToken,
  inferPrefillSourceMode,
  isAllowedPrefillParameterKey,
  normalizePrefillParameterKeyInput,
  readPrefillParameterKey,
  type PrefillSourceMode,
} from '@/lib/prefillSource';
import VariableInput from './VariableInput';

interface Props {
  element: PageElement;
  onChange: (value: unknown | undefined) => void;
  variables?: FormVariable[];
  integrationNodes?: IntegrationNodeData[];
  allInputElements?: InputElementGroup[];
  trackedParams?: TrackedParam[];
}

const SOURCE_OPTIONS: Array<{
  mode: PrefillSourceMode;
  label: string;
  icon: typeof Type;
}> = [
  { mode: 'literal', label: 'Valor fixo', icon: Type },
  { mode: 'reference', label: 'Variável', icon: Braces },
  { mode: 'param', label: 'Parâmetro GET', icon: Link2 },
];

const NUMBER_TYPES = new Set<PageElement['type']>([
  'input_number',
  'input_height',
  'input_weight',
  'input_rating',
  'input_nps',
]);

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function literalPlaceholder(element: PageElement): string {
  switch (element.type) {
    case 'input_email': return 'nome@empresa.com';
    case 'input_phone': return '+55 11 98765-4321';
    case 'input_date': return element.dateMode === 'time' ? '14:30' : '2026-08-11';
    case 'input_number': return '0';
    case 'input_height': return '170';
    case 'input_weight': return '70';
    case 'input_yes_no': return 'sim ou não';
    case 'input_multi_select': return 'Opção 1, Opção 2';
    case 'input_document': return 'CPF, CNPJ ou passaporte';
    case 'input_company': return 'CNPJ';
    default: return 'Digite o valor inicial';
  }
}

export default function InitialValueEditor({
  element,
  onChange,
  variables = [],
  integrationNodes = [],
  allInputElements = [],
  trackedParams,
}: Props) {
  const [mode, setMode] = useState<PrefillSourceMode>(() => inferPrefillSourceMode(element.defaultValue));
  const [parameterKey, setParameterKey] = useState(() => readPrefillParameterKey(element.defaultValue) || '');

  useEffect(() => {
    const detectedKey = readPrefillParameterKey(element.defaultValue);
    if (detectedKey) {
      setMode('param');
      setParameterKey(detectedKey);
    }
  }, [element.defaultValue]);

  const activeParams = useMemo(
    () => (trackedParams ?? DEFAULT_TRACKED_PARAMS).filter(parameter => parameter.enabled && parameter.key),
    [trackedParams],
  );

  const selectMode = (nextMode: PrefillSourceMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setParameterKey('');
    onChange(undefined);
  };

  const updateParameterKey = (rawValue: string) => {
    const normalized = normalizePrefillParameterKeyInput(rawValue);
    setParameterKey(normalized);
    onChange(buildPrefillParameterToken(normalized));
  };

  const parameterInvalid = parameterKey.length > 0 && !isAllowedPrefillParameterKey(parameterKey);
  const serializedValue = serializeValue(element.defaultValue);

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3" data-initial-value-editor>
      <div className="space-y-1">
        <Label>Valor inicial (pré-preenchimento)</Label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Preenche apenas campos ainda vazios. Uma resposta retomada ou digitada pelo usuário nunca é sobrescrita.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Origem do valor inicial">
        {SOURCE_OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => (
          <button
            key={optionMode}
            type="button"
            aria-pressed={mode === optionMode}
            onClick={() => selectMode(optionMode)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-2 text-[10px] font-medium leading-tight transition-colors ${
              mode === optionMode
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {mode === 'literal' && (
        element.type === 'input_checkbox' ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2.5">
            <div>
              <Label className="text-xs">Iniciar marcado</Label>
              <p className="text-[10px] text-muted-foreground">Use apenas quando não representar consentimento.</p>
            </div>
            <Switch
              checked={element.defaultValue === true}
              onCheckedChange={checked => onChange(checked || undefined)}
              aria-label="Iniciar checkbox marcado"
            />
          </div>
        ) : (
          <Input
            type={NUMBER_TYPES.has(element.type) ? 'number' : element.type === 'input_email' ? 'email' : element.type === 'input_phone' ? 'tel' : 'text'}
            value={serializedValue}
            onChange={event => onChange(event.target.value || undefined)}
            placeholder={literalPlaceholder(element)}
            className="h-9 text-xs"
            aria-label="Valor inicial fixo"
          />
        )
      )}

      {mode === 'reference' && (
        <div className="space-y-1.5">
          <VariableInput
            value={serializedValue}
            onChange={value => onChange(value || undefined)}
            placeholder="Escolha ou digite uma variável"
            variables={variables}
            integrationNodes={integrationNodes}
            allInputElements={allInputElements}
            trackedParams={trackedParams}
          />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Use uma variável, um campo anterior, contexto ou retorno de integração. Também é possível combinar texto e referências.
          </p>
        </div>
      )}

      {mode === 'param' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`prefill-param-${element.id}`} className="text-[11px]">Nome do parâmetro GET</Label>
            <Input
              id={`prefill-param-${element.id}`}
              value={parameterKey}
              onChange={event => updateParameterKey(event.target.value)}
              placeholder="telefone"
              className="h-9 font-mono text-xs"
              aria-invalid={parameterInvalid}
              aria-describedby={`prefill-param-help-${element.id}`}
            />
          </div>
          {activeParams.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Parâmetros GET configurados">
              {activeParams.slice(0, 8).map(parameter => (
                <button
                  key={parameter.id}
                  type="button"
                  onClick={() => updateParameterKey(parameter.key)}
                  className="rounded-full border border-border bg-background px-2 py-1 font-mono text-[9px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {parameter.key}
                </button>
              ))}
            </div>
          )}
          <p id={`prefill-param-help-${element.id}`} className={`text-[10px] leading-relaxed ${parameterInvalid ? 'text-destructive' : 'text-muted-foreground'}`} aria-live="polite">
            {parameterInvalid
              ? 'Use até 100 caracteres: letras, números, ponto, hífen, sublinhado, dois-pontos ou colchetes.'
              : <>Exemplo: <code className="rounded bg-muted px-1 font-mono">?{parameterKey || 'telefone'}=valor</code>. O valor será decodificado uma única vez.</>}
          </p>
          {(element.type === 'input_phone' || element.type === 'input_email' || element.label?.toLowerCase().includes('nome')) && (
            <p className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-800 dark:text-amber-200">
              Dados pessoais ficam visíveis na URL e no histórico do navegador. Quando possível, prefira um identificador opaco no link.
            </p>
          )}
        </div>
      )}

      {element.type === 'input_phone' && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Depois de resolver o valor, o formulário identifica o DDI quando presente e aplica país, máscara e validação antes de permitir o avanço.
        </p>
      )}
      {element.type === 'input_email' && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          O e-mail pré-preenchido continua sujeito à validação de formato e à validação inteligente configurada no campo.
        </p>
      )}
    </div>
  );
}
