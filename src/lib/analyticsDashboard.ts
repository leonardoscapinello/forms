export type AnalyticsSummary = {
  totalSessions: number;
  completedSessions: number;
  incompleteSessions: number;
  activeSessions: number;
  uniqueLeads: number;
  completionRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  avgPagesVisited: number;
  previousTotalSessions: number;
  previousCompletedSessions: number;
  previousCompletionRate: number;
};

export type AnalyticsFormMetric = AnalyticsSummary & {
  formId: string;
  title: string;
  validDurationCount: number;
  durationSumMs: number;
};

export type AnalyticsDailyMetric = {
  formId: string;
  date: string;
  sessions: number;
  completed: number;
};

export type AnalyticsPageMetric = {
  formId: string;
  pageId: string | null;
  pageIndex: number | null;
  pageTitle: string;
  reached: number;
  dropoffs: number;
  dropoffPercent: number;
  avgTimeOnPageMs: number;
  avgHesitationMs: number;
  avgInteractions: number;
};

export type AnalyticsSourceMetric = {
  formId: string;
  source: string;
  sessions: number;
  completed: number;
};

export type AnalyticsDeviceMetric = {
  formId: string;
  device: 'desktop' | 'mobile' | 'tablet';
  sessions: number;
  completed: number;
};

export type AnalyticsDeliveryMetric = {
  formId: string;
  deliveryType: string;
  status: 'processing' | 'delivered' | 'failed' | 'dead_letter' | string;
  total: number;
  lastActivityAt: string | null;
};

export type AnalyticsPixelMetric = {
  formId: string;
  platform: string;
  total: number;
  firedClient: number;
  firedServer: number;
  lastActivityAt: string | null;
};

export type AnalyticsDashboardData = {
  generatedAt: string;
  since: string;
  until: string;
  summary: AnalyticsSummary;
  forms: AnalyticsFormMetric[];
  daily: AnalyticsDailyMetric[];
  pages: AnalyticsPageMetric[];
  sources: AnalyticsSourceMetric[];
  devices: AnalyticsDeviceMetric[];
  deliveries: AnalyticsDeliveryMetric[];
  pixels: AnalyticsPixelMetric[];
};

export type AnalyticsDashboardView = {
  summary: AnalyticsSummary;
  daily: Array<{ date: string; sessions: number; completed: number }>;
  pages: AnalyticsPageMetric[];
  sources: Array<{ source: string; sessions: number; completed: number; conversionRate: number }>;
  devices: Array<{ device: AnalyticsDeviceMetric['device']; sessions: number; completed: number; conversionRate: number }>;
  deliveries: Array<{ deliveryType: string; status: string; total: number; lastActivityAt: string | null }>;
  pixels: Array<{ platform: string; total: number; firedClient: number; firedServer: number; lastActivityAt: string | null }>;
};

export type AnalyticsDeliveryHealth = {
  total: number;
  delivered: number;
  processing: number;
  retrying: number;
  deadLetter: number;
  successRate: number;
};

export type AnalyticsPixelHealth = {
  total: number;
  firedClient: number;
  firedServer: number;
  missingClient: number;
  missingServer: number;
  clientRate: number;
  serverRate: number;
};

