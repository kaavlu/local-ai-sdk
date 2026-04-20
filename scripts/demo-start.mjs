import { readFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const envPath = path.join(rootDir, 'apps', 'demo-electron', '.env');
const electronMainPath = path.join(rootDir, 'apps', 'demo-electron', 'src', 'main.ts');
const RESOLVER_TIMEOUT_MS = 120_000;
const RESOLVER_POLL_MS = 700;

let shuttingDown = false;
let appProc = null;
let dashboardProc = null;

function isTruthy(value) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parseMainBackendMode() {
  if (!existsSync(electronMainPath)) {
    throw new Error(`Cannot detect backend mode: missing ${electronMainPath}`);
  }
  const source = readFileSync(electronMainPath, 'utf8');
  const activeLine = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        !line.startsWith('//') &&
        line.startsWith('const embeddingBackend = create') &&
        line.endsWith('Backend();'),
    );
  const match = activeLine?.match(/const\s+embeddingBackend\s*=\s*create(.*?)Backend\(\)\s*;/);
  const backend = match?.[1]?.trim();
  if (backend === 'Dyno') {
    return 'dyno';
  }
  if (backend === 'Gemini') {
    return 'gemini';
  }
  throw new Error(
    'Cannot detect backend mode from apps/demo-electron/src/main.ts (expected createGeminiBackend() or createDynoBackend()).',
  );
}

function isLikelyLocalUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '::1'
    );
  } catch {
    return false;
  }
}

async function waitForHttp(url, timeoutMs, pollMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        console.log(`[demo:start] ${label} is reachable at ${url}`);
        return true;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return false;
}

function getOptionalEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function loadEnvFile() {
  if (!existsSync(envPath)) {
    console.warn(`[demo:start] no .env file found at ${envPath}`);
    return;
  }
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key) {
      continue;
    }
    process.env[key] = value;
  }
  console.log(`[demo:start] loaded environment from ${path.relative(rootDir, envPath)}`);
}

function runStopAll() {
  const result = spawnSync('npm', ['run', 'stop:all'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status ?? 0;
}

function runStopDashboard() {
  spawnSync('npm', ['run', 'stop:dashboard'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function pipeWithPrefix(stream, prefix, target) {
  if (!stream) {
    return;
  }
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      target.write(`${prefix}${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) {
      target.write(`${prefix}${buffer}\n`);
      buffer = '';
    }
  });
}

function spawnNamed(name, npmScript) {
  const child = spawn('npm', ['run', npmScript], {
    cwd: rootDir,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  pipeWithPrefix(child.stdout, `[${name}] `, process.stdout);
  pipeWithPrefix(child.stderr, `[${name}] `, process.stderr);
  return child;
}

async function ensureDynoResolverReady() {
  const resolverUrl = getOptionalEnv('DYNO_CONFIG_RESOLVER_URL', 'http://127.0.0.1:3000');
  console.log('[demo:start] dyno mode detected');
  const alreadyUp = await waitForHttp(resolverUrl, 8000, RESOLVER_POLL_MS, 'config resolver');
  if (alreadyUp) {
    return;
  }
  if (!isLikelyLocalUrl(resolverUrl)) {
    throw new Error(
      `[demo:start] config resolver is unreachable at ${resolverUrl}. Start it before running the demo.`,
    );
  }
  console.log('[demo:start] config resolver not reachable; starting dashboard...');
  dashboardProc = spawnNamed('dashboard', 'dev:dashboard');
  attachLifecycle(dashboardProc, 'dashboard');
  const ready = await waitForHttp(
    resolverUrl,
    RESOLVER_TIMEOUT_MS,
    RESOLVER_POLL_MS,
    'config resolver',
  );
  if (!ready) {
    throw new Error(
      `[demo:start] dashboard started, but resolver is still unreachable at ${resolverUrl} after timeout.`,
    );
  }
}

function validateGeminiMode() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      '[demo:start] Gemini mode requires GEMINI_API_KEY. Add it to apps/demo-electron/.env or export it in your shell.',
    );
  }
  console.log('[demo:start] gemini mode detected (GEMINI_API_KEY present).');
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('[demo:start] stopping demo processes...');
  if (dashboardProc) {
    console.log('[demo:start] stopping dashboard...');
    runStopDashboard();
  }
  runStopAll();
  process.exit(exitCode);
}

function attachLifecycle(proc, name) {
  proc.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const details = signal ? `signal=${signal}` : `code=${code ?? 0}`;
    console.log(`[demo:start] ${name} exited (${details})`);
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  loadEnvFile();
  const backendMode = parseMainBackendMode();
  const forceReady = isTruthy(process.env.DEMO_FORCE_READY);
  console.log(`[demo:start] backend mode: ${backendMode}`);
  if (backendMode === 'dyno' && forceReady) {
    process.env.DYNO_READINESS_BYPASS = '1';
    console.log('[demo:start] DEMO_FORCE_READY enabled -> setting DYNO_READINESS_BYPASS=1');
  }
  if (backendMode === 'dyno') {
    await ensureDynoResolverReady();
  } else {
    validateGeminiMode();
  }

  console.log('[demo:start] ensuring previous demo processes are stopped...');
  runStopAll();

  console.log('[demo:start] starting app...');
  appProc = spawnNamed('app', 'dev:app');
  attachLifecycle(appProc, 'app');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo:start] failed: ${message}`);
  shutdown(1);
});
