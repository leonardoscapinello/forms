#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import {
  evaluateBudget,
  summarizeMeasurements,
} from './release-load-probe.metrics.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TARGET_GROUPS = ['shell', 'og', 'metadata', 'public-get'];

const HELP = `
Probe de carga/smoke somente leitura da release.

Uso:
  node scripts/release-load-probe.mjs \\
    --base-url https://forms.example.com \\
    --form-id 00000000-0000-4000-8000-000000000000 \\
    --supabase-url https://project-ref.supabase.co

Opções:
  --base-url URL             Origem pública da aplicação.
  --form-id UUID             Formulário publicado/fechado usado no probe.
  --supabase-url URL         Origem do projeto Supabase (obrigatória para metadata/public-get).
  --supabase-key KEY         Chave pública opcional; nunca aparece na saída.
  --targets LISTA            all ou shell,og,metadata,public-get (padrão: all).
  --requests N               Amostras medidas por cenário (padrão: 10).
  --concurrency N            Concorrência por cenário, de 1 a 25 (padrão: 2).
  --warmup N                 Requisições de aquecimento excluídas das métricas (padrão: 1).
  --timeout-ms N             Timeout individual (padrão: 8000).
  --max-p95-ms N             Budget de p95 por cenário (padrão: 2000).
  --max-p99-ms N             Budget de p99 por cenário (padrão: 4000).
  --max-error-rate N         Budget de erros entre 0 e 1 (padrão: 0).
  --json                     Emite somente JSON, adequado para CI.
  --help                     Mostra esta ajuda.

Variáveis equivalentes:
  RELEASE_PROBE_BASE_URL, RELEASE_PROBE_FORM_ID, RELEASE_PROBE_SUPABASE_URL,
  RELEASE_PROBE_SUPABASE_KEY, RELEASE_PROBE_TARGETS, RELEASE_PROBE_REQUESTS,
  RELEASE_PROBE_CONCURRENCY, RELEASE_PROBE_WARMUP, RELEASE_PROBE_TIMEOUT_MS,
  RELEASE_PROBE_MAX_P95_MS, RELEASE_PROBE_MAX_P99_MS, RELEASE_PROBE_MAX_ERROR_RATE.
`;

function numericOption(value, fallback, name, { integer = true, minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const candidate = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isFinite(candidate) || (integer && !Number.isInteger(candidate))) {
    throw new Error(`${name} deve ser ${integer ? 'um inteiro' : 'um número'}`);
  }
  if (candidate < minimum || candidate > maximum) {
    throw new Error(`${name} deve ficar entre ${minimum} e ${maximum}`);
  }
  return candidate;
}

function normalizedOrigin(value, name) {
  if (!value) throw new Error(`${name} é obrigatório`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} deve ser uma URL válida`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} deve usar HTTP(S) e não pode conter credenciais`);
  }
  return parsed.origin;
}

function optionalOrigin(value, name) {
  return value ? normalizedOrigin(value, name) : null;
}

function selectedTargetGroups(value) {
  const normalized = (value || 'all').trim().toLowerCase();
  if (normalized === 'all') return [...TARGET_GROUPS];
  const groups = [...new Set(normalized.split(',').map((entry) => entry.trim()).filter(Boolean))];
  if (!groups.length) throw new Error('--targets não pode ficar vazio');
  const invalid = groups.filter((group) => !TARGET_GROUPS.includes(group));
  if (invalid.length) throw new Error(`targets desconhecidos: ${invalid.join(', ')}`);
  return groups;
}