const EMPTY_SUMMARY: AnalyticsSummary = {
  totalSessions: 0,
  completedSessions: 0,
  incompleteSessions: 0,
  activeSessions: 0,
  uniqueLeads: 0,
  completionRate: 0,
  avgDurationMs: 0,
  p50DurationMs: 0,
  p95DurationMs: 0,
  avgPagesVisited: 0,
  previousTotalSessions: 0,
  previousCompletedSessions: 0,
  previousCompletionRate: 0,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function number(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function nullableInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseSummary(value: unknown): AnalyticsSummary {
  const source = record(value) || {};
  return {
    totalSessions: number(source.total_sessions),
    completedSessions: number(source.completed_sessions),
    incompleteSessions: number(source.incomplete_sessions),
    activeSessions: number(source.active_sessions),
    uniqueLeads: number(source.unique_leads),
    completionRate: number(source.completion_rate),
    avgDurationMs: number(source.avg_duration_ms),
    p50DurationMs: number(source.p50_duration_ms),
    p95DurationMs: number(source.p95_duration_ms),
    avgPagesVisited: number(source.avg_pages_visited),
    previousTotalSessions: number(source.previous_total_sessions),
    previousCompletedSessions: number(source.previous_completed_sessions),
    previousCompletionRate: number(source.previous_completion_rate),
  };
}

/**
 * Treat the RPC payload as untrusted input. PostgREST serializes bigint/numeric
 * values differently depending on its version, so numeric strings are accepted
 * while NaN, infinity and negative counters are normalized to zero.
 */
export function parseAnalyticsDashboard(value: unknown): AnalyticsDashboardData | null {
  const source = record(value);
  if (!source) return null;

  const generatedAt = text(source.generated_at);
  const since = text(source.since);
  const until = text(source.until);
  if (!generatedAt || !since || !until) return null;

  const forms = list(source.forms).flatMap((item): AnalyticsFormMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id)) return [];
    return [{
      ...parseSummary(row),
      formId: text(row.form_id),
      title: text(row.title, 'Formulário'),
      validDurationCount: number(row.valid_duration_count),
      durationSumMs: number(row.duration_sum_ms),
    }];
  });

  const daily = list(source.daily).flatMap((item): AnalyticsDailyMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id) || !text(row.date)) return [];
    return [{
      formId: text(row.form_id),
      date: text(row.date),
      sessions: number(row.sessions),
      completed: number(row.completed),
    }];
  });

  const pages = list(source.pages).flatMap((item): AnalyticsPageMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id)) return [];
    return [{
      formId: text(row.form_id),
      pageId: nullableText(row.page_id),
      pageIndex: nullableInteger(row.page_index),
      pageTitle: text(row.page_title, `Página ${(nullableInteger(row.page_index) ?? 0) + 1}`),
      reached: number(row.reached),
      dropoffs: number(row.dropoffs),
      dropoffPercent: number(row.dropoff_percent),
      avgTimeOnPageMs: number(row.avg_time_on_page_ms),
      avgHesitationMs: number(row.avg_hesitation_ms),
      avgInteractions: number(row.avg_interactions),
    }];
  });

  const sources = list(source.sources).flatMap((item): AnalyticsSourceMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id)) return [];
    return [{
      formId: text(row.form_id),
      source: text(row.source, 'direto'),
      sessions: number(row.sessions),
      completed: number(row.completed),
    }];
  });

  const devices = list(source.devices).flatMap((item): AnalyticsDeviceMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id)) return [];
    const candidate = text(row.device);
    const device: AnalyticsDeviceMetric['device'] = candidate === 'mobile' || candidate === 'tablet'
      ? candidate
      : 'desktop';
    return [{
      formId: text(row.form_id),
      device,
      sessions: number(row.sessions),
      completed: number(row.completed),
    }];
  });

  const deliveries = list(source.deliveries).flatMap((item): AnalyticsDeliveryMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id) || !text(row.delivery_type)) return [];
    return [{
      formId: text(row.form_id),
      deliveryType: text(row.delivery_type),
      status: text(row.status, 'failed'),
      total: number(row.total),
      lastActivityAt: nullableText(row.last_activity_at),
    }];
  });

  const pixels = list(source.pixels).flatMap((item): AnalyticsPixelMetric[] => {
    const row = record(item);
    if (!row || !text(row.form_id) || !text(row.platform)) return [];
    return [{
      formId: text(row.form_id),
      platform: text(row.platform),
      total: number(row.total),
      firedClient: number(row.fired_client),
      firedServer: number(row.fired_server),
      lastActivityAt: nullableText(row.last_activity_at),
    }];
  });

  return {
    generatedAt,
    since,
    until,
    summary: parseSummary(source.summary),
    forms,
    daily,
    pages,
    sources,
    devices,
    deliveries,
    pixels,
  };
}

function percentage(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;
}

