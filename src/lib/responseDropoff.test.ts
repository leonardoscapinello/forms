import { describe, expect, it } from 'vitest';
import { calculatePageDropoff } from './responseDropoff';

const pages = [
  { id: 'a', index: 0, title: 'Contato' },
  { id: 'b', index: 1, title: 'Qualificação' },
  { id: 'c', index: 2, title: 'Final' },
];

describe('page response drop-off', () => {
  it('uses the last actual page visit and excludes completed responses', () => {
    const stats = calculatePageDropoff(pages, [
      { response_id: 'r1', page_id: 'a', page_index: 0, event_type: 'page_view', created_at: '2026-08-10T10:00:00Z' },
      { response_id: 'r1', page_id: 'b', page_index: 1, event_type: 'page_view', created_at: '2026-08-10T10:01:00Z' },
      { response_id: 'r2', page_id: 'a', page_index: 0, event_type: 'page_view', created_at: '2026-08-10T10:02:00Z' },
      { response_id: 'r3', page_id: 'a', page_index: 0, event_type: 'page_view', created_at: '2026-08-10T10:03:00Z' },
      { response_id: 'r3', page_id: 'c', page_index: 2, event_type: 'page_view', created_at: '2026-08-10T10:04:00Z' },
      { response_id: 'r3', page_id: null, page_index: null, event_type: 'form_complete', created_at: '2026-08-10T10:05:00Z' },
    ], [
      { response_id: 'r1', complete: false },
      { response_id: 'r2', complete: false },
      { response_id: 'r3', complete: true },
    ]);

    expect(stats).toEqual([
      expect.objectContaining({ id: 'a', reached: 3, dropoffs: 1, dropoffPercent: 33 }),
      expect.objectContaining({ id: 'b', reached: 1, dropoffs: 1, dropoffPercent: 100 }),
      expect.objectContaining({ id: 'c', reached: 1, dropoffs: 0, dropoffPercent: 0 }),
    ]);
  });

  it('handles conditional page skips without inventing intermediate visits', () => {
    const stats = calculatePageDropoff(pages, [
      { response_id: 'r1', page_id: 'a', page_index: 0, event_type: 'page_view', created_at: '2026-08-10T10:00:00Z' },
      { response_id: 'r1', page_id: 'c', page_index: 2, event_type: 'page_view', created_at: '2026-08-10T10:01:00Z' },
    ], [{ response_id: 'r1', complete: false }]);

    expect(stats.map(({ reached, dropoffs }) => ({ reached, dropoffs }))).toEqual([
      { reached: 1, dropoffs: 0 },
      { reached: 0, dropoffs: 0 },
      { reached: 1, dropoffs: 1 },
    ]);
  });

  it('uses last_page_index only as a legacy fallback', () => {
    const stats = calculatePageDropoff(pages, [], [
      { response_id: 'legacy', complete: false, lastPageIndex: 1 },
    ]);
    expect(stats[1]).toMatchObject({ reached: 1, dropoffs: 1, dropoffPercent: 100 });
  });
});
