import { describe, expect, it } from 'vitest';
import {
  averageBoundedDuration,
  averageSessionDurationMs,
  formatAnalyticsDuration,
} from './analyticsTime';

describe('analytics time', () => {
  it('ignores invalid, negative and implausibly long sessions', () => {
    const sessions = [
      { started_at: '2026-08-10T10:00:00Z', completed_at: '2026-08-10T10:02:00Z' },
      { started_at: '2026-08-10T11:00:00Z', completed_at: '2026-08-10T10:00:00Z' },
      { started_at: '2026-08-01T10:00:00Z', completed_at: '2026-08-10T10:00:00Z' },
      { started_at: null, completed_at: null },
    ];
    expect(averageSessionDurationMs(sessions)).toBe(120_000);
  });

  it('formats long values compactly so KPI cards cannot overflow', () => {
    expect(formatAnalyticsDuration(500)).toBe('<1s');
    expect(formatAnalyticsDuration(125_000)).toBe('2m 5s');
    expect(formatAnalyticsDuration(3_780_000)).toBe('1h 3m');
    expect(formatAnalyticsDuration(183_600_000)).toBe('2d 3h');
  });

  it('filters corrupt page timing outliers before averaging', () => {
    expect(averageBoundedDuration([1_000, 3_000, -1, Number.NaN, 9_999_999], 60_000)).toBe(2_000);
  });
});
