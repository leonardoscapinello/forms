import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarRange, ChevronDown, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { resolveDateRange } from '@/lib/dateRules';
import type {
  DateInitialYearRule,
  DateLimitRule,
  DatePart,
  DateRestrictionPreset,
  PageElement,
} from '@/types/pageElements';

interface Props {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
}

interface LimitRowProps {
  label: string;
  rule: DateLimitRule;
  onChange: (rule: DateLimitRule) => void;
}

const DEFAULT_LIMIT: DateLimitRule = { mode: 'none' };
const DEFAULT_YEAR_RULE: DateInitialYearRule = { mode: 'current' };

const ORDER_OPTIONS: Array<{ value: string; label: string; order: DatePart[] }> = [
  { value: 'year-month-day', label: 'Ano → Mês → Dia', order: ['year', 'month', 'day'] },
  { value: 'day-month-year', label: 'Dia → Mês → Ano', order: ['day', 'month', 'year'] },
  { value: 'month-day-year', label: 'Mês → Dia → Ano', order: ['month', 'day', 'year'] },
  { value: 'month-year-day', label: 'Mês → Ano → Dia', order: ['month', 'year', 'day'] },
  { value: 'year-day-month', label: 'Ano → Dia → Mês', order: ['year', 'day', 'month'] },
  { value: 'day-year-month', label: 'Dia → Ano → Mês', order: ['day', 'year', 'month'] },
];