function latest(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

export function selectAnalyticsDashboardView(
  data: AnalyticsDashboardData,
  formId: string | 'all',
): AnalyticsDashboardView {
  const accepts = (candidate: string) => formId === 'all' || candidate === formId;
  const selectedForm = formId === 'all'
    ? null
    : data.forms.find((form) => form.formId === formId) || null;
  const summary: AnalyticsSummary = selectedForm
    ? {
      totalSessions: selectedForm.totalSessions,
      completedSessions: selectedForm.completedSessions,
      incompleteSessions: selectedForm.incompleteSessions,
      activeSessions: selectedForm.activeSessions,
      uniqueLeads: selectedForm.uniqueLeads,
      completionRate: selectedForm.completionRate,
      avgDurationMs: selectedForm.avgDurationMs,
      p50DurationMs: selectedForm.p50DurationMs,
      p95DurationMs: selectedForm.p95DurationMs,
      avgPagesVisited: selectedForm.avgPagesVisited,
      previousTotalSessions: selectedForm.previousTotalSessions,
      previousCompletedSessions: selectedForm.previousCompletedSessions,
      previousCompletionRate: selectedForm.previousCompletionRate,
    }
    : formId === 'all' ? data.summary : { ...EMPTY_SUMMARY };

  const dailyMap = new Map<string, { date: string; sessions: number; completed: number }>();
  for (const row of data.daily.filter((item) => accepts(item.formId))) {
    const current = dailyMap.get(row.date) || { date: row.date, sessions: 0, completed: 0 };
    current.sessions += row.sessions;
    current.completed += row.completed;
    dailyMap.set(row.date, current);
  }

  const sourceMap = new Map<string, { source: string; sessions: number; completed: number }>();
  for (const row of data.sources.filter((item) => accepts(item.formId))) {
    const current = sourceMap.get(row.source) || { source: row.source, sessions: 0, completed: 0 };
    current.sessions += row.sessions;
    current.completed += row.completed;
    sourceMap.set(row.source, current);
  }

  const deviceMap = new Map<AnalyticsDeviceMetric['device'], { device: AnalyticsDeviceMetric['device']; sessions: number; completed: number }>();
  for (const row of data.devices.filter((item) => accepts(item.formId))) {
    const current = deviceMap.get(row.device) || { device: row.device, sessions: 0, completed: 0 };
    current.sessions += row.sessions;
    current.completed += row.completed;
    deviceMap.set(row.device, current);
  }

  const deliveryMap = new Map<string, AnalyticsDashboardView['deliveries'][number]>();
  for (const row of data.deliveries.filter((item) => accepts(item.formId))) {
    const key = `${row.deliveryType}:${row.status}`;
    const current = deliveryMap.get(key) || {
      deliveryType: row.deliveryType,
      status: row.status,
      total: 0,
      lastActivityAt: null,
    };
    current.total += row.total;
    current.lastActivityAt = latest(current.lastActivityAt, row.lastActivityAt);
    deliveryMap.set(key, current);
  }

  const pixelMap = new Map<string, AnalyticsDashboardView['pixels'][number]>();
  for (const row of data.pixels.filter((item) => accepts(item.formId))) {
    const current = pixelMap.get(row.platform) || {
      platform: row.platform,
      total: 0,
      firedClient: 0,
      firedServer: 0,
      lastActivityAt: null,
    };
    current.total += row.total;
    current.firedClient += row.firedClient;
    current.firedServer += row.firedServer;
    current.lastActivityAt = latest(current.lastActivityAt, row.lastActivityAt);
    pixelMap.set(row.platform, current);
  }

  return {
    summary,
    daily: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date)),
    pages: data.pages.filter((item) => accepts(item.formId)),
    sources: [...sourceMap.values()]
      .map((row) => ({ ...row, conversionRate: percentage(row.completed, row.sessions) }))
      .sort((left, right) => right.sessions - left.sessions),
    devices: [...deviceMap.values()]
      .map((row) => ({ ...row, conversionRate: percentage(row.completed, row.sessions) }))
      .sort((left, right) => right.sessions - left.sessions),
    deliveries: [...deliveryMap.values()].sort((left, right) => right.total - left.total),
    pixels: [...pixelMap.values()].sort((left, right) => right.total - left.total),
  };
}

export function calculateMetricChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function calculatePercentagePointChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) return null;
  return Math.round((current - previous) * 10) / 10;
}

/**
 * The aggregate is intentionally allowed to fall back only when PostgREST has
 * not discovered the new function yet. Permission, timeout and SQL errors must
 * stay visible instead of silently replacing complete metrics with a row cap.
 */
export function isAnalyticsDashboardRpcUnavailable(error: unknown): boolean {
  const source = record(error);
  const code = text(source?.code).toUpperCase();
  const message = [source?.message, source?.details, source?.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  if (code === '42883') return true;
  if (code === 'PGRST202' || code === 'PGRST204') {
    return message.includes('get_analytics_dashboard') || message.includes('schema cache');
  }

  return message.includes('get_analytics_dashboard') && (
    message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('schema cache')
  );
}

export function getAnalyticsTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function summarizeDeliveryHealth(
  deliveries: AnalyticsDashboardView['deliveries'],
): AnalyticsDeliveryHealth {
  const health = deliveries.reduce((summary, row) => {
    summary.total += row.total;
    if (row.status === 'delivered') summary.delivered += row.total;
    else if (row.status === 'processing') summary.processing += row.total;
    else if (row.status === 'dead_letter') summary.deadLetter += row.total;
    else summary.retrying += row.total;
    return summary;
  }, {
    total: 0,
    delivered: 0,
    processing: 0,
    retrying: 0,
    deadLetter: 0,
    successRate: 0,
  });

  health.successRate = percentage(health.delivered, health.total);
  return health;
}

export function summarizePixelHealth(
  pixels: AnalyticsDashboardView['pixels'],
): AnalyticsPixelHealth {
  const health = pixels.reduce((summary, row) => {
    summary.total += row.total;
    summary.firedClient += row.firedClient;
    summary.firedServer += row.firedServer;
    return summary;
  }, {
    total: 0,
    firedClient: 0,
    firedServer: 0,
    missingClient: 0,
    missingServer: 0,
    clientRate: 0,
    serverRate: 0,
  });

  health.missingClient = Math.max(health.total - health.firedClient, 0);
  health.missingServer = Math.max(health.total - health.firedServer, 0);
  health.clientRate = percentage(health.firedClient, health.total);
  health.serverRate = percentage(health.firedServer, health.total);
  return health;
}