function readConfiguration() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'form-id': { type: 'string' },
      'supabase-url': { type: 'string' },
      'supabase-key': { type: 'string' },
      targets: { type: 'string' },
      requests: { type: 'string' },
      concurrency: { type: 'string' },
      warmup: { type: 'string' },
      'timeout-ms': { type: 'string' },
      'max-p95-ms': { type: 'string' },
      'max-p99-ms': { type: 'string' },
      'max-error-rate': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) return { help: true };

  const groups = selectedTargetGroups(values.targets || process.env.RELEASE_PROBE_TARGETS);
  const baseUrl = normalizedOrigin(
    values['base-url'] || process.env.RELEASE_PROBE_BASE_URL,
    '--base-url',
  );
  const formId = values['form-id'] || process.env.RELEASE_PROBE_FORM_ID;
  if (!UUID_PATTERN.test(formId || '')) throw new Error('--form-id deve ser um UUID válido');

  const supabaseUrl = optionalOrigin(
    values['supabase-url']
      || process.env.RELEASE_PROBE_SUPABASE_URL
      || process.env.SUPABASE_URL
      || process.env.VITE_SUPABASE_URL,
    '--supabase-url',
  );
  if (groups.some((group) => group === 'metadata' || group === 'public-get') && !supabaseUrl) {
    throw new Error('--supabase-url é obrigatório para os targets metadata/public-get');
  }

  const requests = numericOption(
    values.requests || process.env.RELEASE_PROBE_REQUESTS,
    10,
    '--requests',
    { minimum: 1, maximum: 1_000 },
  );
  const concurrency = numericOption(
    values.concurrency || process.env.RELEASE_PROBE_CONCURRENCY,
    2,
    '--concurrency',
    { minimum: 1, maximum: 25 },
  );
  const warmup = numericOption(
    values.warmup || process.env.RELEASE_PROBE_WARMUP,
    1,
    '--warmup',
    { minimum: 0, maximum: 100 },
  );
  const timeoutMs = numericOption(
    values['timeout-ms'] || process.env.RELEASE_PROBE_TIMEOUT_MS,
    8_000,
    '--timeout-ms',
    { minimum: 100, maximum: 120_000 },
  );
  const maxP95Ms = numericOption(
    values['max-p95-ms'] || process.env.RELEASE_PROBE_MAX_P95_MS,
    2_000,
    '--max-p95-ms',
    { minimum: 1, maximum: 120_000 },
  );
  const maxP99Ms = numericOption(
    values['max-p99-ms'] || process.env.RELEASE_PROBE_MAX_P99_MS,
    4_000,
    '--max-p99-ms',
    { minimum: 1, maximum: 120_000 },
  );
  const maxErrorRate = numericOption(
    values['max-error-rate'] || process.env.RELEASE_PROBE_MAX_ERROR_RATE,
    0,
    '--max-error-rate',
    { integer: false, minimum: 0, maximum: 1 },
  );

  return {
    help: false,
    baseUrl,
    formId,
    supabaseUrl,
    supabaseKey: values['supabase-key']
      || process.env.RELEASE_PROBE_SUPABASE_KEY
      || process.env.SUPABASE_ANON_KEY
      || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      || process.env.VITE_SUPABASE_ANON_KEY
      || null,
    groups,
    requests,
    concurrency,
    warmup,
    timeoutMs,
    budget: { maxP95Ms, maxP99Ms, maxErrorRate },
    json: values.json,
  };
}

function assertContentType(response, prefix) {
  const contentType = response.headers.get('content-type')?.toLowerCase() || '';
  if (!contentType.startsWith(prefix)) return `content_type:${contentType || 'missing'}`;
  return null;
}

function textFromBytes(bytes) {
  return new TextDecoder().decode(bytes);
}

function validateJsonId(bytes, formId) {
  try {
    const parsed = JSON.parse(textFromBytes(bytes));
    return parsed && parsed.id === formId ? null : 'json_form_id_mismatch';
  } catch {
    return 'invalid_json';
  }
}

function edgeHeaders(configuration) {
  const headers = { Accept: 'application/json' };
  if (configuration.supabaseKey) {
    headers.apikey = configuration.supabaseKey;
    headers.authorization = `Bearer ${configuration.supabaseKey}`;
  }
  return headers;
}

