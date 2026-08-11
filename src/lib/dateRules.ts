import { addDays, addMonths, addYears, endOfDay, format, startOfDay } from 'date-fns';
import type { DateInitialYearRule, DateLimitRule } from '@/types/pageElements';

export interface ResolvedDateRange {
  minDate?: Date;
  maxDate?: Date;
  invalid: boolean;
}

function parseLocalDate(value?: string) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day) {
    return undefined;
  }
  return date;
}

export function resolveDateLimit(rule: DateLimitRule | undefined, now = new Date(), boundary: 'min' | 'max' = 'min') {
  if (!rule || rule.mode === 'none') return undefined;

  let resolved: Date | undefined;
  if (rule.mode === 'today') {
    resolved = now;
  } else if (rule.mode === 'fixed') {
    resolved = parseLocalDate(rule.fixedDate);
  } else if (rule.mode === 'relative') {
    const amount = Math.max(0, Math.trunc(Number(rule.amount) || 0));
    const signedAmount = rule.direction === 'future' ? amount : -amount;
    if (rule.unit === 'days') resolved = addDays(now, signedAmount);
    else if (rule.unit === 'months') resolved = addMonths(now, signedAmount);
    else resolved = addYears(now, signedAmount);
  }

  if (!resolved) return undefined;
  return boundary === 'max' ? endOfDay(resolved) : startOfDay(resolved);
}

export function resolveDateRange(
  minRule?: DateLimitRule,
  maxRule?: DateLimitRule,
  now = new Date(),
): ResolvedDateRange {
  const minDate = resolveDateLimit(minRule, now, 'min');
  const maxDate = resolveDateLimit(maxRule, now, 'max');
  const invalidMinRule = !!minRule && minRule.mode !== 'none' && !minDate;
  const invalidMaxRule = !!maxRule && maxRule.mode !== 'none' && !maxDate;
  return {
    minDate,
    maxDate,
    invalid: invalidMinRule
      || invalidMaxRule
      || (!!minDate && !!maxDate && minDate.getTime() > maxDate.getTime()),
  };
}

export function resolveInitialYear(
  rule: DateInitialYearRule | undefined,
  range: ResolvedDateRange,
  now = new Date(),
) {
  let year = now.getFullYear();
  if (rule?.mode === 'fixed' && Number.isFinite(rule.fixedYear)) {
    year = Math.trunc(rule.fixedYear as number);
  } else if (rule?.mode === 'relative') {
    const amount = Math.max(0, Math.trunc(Number(rule.amount) || 0));
    year += rule.direction === 'future' ? amount : -amount;
  }

  if (range.minDate) year = Math.max(year, range.minDate.getFullYear());
  if (range.maxDate) year = Math.min(year, range.maxDate.getFullYear());
  return year;
}

export function isDateWithinRange(date: Date, range: ResolvedDateRange) {
  if (Number.isNaN(date.getTime()) || range.invalid) return false;
  if (range.minDate && date.getTime() < range.minDate.getTime()) return false;
  if (range.maxDate && date.getTime() > range.maxDate.getTime()) return false;
  return true;
}

export function yearHasSelectableDate(year: number, range: ResolvedDateRange) {
  const first = startOfDay(new Date(year, 0, 1));
  const last = endOfDay(new Date(year, 11, 31));
  return (!range.minDate || last >= range.minDate) && (!range.maxDate || first <= range.maxDate) && !range.invalid;
}

export function monthHasSelectableDate(year: number, month: number, range: ResolvedDateRange) {
  const first = startOfDay(new Date(year, month, 1));
  const last = endOfDay(new Date(year, month + 1, 0));
  return (!range.minDate || last >= range.minDate) && (!range.maxDate || first <= range.maxDate) && !range.invalid;
}

export function getDateRangeError(range: ResolvedDateRange) {
  if (range.invalid) return 'O intervalo de datas configurado é inválido.';
  if (range.minDate && range.maxDate) {
    return `Escolha uma data entre ${format(range.minDate, 'dd/MM/yyyy')} e ${format(range.maxDate, 'dd/MM/yyyy')}.`;
  }
  if (range.minDate) return `Escolha uma data a partir de ${format(range.minDate, 'dd/MM/yyyy')}.`;
  if (range.maxDate) return `Escolha uma data até ${format(range.maxDate, 'dd/MM/yyyy')}.`;
  return 'Escolha uma data válida.';
}
