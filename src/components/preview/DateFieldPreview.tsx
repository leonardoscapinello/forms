import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertCircle,
  CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getDateRangeError,
  isDateWithinRange,
  monthHasSelectableDate,
  resolveDateRange,
  resolveInitialYear,
  yearHasSelectableDate,
} from '@/lib/dateRules';
import type { DateInitialYearRule, DateLimitRule, DatePart } from '@/types/pageElements';

interface Props {
  value: any;
  onChange: (val: any) => void;
  dateMode?: 'date' | 'time' | 'datetime';
  dateFormat?: string;
  placeholder?: string;
  minRule?: DateLimitRule;
  maxRule?: DateLimitRule;
  initialYearRule?: DateInitialYearRule;
  selectionOrder?: DatePart[];
  constraintMessage?: string;
  error?: string | null;
  errorId?: string;
}

type DateStep = DatePart | 'time';

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STEP_LABELS: Record<DateStep, string> = {
  year: 'Ano',
  month: 'Mês',
  day: 'Dia',
  time: 'Hora',
};

const YEAR_PAGE_SIZE = 20;
const DEFAULT_ORDER: DatePart[] = ['year', 'month', 'day'];

function parseDate(value: unknown) {
  if (!value) return undefined;
  const date = value instanceof Date ? new Date(value) : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getYearPageStart(year: number) {
  return Math.floor(year / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE;
}

function normalizeSelectionOrder(order?: DatePart[]) {
  if (!order || order.length !== 3 || new Set(order).size !== 3) return DEFAULT_ORDER;
  if (!order.every(part => DEFAULT_ORDER.includes(part))) return DEFAULT_ORDER;
  return order;
}

export default function DateFieldPreview({
  value,
  onChange,
  dateMode = 'date',
  dateFormat = 'dd/MM/yyyy',
  placeholder,
  minRule,
  maxRule,
  initialYearRule,
  selectionOrder,
  constraintMessage,
  error,
  errorId,
}: Props) {
  const parsedDate = parseDate(value);
  const dateParts = normalizeSelectionOrder(selectionOrder);
  const dateRange = resolveDateRange(minRule, maxRule);
  const suggestedYear = resolveInitialYear(initialYearRule, dateRange);
  const initialDate = parsedDate ?? new Date(suggestedYear, new Date().getMonth(), new Date().getDate(), 12);
  const [open, setOpen] = useState(false);
  const [dateStep, setDateStep] = useState<DateStep>(dateMode === 'time' ? 'time' : dateParts[0]);
  const [completedParts, setCompletedParts] = useState<DatePart[]>([]);
  const [draftYear, setDraftYear] = useState(initialDate.getFullYear());
  const [draftMonth, setDraftMonth] = useState(initialDate.getMonth());
  const [draftDay, setDraftDay] = useState<number | null>(parsedDate?.getDate() ?? null);
  const [draftHours, setDraftHours] = useState(parsedDate?.getHours() ?? 12);
  const [draftMinutes, setDraftMinutes] = useState(parsedDate?.getMinutes() ?? 0);
  const [yearPageStart, setYearPageStart] = useState(getYearPageStart(initialDate.getFullYear()));
  const [selectionError, setSelectionError] = useState('');

  const formatDisplay = () => {
    if (!parsedDate) return null;
    try {
      if (dateMode === 'time') {
        return `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
      }
      const dateStr = format(parsedDate, dateFormat, { locale: ptBR });
      if (dateMode === 'datetime') {
        return `${dateStr} às ${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;
      }
      return dateStr;
    } catch {
      return format(parsedDate, 'dd/MM/yyyy', { locale: ptBR });
    }
  };

  const resetDraft = () => {
    const currentValue = parseDate(value);
    const currentRange = resolveDateRange(minRule, maxRule);
    const preferredYear = currentValue?.getFullYear() ?? resolveInitialYear(initialYearRule, currentRange);
    const now = new Date();
    setDraftYear(preferredYear);
    setDraftMonth(currentValue?.getMonth() ?? now.getMonth());
    setDraftDay(currentValue?.getDate() ?? null);
    setDraftHours(currentValue?.getHours() ?? 12);
    setDraftMinutes(currentValue?.getMinutes() ?? 0);
    setYearPageStart(getYearPageStart(preferredYear));
    setCompletedParts([]);
    setSelectionError(currentRange.invalid ? getDateRangeError(currentRange) : '');
    setDateStep(dateMode === 'time' ? 'time' : dateParts[0]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) resetDraft();
    setOpen(nextOpen);
  };

  const finalizeDate = (year: number, month: number, day: number) => {
    const currentRange = resolveDateRange(minRule, maxRule, new Date());
    const nextDate = new Date(year, month, day, draftHours, draftMinutes, 0, 0);
    const hasValidParts = nextDate.getFullYear() === year
      && nextDate.getMonth() === month
      && nextDate.getDate() === day;

    if (!hasValidParts) {
      setSelectionError(`${MONTHS[month]} de ${year} não possui o dia ${day}. Escolha outro dia.`);
      setDateStep('day');
      return;
    }
    if (!isDateWithinRange(nextDate, currentRange)) {
      setSelectionError(constraintMessage || getDateRangeError(currentRange));
      setDateStep('day');
      return;
    }

    setSelectionError('');
    onChange(nextDate.toISOString());
    if (dateMode === 'datetime') setDateStep('time');
    else setOpen(false);
  };

  const completePart = (part: DatePart, values: { year: number; month: number; day: number | null }) => {
    const nextCompleted = completedParts.includes(part) ? completedParts : [...completedParts, part];
    setCompletedParts(nextCompleted);
    setSelectionError('');

    if (nextCompleted.length === 3 && values.day !== null) {
      finalizeDate(values.year, values.month, values.day);
      return;
    }

    const nextPart = dateParts.find(candidate => !nextCompleted.includes(candidate));
    if (nextPart) setDateStep(nextPart);
  };

  const selectYear = (year: number) => {
    setDraftYear(year);
    completePart('year', { year, month: draftMonth, day: draftDay });
  };

  const selectMonth = (month: number) => {
    setDraftMonth(month);
    completePart('month', { year: draftYear, month, day: draftDay });
  };

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return;
    const selectedDay = day.getDate();
    setDraftDay(selectedDay);
    completePart('day', { year: draftYear, month: draftMonth, day: selectedDay });
  };

  const adjustTime = (type: 'hours' | 'minutes', delta: number) => {
    const nextHours = type === 'hours' ? (draftHours + delta + 24) % 24 : draftHours;
    const nextMinutes = type === 'minutes' ? (draftMinutes + delta + 60) % 60 : draftMinutes;
    setDraftHours(nextHours);
    setDraftMinutes(nextMinutes);

    const baseDay = draftDay ?? parsedDate?.getDate() ?? new Date().getDate();
    if (draftDay === null) setDraftDay(baseDay);
    const nextDate = new Date(draftYear, draftMonth, baseDay, nextHours, nextMinutes, 0, 0);
    onChange(nextDate.toISOString());
  };

  const confirmTime = () => {
    if (dateMode === 'time' && !parsedDate) {
      const baseDay = draftDay ?? new Date().getDate();
      onChange(new Date(draftYear, draftMonth, baseDay, draftHours, draftMinutes, 0, 0).toISOString());
    }
    setOpen(false);
  };

  const clearValue = () => {
    onChange(undefined);
    setOpen(false);
  };

  const showDateSteps = dateMode !== 'time';
  const showTime = dateMode === 'time' || dateStep === 'time';
  const title = dateMode === 'time' ? 'Selecione a hora' : dateMode === 'datetime' ? 'Selecione data e hora' : 'Selecione a data';
  const stepOrder: DateStep[] = dateMode === 'datetime' ? [...dateParts, 'time'] : dateParts;
  const currentStepIndex = stepOrder.indexOf(dateStep);
  const years = Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index);
  const selectedCalendarDate = draftDay === null
    ? undefined
    : new Date(draftYear, draftMonth, draftDay, draftHours, draftMinutes);
  const disabledDays = [
    ...(dateRange.minDate ? [{ before: dateRange.minDate }] : []),
    ...(dateRange.maxDate ? [{ after: dateRange.maxDate }] : []),
  ];
  const previousYearPageAvailable = Array.from(
    { length: YEAR_PAGE_SIZE },
    (_, index) => yearPageStart - YEAR_PAGE_SIZE + index,
  ).some(year => yearHasSelectableDate(year, dateRange));
  const nextYearPageAvailable = Array.from(
    { length: YEAR_PAGE_SIZE },
    (_, index) => yearPageStart + YEAR_PAGE_SIZE + index,
  ).some(year => yearHasSelectableDate(year, dateRange));
  const monthAndYearWereSelected = completedParts.includes('month') && completedParts.includes('year');

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        data-form-primary-control
        className={cn(
          'w-full flex items-center gap-3 bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg py-2 text-left transition-colors',
          !parsedDate && 'text-muted-foreground/40'
        )}
      >
        {dateMode === 'time' ? (
          <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <CalendarIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
        {parsedDate ? (
          <span className="text-foreground">{formatDisplay()}</span>
        ) : (
          <span>{placeholder || title}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] sm:max-w-[520px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            {showDateSteps && (
              <div className="flex items-center gap-2 pt-3" aria-label="Etapas da seleção da data">
                {stepOrder.map((step, index) => {
                  const active = step === dateStep;
                  const complete = step === 'time'
                    ? false
                    : completedParts.includes(step);
                  return (
                    <button
                      key={step}
                      type="button"
                      disabled={!active && !complete}
                      onClick={() => complete && setDateStep(step)}
                      className={cn(
                        'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                        active && 'border-primary bg-primary text-primary-foreground',
                        complete && !active && 'border-primary/25 bg-primary/5 text-foreground',
                        !active && !complete && 'border-border text-muted-foreground',
                      )}
                    >
                      {complete && !active ? <Check className="h-3.5 w-3.5" /> : <span>{index + 1}</span>}
                      <span>{STEP_LABELS[step]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </DialogHeader>

          {selectionError && (
            <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{selectionError}</span>
            </div>
          )}

          <div className={cn('flex flex-col overflow-y-auto', showDateSteps ? 'h-[410px]' : 'min-h-[280px]')}>
          {dateStep === 'year' && (
            <div className="flex flex-1 flex-col px-6 pb-6">
              <div className="mb-4 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Anos anteriores"
                  disabled={!previousYearPageAvailable}
                  onClick={() => setYearPageStart(start => start - YEAR_PAGE_SIZE)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <p className="text-sm font-semibold text-foreground">
                  {yearPageStart}–{yearPageStart + YEAR_PAGE_SIZE - 1}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Próximos anos"
                  disabled={!nextYearPageAvailable}
                  onClick={() => setYearPageStart(start => start + YEAR_PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">Etapa {currentStepIndex + 1}: escolha o ano.</p>
              <div className="grid flex-1 auto-rows-fr grid-cols-4 gap-2">
                {years.map(year => {
                  const available = yearHasSelectableDate(year, dateRange);
                  return (
                    <button
                      key={year}
                      type="button"
                      disabled={!available}
                      onClick={() => selectYear(year)}
                      className={cn(
                        'h-full min-h-10 rounded-lg border text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-30',
                        year === draftYear && available ? 'border-primary bg-primary text-primary-foreground hover:bg-primary' : 'border-border bg-background text-foreground',
                      )}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dateStep === 'month' && (
            <div className="flex flex-1 flex-col px-6 pb-6">
              <p className="mb-1 text-sm font-semibold text-foreground">{draftYear}</p>
              <p className="mb-4 text-xs text-muted-foreground">Etapa {currentStepIndex + 1}: escolha o mês.</p>
              <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-2">
                {MONTHS.map((month, index) => {
                  const available = monthHasSelectableDate(draftYear, index, dateRange);
                  return (
                    <button
                      key={month}
                      type="button"
                      disabled={!available}
                      onClick={() => selectMonth(index)}
                      className={cn(
                        'h-full min-h-11 rounded-lg border px-2 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-30',
                        index === draftMonth && available ? 'border-primary bg-primary text-primary-foreground hover:bg-primary' : 'border-border bg-background text-foreground',
                      )}
                    >
                      {month}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {dateStep === 'day' && (
            <div className="flex-1 px-6 pb-4">
              <p className="text-sm font-semibold text-foreground">{MONTHS[draftMonth]} de {draftYear}</p>
              <p className="pt-1 text-xs text-muted-foreground">
                Etapa {currentStepIndex + 1}: escolha o dia.
                {!monthAndYearWereSelected && ' O mês e o ano exibidos são uma referência temporária.'}
              </p>
              <div className="flex w-full justify-center pt-2">
                <Calendar
                  mode="single"
                  month={new Date(draftYear, draftMonth, 1)}
                  selected={selectedCalendarDate}
                  onSelect={handleDateSelect}
                  locale={ptBR}
                  disabled={dateRange.invalid ? true : disabledDays}
                  disableNavigation
                  showOutsideDays={false}
                  initialFocus
                  className="w-full p-3 pointer-events-auto"
                  classNames={{
                    months: 'w-full',
                    month: 'w-full space-y-4',
                    table: 'w-full border-collapse',
                    head_row: 'grid grid-cols-7',
                    head_cell: 'w-full rounded-md text-center text-[0.8rem] font-normal text-muted-foreground',
                    row: 'mt-2 grid w-full grid-cols-7',
                    cell: 'relative h-10 w-full p-0 text-center text-sm focus-within:z-20',
                    day: 'h-10 w-full rounded-lg p-0 font-normal aria-selected:opacity-100',
                  }}
                />
              </div>
            </div>
          )}

          {showTime && (
            <div className="flex flex-1 flex-col justify-center bg-muted/30 px-6 py-5">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Horário
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col items-center gap-1">
                  <button type="button" aria-label="Aumentar hora" onClick={() => adjustTime('hours', 1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <div className="w-16 h-14 rounded-xl bg-background border-2 border-border flex items-center justify-center text-2xl font-bold text-foreground tabular-nums">
                    {String(draftHours).padStart(2, '0')}
                  </div>
                  <button type="button" aria-label="Diminuir hora" onClick={() => adjustTime('hours', -1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>

                <span className="text-3xl font-bold text-muted-foreground mt-[-2px]">:</span>

                <div className="flex flex-col items-center gap-1">
                  <button type="button" aria-label="Aumentar minutos" onClick={() => adjustTime('minutes', 5)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <div className="w-16 h-14 rounded-xl bg-background border-2 border-border flex items-center justify-center text-2xl font-bold text-foreground tabular-nums">
                    {String(draftMinutes).padStart(2, '0')}
                  </div>
                  <button type="button" aria-label="Diminuir minutos" onClick={() => adjustTime('minutes', -5)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center gap-2">
            {showDateSteps && currentStepIndex > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setDateStep(stepOrder[currentStepIndex - 1])}>
                Voltar
              </Button>
            )}
            <div className="flex-1" />
            {parsedDate && (
              <Button type="button" variant="ghost" size="sm" onClick={clearValue}>
                Limpar
              </Button>
            )}
            {showTime && (
              <Button type="button" size="sm" onClick={confirmTime}>
                Confirmar
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
