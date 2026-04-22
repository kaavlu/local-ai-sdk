import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK_DOCTOR_ENTRY = path.join(ROOT, 'packages', 'sdk-ts', 'dist', 'doctor.js');

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = '1';
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function asOptionalNumber(value, fallback) {
  if (value == null || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asOptionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function resolveOptions(args) {
  const runtimeBaseUrl = asOptionalString(args.runtimeUrl) || asOptionalString(process.env.DYNO_AGENT_URL);
  const localMode = asOptionalString(args.localMode) || 'interactive';
  const runtimeTimeoutMs = asOptionalNumber(
    args.runtimeTimeoutMs ?? process.env.DYNO_DOCTOR_RUNTIME_TIMEOUT_MS,
    2_000,
  );
  const readinessTimeoutMs = asOptionalNumber(
    args.readinessTimeoutMs ?? process.env.DYNO_DOCTOR_READINESS_TIMEOUT_MS,
    2_000,
  );

  const resolverUrl =
    asOptionalString(args.resolverUrl) ||
    asOptionalString(process.env.DYNO_CONFIG_RESOLVER_URL) ||
    asOptionalString(process.env.DYNO_RESOLVER_URL);
  const projectApiKey =
    asOptionalString(args.projectApiKey) ||
    asOptionalString(process.env.DYNO_PROJECT_API_KEY) ||
    asOptionalString(process.env.DYNO_API_KEY);
  const resolverConfigPath =
    asOptionalString(args.resolverPath) || asOptionalString(process.env.DYNO_RESOLVER_CONFIG_PATH);
  const resolverTimeoutMs = asOptionalNumber(
    args.resolverTimeoutMs ?? process.env.DYNO_DOCTOR_RESOLVER_TIMEOUT_MS,
    4_000,
  );

  const fallbackBaseUrl =
    asOptionalString(args.fallbackUrl) || asOptionalString(process.env.DYNO_FALLBACK_BASE_URL);
  const fallbackApiKey =
    asOptionalString(args.fallbackApiKey) || asOptionalString(process.env.DYNO_FALLBACK_API_KEY);
  const fallbackModel =
    asOptionalString(args.fallbackModel) || asOptionalString(process.env.DYNO_FALLBACK_MODEL);
  const fallbackGenerationModel =
    asOptionalString(args.fallbackGenerationModel) ||
    asOptionalString(process.env.DYNO_FALLBACK_GENERATION_MODEL);
  const fallbackPath =
    asOptionalString(args.fallbackPath) || asOptionalString(process.env.DYNO_FALLBACK_EMBED_PATH);
  const fallbackGeneratePath =
    asOptionalString(args.fallbackGeneratePath) ||
    asOptionalString(process.env.DYNO_FALLBACK_GENERATE_PATH);
  const fallbackTimeoutMs = asOptionalNumber(
    args.fallbackTimeoutMs ?? process.env.DYNO_DOCTOR_FALLBACK_TIMEOUT_MS,
    4_000,
  );
  const fallbackSampleText =
    asOptionalString(args.fallbackSampleText) ||
    asOptionalString(process.env.DYNO_DOCTOR_FALLBACK_SAMPLE_TEXT);
  const fallbackGenerationSampleText =
    asOptionalString(args.fallbackGenerationSampleText) ||
    asOptionalString(process.env.DYNO_DOCTOR_FALLBACK_GENERATION_SAMPLE_TEXT);

  return {
    runtimeBaseUrl,
    localMode,
    runtimeTimeoutMs,
    readinessTimeoutMs,
    resolver:
      resolverUrl && projectApiKey
        ? {
            configResolverUrl: resolverUrl,
            projectApiKey,
            resolverConfigPath,
            requestTimeoutMs: resolverTimeoutMs,
          }
        : undefined,
    fallback:
      fallbackBaseUrl && fallbackApiKey
        ? {
            baseUrl: fallbackBaseUrl,
            apiKey: fallbackApiKey,
            model: fallbackModel,
            generationModel: fallbackGenerationModel,
            embedPath: fallbackPath,
            generatePath: fallbackGeneratePath,
            timeoutMs: fallbackTimeoutMs,
            sampleText: fallbackSampleText,
            generationSampleText: fallbackGenerationSampleText,
          }
        : undefined,
  };
}

function printSummary(report) {
  const icon = report.ok ? 'PASS' : 'FAIL';
  console.log(`[doctor] ${icon} dyno diagnostics`);
  console.log(
    `[doctor] summary: pass=${report.summary.passCount} fail=${report.summary.failCount} skipped=${report.summary.skippedCount}`,
  );
  console.log(`[doctor] runtime: ${report.runtime.code} (${report.runtime.message})`);
  console.log(`[doctor] resolver: ${report.resolver.code} (${report.resolver.message})`);
  console.log(`[doctor] fallback: ${report.fallback.code} (${report.fallback.message})`);
  console.log(
    `[doctor] fallback.embeddings: ${report.fallback.embeddings.code} (${report.fallback.embeddings.message})`,
  );
  console.log(
    `[doctor] fallback.generation: ${report.fallback.generation.code} (${report.fallback.generation.message})`,
  );
}

async function main() {
  if (!fs.existsSync(SDK_DOCTOR_ENTRY)) {
    console.error('[doctor] SDK not built at packages/sdk-ts/dist/. Run: npm run build -w @dynosdk/ts');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const options = resolveOptions(args);
  const { runDynoDoctor } = await import(pathToFileURL(SDK_DOCTOR_ENTRY).href);
  const report = await runDynoDoctor(options);
  printSummary(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[doctor] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
