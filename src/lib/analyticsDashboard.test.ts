import { describe, expect, it } from 'vitest';
import {
  calculateMetricChange,
  calculatePercentagePointChange,
  isAnalyticsDashboardRpcUnavailable,
  parseAnalyticsDashboard,
  selectAnalyticsDashboardView,
  summarizeDeliveryHealth,
  summarizePixelHealth,
} from './analyticsDashboard';

const payload = {
  generated_at: '2026-08-10T12:00:00Z',
  since: '2026-08-01T00:00:00Z',
  until: '2026-08-10T12:00:00Z',
  summary: {
    total_sessions: '15', completed_sessions: 9, incomplete_sessions: 6,
    active_sessions: 1, unique_leads: 9, completion_rate: '60.0',
    avg_duration_ms: 3_000, p50_duration_ms: 2_000, p95_duration_ms: 9_000,
    avg_pages_visited: '2.4', previous_total_sessions: 10,
    previous_completed_sessions: 5, previous_completion_rate: 50,
  },
  forms: [
    {
      form_id: 'a', title: 'A', total_sessions: 10, completed_sessions: 8,
      incomplete_sessions: 2, active_sessions: 1, unique_leads: 8,
      completion_rate: 80, avg_duration_ms: 2_000, p50_duration_ms: 1_500,
      p95_duration_ms: 5_000, avg_pages_visited: 3,
      previous_total_sessions: 8, previous_completed_sessions: 4,
      previous_completion_rate: 50, valid_duration_count: 8,
      duration_sum_ms: 16_000,
    },
    {
      form_id: 'b', title: 'B', total_sessions: 5, completed_sessions: 1,
      incomplete_sessions: 4, active_sessions: 0, unique_leads: 1,
      completion_rate: 20, avg_duration_ms: 11_000, p50_duration_ms: 11_000,
      p95_duration_ms: 11_000, avg_pages_visited: 1,
      previous_total_sessions: 2, previous_completed_sessions: 1,
      previous_completion_rate: 50, valid_duration_count: 1,
      duration_sum_ms: 11_000,
    },
  ],
  daily: [
    { form_id: 'a', date: '2026-08-10', sessions: 4, completed: 3 },
    { form_id: 'b', date: '2026-08-10', sessions: '2', completed: 1 },
  ],
  pages: [{
    form_id: 'a', page_id: 'p1', page_index: 0, page_title: 'Contato',
    reached: 10, dropoffs: 2, dropoff_percent: 20,
    avg_time_on_page_ms: 2_500, avg_hesitation_ms: 800, avg_interactions: 2.2,
  }],
  sources: [
    { form_id: 'a', source: 'google', sessions: 5, completed: 4 },
    { form_id: 'b', source: 'google', sessions: 2, completed: 1 },
  ],
  devices: [
    { form_id: 'a', device: 'mobile', sessions: 6, completed: 5 },
    { form_id: 'b', device: 'mobile', sessions: 2, completed: 1 },
  ],
  deliveries: [
    { form_id: 'a', delivery_type: 'google_sheets', status: 'delivered', total: 7, last_activity_at: '2026-08-09T12:00:00Z' },
    { form_id: 'b', delivery_type: 'google_sheets', status: 'delivered', total: 1, last_activity_at: '2026-08-10T12:00:00Z' },
  ],
  pixels: [
    { form_id: 'a', platform: 'meta_pixel', total: 8, fired_client: 8, fired_server: 7, last_activity_at: '2026-08-10T10:00:00Z' },
  ],
};

describe('analytics dashboard aggregate', () => {
  it('parses PostgREST numeric strings and rejects malformed roots', () => {
    expect(parseAnalyticsDashboard(null)).toBeNull();
    const parsed = parseAnalyticsDashboard(payload);
    expect(parsed?.summary).toMatchObject({ totalSessions: 15, completionRate: 60 });
    expect(parsed?.forms[0]).toMatchObject({ formId: 'a', validDurationCount: 8 });
  });

  it('filters a single form without leaking metrics from other forms', () => {
    const parsed = parseAnalyticsDashboard(payload)!;
    const view = selectAnalyticsDashboardView(parsed, 'a');
    expect(view.summary).toMatchObject({ totalSessions: 10, completedSessions: 8 });
    expect(view.daily).toEqual([{ date: '2026-08-10', sessions: 4, completed: 3 }]);
    expect(view.pages).toHaveLength(1);
    expect(view.sources[0]).toMatchObject({ source: 'google', sessions: 5, conversionRate: 80 });
  });

  it('combines non-PII global breakdowns and keeps the newest activity', () => {
    const parsed = parseAnalyticsDashboard(payload)!;
    const view = selectAnalyticsDashboardView(parsed, 'all');
    expect(view.daily).toEqual([{ date: '2026-08-10', sessions: 6, completed: 4 }]);
    expect(view.sources[0]).toMatchObject({ sessions: 7, completed: 5, conversionRate: 71.4 });
    expect(view.deliveries[0]).toMatchObject({ total: 8, lastActivityAt: '2026-08-10T12:00:00Z' });
  });

  it('does not invent an infinite trend when the previous period is empty', () => {
    expect(calculateMetricChange(10, 0)).toBeNull();
    expect(calculateMetricChange(0, 0)).toBe(0);
    expect(calculateMetricChange(12, 10)).toBe(20);
    expect(calculatePercentagePointChange(61.2, 58.1)).toBe(3.1);
  });

  it('falls back only when the aggregate function is absent from PostgREST', () => {
    expect(isAnalyticsDashboardRpcUnavailable({
      code: 'PGRST202',
      message: 'Could not find the function public.get_analytics_dashboard in the schema cache',
    })).toBe(true);
    expect(isAnalyticsDashboardRpcUnavailable({
      code: '42501',
      message: 'form_access_denied',
    })).toBe(false);
    expect(isAnalyticsDashboardRpcUnavailable({
      code: '57014',
      message: 'canceling statement due to statement timeout',
    })).toBe(false);
  });

  it('summarizes durable delivery and pixel health without hiding failures', () => {
    const parsed = parseAnalyticsDashboard(payload)!;
    const global = selectAnalyticsDashboardView(parsed, 'all');
    expect(summarizeDeliveryHealth([
      ...global.deliveries,
      { deliveryType: 'webhook', status: 'failed', total: 2, lastActivityAt: null },
      { deliveryType: 'webhook', status: 'dead_letter', total: 1, lastActivityAt: null },
    ])).toMatchObject({ total: 11, delivered: 8, retrying: 2, deadLetter: 1, successRate: 72.7 });
    expect(summarizePixelHealth(global.pixels)).toMatchObject({
      total: 8,
      firedClient: 8,
      firedServer: 7,
      missingClient: 0,
      missingServer: 1,
      clientRate: 100,
      serverRate: 87.5,
    });
  });
});