function buildTargets(configuration) {
  const encodedId = encodeURIComponent(configuration.formId);
  const targets = [];

  if (configuration.groups.includes('shell')) {
    for (const method of ['GET', 'HEAD']) {
      targets.push({
        key: `shell:${method.toLowerCase()}`,
        label: `Shell público ${method}`,
        method,
        url: `${configuration.baseUrl}/f/${encodedId}`,
        headers: { Accept: 'text/html' },
        validate(response, bytes) {
          const contentTypeError = assertContentType(response, 'text/html');
          if (contentTypeError) return contentTypeError;
          if (method === 'GET' && (bytes.byteLength === 0 || !/<html[\s>]/i.test(textFromBytes(bytes)))) {
            return 'invalid_html_shell';
          }
          return null;
        },
      });
    }
  }

  if (configuration.groups.includes('og')) {
    for (const method of ['GET', 'HEAD']) {
      targets.push({
        key: `og:${method.toLowerCase()}`,
        label: `Open Graph ${method}`,
        method,
        url: `${configuration.baseUrl}/api/form-og?id=${encodedId}`,
        headers: { Accept: 'image/png,image/*' },
        validate(response, bytes) {
          const contentTypeError = assertContentType(response, 'image/');
          if (contentTypeError) return contentTypeError;
          if (method === 'GET' && bytes.byteLength === 0) return 'empty_image';
          return null;
        },
      });
    }
  }

  if (configuration.groups.includes('metadata')) {
    for (const method of ['GET', 'HEAD']) {
      targets.push({
        key: `metadata:${method.toLowerCase()}`,
        label: `Metadata pública ${method}`,
        method,
        url: `${configuration.supabaseUrl}/functions/v1/form-public-metadata?id=${encodedId}`,
        headers: edgeHeaders(configuration),
        validate(response, bytes) {
          const contentTypeError = assertContentType(response, 'application/json');
          if (contentTypeError) return contentTypeError;
          return method === 'GET' ? validateJsonId(bytes, configuration.formId) : null;
        },
      });
    }
  }

  if (configuration.groups.includes('public-get')) {
    targets.push({
      key: 'public-get:get',
      label: 'Runtime público GET',
      method: 'GET',
      url: `${configuration.supabaseUrl}/functions/v1/form-public-get?id=${encodedId}`,
      headers: edgeHeaders(configuration),
      validate(response, bytes) {
        const contentTypeError = assertContentType(response, 'application/json');
        if (contentTypeError) return contentTypeError;
        return validateJsonId(bytes, configuration.formId);
      },
    });
  }

  return targets;
}

async function requestOnce(target, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(target.url, {
      method: target.method,
      headers: {
        ...target.headers,
        'User-Agent': 'forms-release-load-probe/1.0',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    const durationMs = performance.now() - startedAt;
    const validationError = response.status === 200 ? target.validate(response, bytes) : null;
    const error = response.status !== 200 ? `http_status:${response.status}` : validationError;
    return {
      ok: error === null,
      status: response.status,
      durationMs,
      bytes: bytes.byteLength,
      error,
    };
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok: false, status: null, durationMs, bytes: 0, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}

async function runConcurrent(count, concurrency, operation) {
  if (count === 0) return [];
  const results = new Array(count);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < count) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, () => worker()));
  return results;
}

