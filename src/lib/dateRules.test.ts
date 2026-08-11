import { describe, expect, it } from 'vitest';
import {
  getDateRangeError,
  isDateWithinRange,
  monthHasSelectableDate,
  resolveDateRange,
  resolveInitialYear,
  yearHasSelectableDate,
} from './dateRules';

const NOW = new Date(2026, 7, 10, 12, 0, 0);

describe('dateRules', () => {
  it('recalcula idade mínima a partir do dia de preenchimento', () => {
    const range = resolveDateRange(
      undefined,
      { mode: 'relative', amount: 18, unit: 'years', direction: 'past' },
      NOW,
    );

    expect(range.maxDate?.getFullYear()).toBe(2008);
    expect(range.maxDate?.getMonth()).toBe(7);
    expect(range.maxDate?.getDate()).toBe(10);
    expect(isDateWithinRange(new Date(2008, 7, 10, 12), range)).toBe(true);
    expect(isDateWithinRange(new Date(2008, 7, 11, 12), range)).toBe(false);
  });

  it('combina limites fixos e relativos em um intervalo', () => {
    const range = resolveDateRange(
      { mode: 'fixed', fixedDate: '2026-08-15' },
      { mode: 'relative', amount: 90, unit: 'days', direction: 'future' },
      NOW,
    );

    expect(isDateWithinRange(new Date(2026, 7, 14, 12), range)).toBe(false);
    expect(isDateWithinRange(new Date(2026, 7, 15, 12), range)).toBe(true);
    expect(getDateRangeError(range)).toContain('entre 15/08/2026');
  });

  it('limita o ano inicial ao intervalo disponível', () => {
    const range = resolveDateRange(
      undefined,
      { mode: 'relative', amount: 18, unit: 'years', direction: 'past' },
      NOW,
    );

    expect(resolveInitialYear({ mode: 'current' }, range, NOW)).toBe(2008);
    expect(yearHasSelectableDate(2008, range)).toBe(true);
    expect(yearHasSelectableDate(2009, range)).toBe(false);
    expect(monthHasSelectableDate(2008, 7, range)).toBe(true);
    expect(monthHasSelectableDate(2008, 8, range)).toBe(false);
  });

  it.each(['2026-02-31', '2026-13-01', '2026-00-10'])('falha fechado para uma data fixa impossível: %s', (fixedDate) => {
    const range = resolveDateRange({ mode: 'fixed', fixedDate }, undefined, NOW);

    expect(range.invalid).toBe(true);
    expect(isDateWithinRange(new Date(2026, 7, 10, 12), range)).toBe(false);
    expect(getDateRangeError(range)).toBe('O intervalo de datas configurado é inválido.');
  });
});
