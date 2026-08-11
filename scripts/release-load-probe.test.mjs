import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateBudget,
  percentile,
  summarizeMeasurements,
} from './release-load-probe.metrics.mjs';

test('percentile uses nearest-rank and does not mutate samples', () => {
  const samples = [40, 10, 30, 20];

  assert.equal(percentile(samples, 0), 10);
  assert.equal(percentile(samples, 0.5), 20);
  assert.equal(percentile(samples, 0.95), 40);
  assert.equal(percentile(samples, 0.99), 40);
  assert.deepEqual(samples, [40, 10, 30, 20]);
});

test('percentile handles empty and single-value samples', () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([17.25], 0.5), 17.25);
  assert.equal(percentile([17.25], 0.99), 17.25);
});

test('percentile rejects invalid ranks and samples', () => {
  assert.throws(() => percentile([1], -0.1), /between 0 and 1/);
  assert.throws(() => percentile([1], 1.1), /between 0 and 1/);
  assert.throws(() => percentile([-1], 0.5), /non-negative/);
  assert.throws(() => percentile([Number.NaN], 0.5), /non-negative/);
});

test('summary reports latency only for successful requests and error rate for all requests', () => {
  const summary = summarizeMeasurements([
    { ok: true, durationMs: 10, bytes: 100 },
    { ok: false, durationMs: 5_000, bytes: 0 },
    { ok: true, durationMs: 30, bytes: 300 },
    { ok: true, durationMs: 20, bytes: 200 },
  ]);

  assert.deepEqual(summary, {
    total: 4,
    successes: 3,
    errors: 1,
    errorRate: 0.25,
    p50Ms: 20,
    p95Ms: 30,
    p99Ms: 30,
    minMs: 10,
    maxMs: 30,
    averageMs: 20,
    totalBytes: 600,
    averageBytes: 200,
  });
});

test('empty summary is a failed sample rather than a false pass', () => {
  const summary = summarizeMeasurements([]);

  assert.equal(summary.errorRate, 1);
  assert.equal(summary.p95Ms, null);
  assert.deepEqual(
    evaluateBudget(summary, { maxErrorRate: 1, maxP95Ms: 1_000, maxP99Ms: 2_000 }),
    { passed: false, failures: ['no_successful_requests'] },
  );
});

test('budget evaluation reports each violated gate', () => {
  const result = evaluateBudget(
    { successes: 9, errorRate: 0.1, p95Ms: 1_501, p99Ms: 2_501 },
    { maxErrorRate: 0, maxP95Ms: 1_500, maxP99Ms: 2_500 },
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, [
    'error_rate:0.1>0',
    'p95_ms:1501>1500',
    'p99_ms:2501>2500',
  ]);
});

test('budget evaluation passes at exact boundaries', () => {
  assert.deepEqual(
    evaluateBudget(
      { successes: 10, errorRate: 0, p95Ms: 1_500, p99Ms: 2_500 },
      { maxErrorRate: 0, maxP95Ms: 1_500, maxP99Ms: 2_500 },
    ),
    { passed: true, failures: [] },
  );
});
