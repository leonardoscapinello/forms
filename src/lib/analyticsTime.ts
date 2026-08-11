const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type TimedSession = {
  started_at?: string | null;
  completed_at?: string | null;
};

export function validSessionDurationMs(
  session: TimedSession,
  maximumMs = DAY_MS,
): number | null {
  if (!session.started_at || !session.completed_at) return null;
  const started = Date.parse(session.started_at);
  const completed = Date.parse(session.completed_at);
  const duration = completed - started;
  if (!Number.isFinite(duration) || duration < 0 || duration > maximumMs) return null;
  return duration;
}

export function averageSessionDurationMs(
  sessions: TimedSession[],
  maximumMs = DAY_MS,
): number {
  const durations = sessions
    .map((session) => validSessionDurationMs(session, maximumMs))
    .filter((duration): duration is number => duration !== null);
  if (durations.length === 0) return 0;
  return durations.reduce((total, duration) => total + duration, 0) / durations.length;
}

export function formatAnalyticsDuration(rawMs: number): string {
  const ms = Number.isFinite(rawMs) && rawMs > 0 ? rawMs : 0;
  if (ms === 0) return '0s';
  if (ms < SECOND_MS) return '<1s';

  const totalSeconds = Math.round(ms / SECOND_MS);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function averageBoundedDuration(values: Array<number | null | undefined>, maximumMs: number): number {
  const valid = values.filter((value): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximumMs
  );
  if (valid.length === 0) return 0;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}
