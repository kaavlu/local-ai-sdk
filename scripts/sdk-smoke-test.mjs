/**
 * Quick SDK smoke test against a running agent (read-only GETs).
 * Requires: npm run build -w @local-ai/sdk-ts
 *
 * LOCAL_AGENT_URL=http://127.0.0.1:9000  — full base URL
 * PORT=9000 — shorthand for http://127.0.0.1:$PORT
 * SMOKE_SKIP_MACHINE_STATE=1 — skip getMachineState()
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK_ENTRY = path.join(ROOT, 'packages', 'sdk-ts', 'dist', 'index.js');

function resolveBaseUrl() {
  const explicit = process.env.LOCAL_AGENT_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const port = process.env.PORT?.trim();
  if (port) {
    return `http://127.0.0.1:${port}`;
  }
  return 'http://127.0.0.1:8787';
}

async function main() {
  if (!fs.existsSync(SDK_ENTRY)) {
    console.error('[smoke] SDK not built at packages/sdk-ts/dist/. Run: npm run build -w @local-ai/sdk-ts');
    process.exit(1);
  }

  const baseUrl = resolveBaseUrl();
  const { LocalAiSdk } = await import(pathToFileURL(SDK_ENTRY).href);
  const sdk = new LocalAiSdk({ baseUrl });

  console.log('[smoke] baseUrl=' + baseUrl);

  const health = await sdk.healthCheck();
  console.log('[smoke] healthCheck:', health);

  const db = await sdk.getDbDebugInfo();
  console.log('[smoke] getDbDebugInfo:', JSON.stringify(db));

  if (process.env.SMOKE_SKIP_MACHINE_STATE === '1') {
    console.log('[smoke] skipped getMachineState (SMOKE_SKIP_MACHINE_STATE=1)');
  } else {
    const ms = await sdk.getMachineState();
    console.log('[smoke] getMachineState:', JSON.stringify(ms));
  }

  console.log('[smoke] ok');
}

function printHintIfUnreachable(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(msg)) {
    console.error(
      '[smoke] hint: nothing responded at the base URL. Start the agent in another terminal: npm run dev:agent',
    );
    console.error(
      '[smoke] hint: if the agent uses another port, set PORT or LOCAL_AGENT_URL (see README Developer workflow).',
    );
  }
}

main().catch((e) => {
  console.error('[smoke] failed:', e instanceof Error ? e.message : e);
  printHintIfUnreachable(e);
  process.exit(1);
});
