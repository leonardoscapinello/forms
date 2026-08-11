/**
 * Return a nearest-rank percentile without mutating the input.
 *
 * Nearest-rank keeps small release probes easy to reproduce and audit:
 * rank = ceil(percentile * sample count), clamped to the available samples.
 */
export function percentile(values, percentileValue) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array');
  if (!Number.isFinite(percentileValue) || percentileValue < 0 || percentileValue > 1) {
    throw new RangeError('percentile must be between 0 and 1');
  }

  const sorted = values.map((value) => {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError('percentile samples must be finite non-negative numbers');
    }
    return value;
  }).sort((left, right) => left - right);

  if (sorted.length === 0) return null;
  if (percentileValue === 0) return sorted[0];

  const index = Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1);
  return sorted[index];
}

function rounded(value, digits = 2) {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarizeMeasurements(measurements) {
  if (!Array.isArray(measurements)) throw new TypeError('measurements must be an array');

  const successful = measurements.filter((measurement) => measurement?.ok === true);
  const latencies = successful.map((measurement) => measurement.durationMs);
  const totalBytes = successful.reduce((total, measurement) => total + (measurement.bytes || 0), 0);
  const errors = measurements.length - successful.length;

  return {
    total: measurements.length,
    successes: successful.length,
    errors,
    errorRate: measurements.length === 0 ? 1 : rounded(errors / measurements.length, 6),
    p50Ms: rounded(percentile(latencies, 0.5)),
    p95Ms: rounded(percentile(latencies, 0.95)),
    p99Ms: rounded(percentile(latencies, 0.99)),
    minMs: rounded(latencies.length ? Math.min(...latencies) : null),
    maxMs: rounded(latencies.length ? Math.max(...latencies) : null),
    averageMs: rounded(
      latencies.length ? latencies.reduce((total, latency) => total + latency, 0) / latencies.length : null,
    ),
    totalBytes,
    averageBytes: successful.length ? rounded(totalBytes / successful.length) : null,
  };
}

export function evaluateBudget(summary, budget) {
  if (!summary || typeof summary !== 'object') throw new TypeError('summary is required');
  if (!budget || typeof budget !== 'object') throw new TypeError('budget is required');

  const failures = [];
  if (summary.successes === 0) failures.push('no_successful_requests');
  if (summary.errorRate > budget.maxErrorRate) {
    failures.push(`error_rate:${summary.errorRate}>${budget.maxErrorRate}`);
  }
  if (summary.p95Ms !== null && summary.p95Ms > budget.maxP95Ms) {
    failures.push(`p95_ms:${summary.p95Ms}>${budget.maxP95Ms}`);
  }
  if (summary.p99Ms !== null && summary.p99Ms > budget.maxP99Ms) {
    failures.push(`p99_ms:${summary.p99Ms}>${budget.maxP99Ms}`);
  }

  return { passed: failures.length === 0, failures };
}