function errorCounts(measurements) {
  const counts = new Map();
  for (const measurement of measurements) {
    if (measurement.ok) continue;
    counts.set(measurement.error, (counts.get(measurement.error) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function rateLimitWarnings(configuration) {
  const warnings = [];
  const callsPerScenario = configuration.requests + configuration.warmup;
  const metadataScenarios = configuration.groups
    .filter((group) => group === 'shell' || group === 'og' || group === 'metadata')
    .length * 2;
  const estimatedMetadataCalls = callsPerScenario * metadataScenarios;
  if (estimatedMetadataCalls > 4_000) {
    warnings.push(
      `O plano pode gerar até ${estimatedMetadataCalls} leituras de metadata e se aproximar do limite NAT-safe de 5.000/minuto por formulário.`,
    );
  }
  if (configuration.groups.includes('public-get') && callsPerScenario > 4_000) {
    warnings.push(
      `O plano pode gerar ${callsPerScenario} leituras de public-get e se aproximar do limite NAT-safe de 5.000/minuto por formulário.`,
    );
  }
  return warnings;
}

function formatMilliseconds(value) {
  return value === null ? '-' : `${value.toFixed(2)} ms`;
}

function printText(report) {
  console.log('Probe de release somente leitura');
  console.log(`Origem: ${report.configuration.baseUrl}`);
  console.log(`Formulário: ${report.configuration.formId}`);
  console.log(
    `Amostras: ${report.configuration.requests}/cenário | concorrência: ${report.configuration.concurrency} | aquecimento: ${report.configuration.warmup}`,
  );
  console.log(
    `Budgets: erro <= ${(report.configuration.budget.maxErrorRate * 100).toFixed(2)}% | p95 <= ${report.configuration.budget.maxP95Ms} ms | p99 <= ${report.configuration.budget.maxP99Ms} ms`,
  );
  for (const warning of report.warnings) console.log(`AVISO: ${warning}`);
  console.log('');

  for (const result of report.targets) {
    const status = result.budget.passed ? 'PASS' : 'FAIL';
    const summary = result.summary;
    console.log(
      `[${status}] ${result.label}: ${summary.successes}/${summary.total} ok | erro ${(summary.errorRate * 100).toFixed(2)}% | p50 ${formatMilliseconds(summary.p50Ms)} | p95 ${formatMilliseconds(summary.p95Ms)} | p99 ${formatMilliseconds(summary.p99Ms)}`,
    );
    if (Object.keys(result.errorCounts).length) console.log(`  erros: ${JSON.stringify(result.errorCounts)}`);
    if (!result.budget.passed) console.log(`  budgets: ${result.budget.failures.join(', ')}`);
  }

  console.log('');
  console.log(
    `Total: ${report.aggregate.successes}/${report.aggregate.total} ok | p95 ${formatMilliseconds(report.aggregate.p95Ms)} | resultado ${report.passed ? 'PASS' : 'FAIL'}`,
  );
}

async function main() {
  let configuration;
  try {
    configuration = readConfiguration();
  } catch (error) {
    console.error(`Configuração inválida: ${error.message}`);
    console.error('Use --help para ver os parâmetros aceitos.');
    process.exitCode = 2;
    return;
  }

  if (configuration.help) {
    console.log(HELP.trim());
    return;
  }

  const targets = buildTargets(configuration);
  const targetReports = [];
  const allMeasurements = [];

  for (const target of targets) {
    await runConcurrent(configuration.warmup, configuration.concurrency, () => (
      requestOnce(target, configuration.timeoutMs)
    ));
    const measurements = await runConcurrent(configuration.requests, configuration.concurrency, () => (
      requestOnce(target, configuration.timeoutMs)
    ));
    const summary = summarizeMeasurements(measurements);
    const budget = evaluateBudget(summary, configuration.budget);
    targetReports.push({
      key: target.key,
      label: target.label,
      method: target.method,
      summary,
      budget,
      errorCounts: errorCounts(measurements),
    });
    allMeasurements.push(...measurements);
  }

  const passed = targetReports.every((report) => report.budget.passed);
  const report = {
    schemaVersion: 1,
    readOnly: true,
    passed,
    configuration: {
      baseUrl: configuration.baseUrl,
      formId: configuration.formId,
      groups: configuration.groups,
      requests: configuration.requests,
      concurrency: configuration.concurrency,
      warmup: configuration.warmup,
      timeoutMs: configuration.timeoutMs,
      budget: configuration.budget,
      supabaseConfigured: Boolean(configuration.supabaseUrl),
      publicKeyConfigured: Boolean(configuration.supabaseKey),
    },
    warnings: rateLimitWarnings(configuration),
    targets: targetReports,
    aggregate: summarizeMeasurements(allMeasurements),
  };

  if (configuration.json) console.log(JSON.stringify(report, null, 2));
  else printText(report);
  if (!passed) process.exitCode = 1;
}

await main();
