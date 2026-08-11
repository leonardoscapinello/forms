import { readFile, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { bundleBudgets, globalBundleBudget } from './bundle-budget.config.mjs';

const DIST_DIR = new URL('../dist/', import.meta.url);
const MANIFEST_URL = new URL('.vite/manifest.json', DIST_DIR);
const REPORT_URL = new URL('bundle-budget-report.json', DIST_DIR);

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_URL, 'utf8'));
  } catch (error) {
    throw new Error(`Manifesto do Vite não encontrado. Execute npm run build antes do orçamento. (${error.message})`);
  }
}

function collectStaticClosure(manifest, entries) {
  const pending = [...entries];
  const keys = new Set();

  while (pending.length > 0) {
    const key = pending.pop();
    if (keys.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Entrada ausente no manifesto: ${key}`);
    keys.add(key);
    for (const imported of chunk.imports ?? []) pending.push(imported);
  }

  return keys;
}

function collectFiles(manifest, keys) {
  const files = new Set();
  for (const key of keys) {
    const chunk = manifest[key];
    if (chunk.file) files.add(chunk.file);
    for (const cssFile of chunk.css ?? []) files.add(cssFile);
  }
  return files;
}

async function measureFiles(files) {
  const measured = [];
  for (const file of files) {
    const contents = await readFile(new URL(file, DIST_DIR));
    measured.push({
      file,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      brotliBytes: brotliCompressSync(contents, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).byteLength,
    });
  }
  return measured;
}

function sum(measured, field) {
  return measured.reduce((total, file) => total + file[field], 0);
}

function assertLimit(failures, label, actual, maximum) {
  if (actual > maximum) {
    failures.push(`${label}: ${formatKiB(actual)} excede ${formatKiB(maximum)}`);
  }
}

const manifest = await loadManifest();
const failures = [];
const report = {
  generatedAt: new Date().toISOString(),
  groups: {},
  largestJavaScript: null,
  largestCss: null,
};

for (const [name, budget] of Object.entries(bundleBudgets)) {
  const keys = collectStaticClosure(manifest, budget.entries);
  const files = collectFiles(manifest, keys);
  const measured = await measureFiles(files);
  const group = {
    label: budget.label,
    rawBytes: sum(measured, 'rawBytes'),
    gzipBytes: sum(measured, 'gzipBytes'),
    brotliBytes: sum(measured, 'brotliBytes'),
    fileCount: files.size,
    files: measured.sort((a, b) => b.gzipBytes - a.gzipBytes),
  };
  report.groups[name] = group;

  assertLimit(failures, `${budget.label} (gzip)`, group.gzipBytes, budget.maxGzipBytes);
  assertLimit(failures, `${budget.label} (brotli)`, group.brotliBytes, budget.maxBrotliBytes);
  if (group.fileCount > budget.maxFiles) {
    failures.push(`${budget.label}: ${group.fileCount} arquivos excedem o limite de ${budget.maxFiles}`);
  }

  for (const forbiddenKey of budget.forbiddenKeys ?? []) {
    if (keys.has(forbiddenKey)) failures.push(`${budget.label}: dependência proibida carregada: ${forbiddenKey}`);
  }
  for (const pattern of budget.forbiddenKeyPatterns ?? []) {
    const match = [...keys].find((key) => pattern.test(key));
    if (match) failures.push(`${budget.label}: dependência proibida carregada: ${match}`);
  }

  console.log(
    `${budget.label.padEnd(30)} gzip ${formatKiB(group.gzipBytes).padStart(10)} | brotli ${formatKiB(group.brotliBytes).padStart(10)} | ${String(group.fileCount).padStart(2)} arquivos`,
  );
}

const allOutputFiles = new Set(
  Object.values(manifest).flatMap((chunk) => [chunk.file, ...(chunk.css ?? [])]).filter(Boolean),
);
const allMeasured = await measureFiles(allOutputFiles);
report.largestJavaScript = allMeasured
  .filter(({ file }) => file.endsWith('.js'))
  .sort((a, b) => b.gzipBytes - a.gzipBytes)[0] ?? null;
report.largestCss = allMeasured
  .filter(({ file }) => file.endsWith('.css'))
  .sort((a, b) => b.gzipBytes - a.gzipBytes)[0] ?? null;

if (report.largestJavaScript) {
  assertLimit(
    failures,
    `Maior chunk JS (${report.largestJavaScript.file})`,
    report.largestJavaScript.gzipBytes,
    globalBundleBudget.maxSingleJavaScriptGzipBytes,
  );
}
if (report.largestCss) {
  assertLimit(
    failures,
    `Maior chunk CSS (${report.largestCss.file})`,
    report.largestCss.gzipBytes,
    globalBundleBudget.maxSingleCssGzipBytes,
  );
}

await writeFile(REPORT_URL, `${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) {
  console.error('\nOrçamento de bundle reprovado:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nOrçamento de bundle aprovado. Relatório: dist/bundle-budget-report.json`);
}