function normalizeAmount(value: string, fallback = 0) {
  if (value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function LimitRow({ label, rule, onChange }: LimitRowProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <Label className="text-xs font-medium">{label}</Label>
      <Select
        value={rule.mode}
        onValueChange={mode => onChange({ ...rule, mode: mode as DateLimitRule['mode'] })}
      >
        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem limite</SelectItem>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="fixed">Uma data específica</SelectItem>
          <SelectItem value="relative">Uma data que muda com o tempo</SelectItem>
        </SelectContent>
      </Select>

      {rule.mode === 'fixed' && (
        <Input
          type="date"
          value={rule.fixedDate || ''}
          onChange={event => onChange({ ...rule, fixedDate: event.target.value })}
          className="h-9 text-xs"
        />
      )}

      {rule.mode === 'relative' && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Calcular a partir do dia do preenchimento:</p>
          <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-2">
            <Input
              type="number"
              min={0}
              step={1}
              value={rule.amount ?? 1}
              onChange={event => onChange({ ...rule, amount: normalizeAmount(event.target.value, rule.amount ?? 1) })}
              className="h-9 text-xs"
              aria-label={`${label}: quantidade`}
            />
            <Select
              value={rule.unit || 'days'}
              onValueChange={unit => onChange({ ...rule, unit: unit as DateLimitRule['unit'] })}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="days">dias</SelectItem>
                <SelectItem value="months">meses</SelectItem>
                <SelectItem value="years">anos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select
            value={rule.direction || 'past'}
            onValueChange={direction => onChange({ ...rule, direction: direction as DateLimitRule['direction'] })}
          >
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="past">antes de hoje</SelectItem>
              <SelectItem value="future">depois de hoje</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

export default function DateFieldRulesEditor({ element, onChange }: Props) {
  const preset = element.dateRestrictionPreset || 'free';
  const minRule = element.dateMinRule || DEFAULT_LIMIT;
  const maxRule = element.dateMaxRule || DEFAULT_LIMIT;
  const initialYearRule = element.dateInitialYearRule || DEFAULT_YEAR_RULE;
  const selectionOrder = element.dateSelectionOrder?.length === 3
    ? element.dateSelectionOrder
    : (['year', 'month', 'day'] as DatePart[]);
  const resolvedRange = resolveDateRange(minRule, maxRule);

  const updateLimit = (key: 'dateMinRule' | 'dateMaxRule', rule: DateLimitRule) => {
    onChange({ [key]: rule, dateRestrictionPreset: 'custom' });
  };

  const applyPreset = (nextPreset: DateRestrictionPreset) => {
    if (nextPreset === 'free') {
      onChange({
        dateRestrictionPreset: nextPreset,
        dateMinRule: { mode: 'none' },
        dateMaxRule: { mode: 'none' },
        dateInitialYearRule: { mode: 'current' },
      });
      return;
    }
    if (nextPreset === 'past_or_today') {
      onChange({
        dateRestrictionPreset: nextPreset,
        dateMinRule: { mode: 'none' },
        dateMaxRule: { mode: 'today' },
        dateInitialYearRule: { mode: 'current' },
      });
      return;
    }
    if (nextPreset === 'future_or_today') {
      onChange({
        dateRestrictionPreset: nextPreset,
        dateMinRule: { mode: 'today' },
        dateMaxRule: { mode: 'none' },
        dateInitialYearRule: { mode: 'current' },
      });
      return;
    }
    if (nextPreset === 'minimum_age') {
      onChange({
        dateRestrictionPreset: nextPreset,
        dateMinRule: { mode: 'none' },
        dateMaxRule: { mode: 'relative', amount: 18, unit: 'years', direction: 'past' },
        dateInitialYearRule: { mode: 'current' },
        dateSelectionOrder: ['year', 'month', 'day'],
      });
      return;
    }

    const bothLimitsAreEmpty = minRule.mode === 'none' && maxRule.mode === 'none';
    onChange({
      dateRestrictionPreset: 'custom',
      ...(bothLimitsAreEmpty ? {
        dateMinRule: { mode: 'today' },
        dateMaxRule: { mode: 'relative', amount: 30, unit: 'days', direction: 'future' },
      } : {}),
    });
  };

  const updateMinimumAge = (value: string) => {
    const amount = normalizeAmount(value, 18);
    onChange({
      dateMaxRule: { mode: 'relative', amount, unit: 'years', direction: 'past' },
      dateInitialYearRule: { mode: 'current' },
    });
  };

  const summary = resolvedRange.invalid
    ? 'A primeira data permitida está depois da última. Corrija o intervalo.'
    : preset === 'minimum_age'
      ? `A pessoa precisará ter pelo menos ${maxRule.amount ?? 18} anos no dia do preenchimento.`
      : preset === 'past_or_today'
        ? 'A pessoa poderá escolher hoje ou qualquer data anterior.'
        : preset === 'future_or_today'
          ? 'A pessoa poderá escolher hoje ou qualquer data futura.'
          : preset === 'free'
            ? 'A pessoa poderá escolher qualquer data.'
            : resolvedRange.minDate && resolvedRange.maxDate
              ? `Hoje, o intervalo vai de ${format(resolvedRange.minDate, 'dd/MM/yyyy', { locale: ptBR })} até ${format(resolvedRange.maxDate, 'dd/MM/yyyy', { locale: ptBR })}.`
              : resolvedRange.minDate
                ? `Hoje, as datas começam em ${format(resolvedRange.minDate, 'dd/MM/yyyy', { locale: ptBR })}.`
                : resolvedRange.maxDate
                  ? `Hoje, as datas terminam em ${format(resolvedRange.maxDate, 'dd/MM/yyyy', { locale: ptBR })}.`
                  : 'A pessoa poderá escolher qualquer data.';

  return (
    <div className="space-y-4 rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <Label className="text-xs font-semibold">Quais datas podem ser escolhidas?</Label>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Escolha uma regra pronta. Você só verá campos extras quando forem necessários.
          </p>
        </div>
      </div>

      <Select value={preset} onValueChange={value => applyPreset(value as DateRestrictionPreset)}>
        <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Livre</SelectItem>
          <SelectItem value="past_or_today">Até hoje</SelectItem>
          <SelectItem value="future_or_today">A partir de hoje</SelectItem>
          <SelectItem value="minimum_age">Idade mínima (nascimento)</SelectItem>
          <SelectItem value="custom">Intervalo personalizado</SelectItem>
        </SelectContent>
      </Select>

      {preset === 'minimum_age' && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
          <Label className="text-xs">Qual é a idade mínima?</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              step={1}
              value={maxRule.amount ?? 18}
              onChange={event => updateMinimumAge(event.target.value)}
              className="h-9 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">anos</span>
          </div>
        </div>
      )}

      {preset === 'custom' && (
        <div className="space-y-2 rounded-lg bg-muted/20 p-2">
          <LimitRow
            label="Primeira data permitida"
            rule={minRule}
            onChange={rule => updateLimit('dateMinRule', rule)}
          />
          <LimitRow
            label="Última data permitida"
            rule={maxRule}
            onChange={rule => updateLimit('dateMaxRule', rule)}
          />
        </div>
      )}

      <div className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed',
        resolvedRange.invalid ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border bg-muted/20 text-muted-foreground',
      )}>
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{summary}</span>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Ordem mostrada para a pessoa</Label>
        <Select
          value={selectionOrder.join('-')}
          onValueChange={value => {
            const option = ORDER_OPTIONS.find(item => item.value === value);
            if (option) onChange({ dateSelectionOrder: option.order });
          }}
        >
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ORDER_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <details className="group rounded-lg border border-border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium text-foreground">
          Opções avançadas
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-border px-3 py-3">
          <div className="space-y-2">
            <Label className="text-xs">Ano exibido primeiro</Label>
            <Select
              value={initialYearRule.mode}
              onValueChange={mode => onChange({
                dateInitialYearRule: { ...initialYearRule, mode: mode as DateInitialYearRule['mode'] },
              })}
            >
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Automático (recomendado)</SelectItem>
                <SelectItem value="relative">Alguns anos atrás ou à frente</SelectItem>
                <SelectItem value="fixed">Um ano específico</SelectItem>
              </SelectContent>
            </Select>

            {initialYearRule.mode === 'relative' && (
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={initialYearRule.amount ?? 1}
                  onChange={event => onChange({
                    dateInitialYearRule: {
                      ...initialYearRule,
                      amount: normalizeAmount(event.target.value, initialYearRule.amount ?? 1),
                    },
                  })}
                  className="h-9 text-xs"
                  aria-label="Quantidade de anos para o ano inicial"
                />
                <Select
                  value={initialYearRule.direction || 'past'}
                  onValueChange={direction => onChange({
                    dateInitialYearRule: { ...initialYearRule, direction: direction as DateInitialYearRule['direction'] },
                  })}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="past">anos atrás</SelectItem>
                    <SelectItem value="future">anos à frente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {initialYearRule.mode === 'fixed' && (
              <Input
                type="number"
                min={1}
                max={9999}
                step={1}
                value={initialYearRule.fixedYear ?? new Date().getFullYear()}
                onChange={event => onChange({
                  dateInitialYearRule: {
                    ...initialYearRule,
                    fixedYear: Math.min(9999, Math.max(1, normalizeAmount(event.target.value, new Date().getFullYear()))),
                  },
                })}
                className="h-9 text-xs"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Mensagem para uma data não permitida</Label>
            <Input
              value={element.dateConstraintMessage || ''}
              onChange={event => onChange({ dateConstraintMessage: event.target.value })}
              placeholder="Usar a mensagem automática"
              className="h-9 text-xs"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
