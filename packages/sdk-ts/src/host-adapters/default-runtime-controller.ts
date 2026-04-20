import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

type RuntimeControllerState = 'idle' | 'starting' | 'healthy' | 'unavailable' | 'stopped';
const DEFAULT_AGENT_HOST = '127.0.0.1';
const DEFAULT_AGENT_PORT = 8787;
const DEFAULT_AGENT_BASE_URL = `http://${DEFAULT_AGENT_HOST}:${DEFAULT_AGENT_PORT}`;
const DEFAULT_PORT_RETRY_COUNT = 10;

export interface RuntimeControllerStatus {
  state: RuntimeControllerState;
  runtimeSource: 'packaged' | 'development' | 'external';
  runtimeVersion: string | null;
  lastError: string | null;
  helperPath: string | null;
  ownsProcess: boolean;
  agentBaseUrl: string | null;
}

export interface RuntimeController {
  ensureStarted(): Promise<void>;
  shutdown(reason?: string): Promise<void>;
  getStatus(): RuntimeControllerStatus;
  getAgentBaseUrl(): string;
}

export interface RuntimeControllerOptions {
  agentBaseUrl?: string;
  candidateBaseUrls?: string[];
  projectId?: string;
  configResolverUrl?: string;
  startupTimeoutMs?: number;
  startupPollIntervalMs?: number;
  shutdownTimeoutMs?: number;
}

interface RuntimeArtifact {
  helperPath: string;
  runtimeSource: RuntimeControllerStatus['runtimeSource'];
  runtimeVersion: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(agentBaseUrl: string): string {
  return agentBaseUrl.replace(/\/+$/, '');
}

function parsePortFromAgentBaseUrl(agentBaseUrl: string): string {
  try {
    const parsed = new URL(agentBaseUrl);
    return parsed.port || String(DEFAULT_AGENT_PORT);
  } catch {
    return String(DEFAULT_AGENT_PORT);
  }
}

function buildAgentBaseUrlCandidates(explicitBaseUrl: string | undefined): string[] {
  if (explicitBaseUrl) {
    return [normalizeBaseUrl(explicitBaseUrl)];
  }
  const candidates: string[] = [];
  for (let offset = 0; offset < DEFAULT_PORT_RETRY_COUNT; offset += 1) {
    candidates.push(`http://${DEFAULT_AGENT_HOST}:${DEFAULT_AGENT_PORT + offset}`);
  }
  return candidates;
}

function normalizeCandidatePath(candidate: string): string {
  return path.normalize(candidate);
}

function parseRuntimeManifest(resourcesRuntimeDir: string): RuntimeArtifact | null {
  const manifestPath = path.join(resourcesRuntimeDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      version?: string;
      entrypoint?: string;
      platformEntrypoints?: Record<string, string>;
    };
    const platformArch = `${process.platform}-${process.arch}`;
    const relativeEntrypoint = parsed.platformEntrypoints?.[platformArch] ?? parsed.entrypoint;
    if (!relativeEntrypoint) {
      return null;
    }
    const helperPath = path.resolve(resourcesRuntimeDir, relativeEntrypoint);
    if (!fs.existsSync(helperPath)) {
      return null;
    }
    return {
      helperPath,
      runtimeSource: 'packaged',
      runtimeVersion: parsed.version ?? null,
    };
  } catch {
    return null;
  }
}

function resolvePackagedArtifact(): RuntimeArtifact | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) {
    return null;
  }

  const runtimeDir = path.join(resourcesPath, 'dyno-runtime');
  const manifestArtifact = parseRuntimeManifest(runtimeDir);
  if (manifestArtifact) {
    return manifestArtifact;
  }

  const platformArch = `${process.platform}-${process.arch}`;
  const helperBinaryName = process.platform === 'win32' ? 'dyno-agent.exe' : 'dyno-agent';
  const directCandidates = [
    path.join(runtimeDir, platformArch, helperBinaryName),
    path.join(runtimeDir, helperBinaryName),
  ];
  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return {
        helperPath: candidate,
        runtimeSource: 'packaged',
        runtimeVersion: null,
      };
    }
  }
  return null;
}

function resolveDevelopmentArtifact(): RuntimeArtifact | null {
  const explicit = process.env.DYNO_RUNTIME_HELPER_PATH?.trim();
  if (explicit && fs.existsSync(explicit)) {
    return {
      helperPath: explicit,
      runtimeSource: 'development',
      runtimeVersion: null,
    };
  }

  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'packages', 'agent', 'dist', 'index.js'),
    path.join(cwd, '..', 'packages', 'agent', 'dist', 'index.js'),
    path.join(cwd, '..', '..', 'packages', 'agent', 'dist', 'index.js'),
  ].map(normalizeCandidatePath);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return {
        helperPath: candidate,
        runtimeSource: 'development',
        runtimeVersion: null,
      };
    }
  }
  return null;
}

function resolveRuntimeArtifact(): RuntimeArtifact {
  const packaged = resolvePackagedArtifact();
  if (packaged) {
    return packaged;
  }
  const development = resolveDevelopmentArtifact();
  if (development) {
    return development;
  }
  throw new Error(
    'runtime_artifact_missing: unable to locate packaged helper. Set DYNO_RUNTIME_HELPER_PATH in development if needed.',
  );
}

async function isHealthyOnce(agentBaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${agentBaseUrl.replace(/\/+$/, '')}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealthy(
  agentBaseUrl: string,
  startupTimeoutMs: number,
  startupPollIntervalMs: number,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= startupTimeoutMs) {
    if (await isHealthyOnce(agentBaseUrl)) {
      return true;
    }
    await sleep(startupPollIntervalMs);
  }
  return false;
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.killed) {
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

class ManagedRuntimeController implements RuntimeController {
  private child: ChildProcess | null = null;
  private startInFlight: Promise<void> | null = null;
  private resolvedAgentBaseUrl: string | null = null;
  private spawnedBySdk = false;
  private readonly candidateBaseUrls: string[];
  private status: RuntimeControllerStatus = {
    state: 'idle',
    runtimeSource: 'packaged',
    runtimeVersion: null,
    lastError: null,
    helperPath: null,
    ownsProcess: false,
    agentBaseUrl: null,
  };

  private readonly startupTimeoutMs: number;
  private readonly startupPollIntervalMs: number;
  private readonly shutdownTimeoutMs: number;

  constructor(private readonly options: RuntimeControllerOptions) {
    const normalizedExplicitBaseUrl = options.agentBaseUrl?.trim()
      ? normalizeBaseUrl(options.agentBaseUrl.trim())
      : undefined;
    const explicitCandidates = options.candidateBaseUrls?.map((candidate) => normalizeBaseUrl(candidate));
    this.candidateBaseUrls =
      explicitCandidates && explicitCandidates.length > 0
        ? explicitCandidates
        : buildAgentBaseUrlCandidates(normalizedExplicitBaseUrl);
    this.resolvedAgentBaseUrl = normalizedExplicitBaseUrl ?? null;
    this.status.agentBaseUrl = this.resolvedAgentBaseUrl;
    this.startupTimeoutMs = Math.max(500, options.startupTimeoutMs ?? 8_000);
    this.startupPollIntervalMs = Math.max(100, options.startupPollIntervalMs ?? 300);
    this.shutdownTimeoutMs = Math.max(200, options.shutdownTimeoutMs ?? 4_000);
  }

  getStatus(): RuntimeControllerStatus {
    return { ...this.status };
  }

  getAgentBaseUrl(): string {
    return this.resolvedAgentBaseUrl ?? DEFAULT_AGENT_BASE_URL;
  }

  async ensureStarted(): Promise<void> {
    const currentlyResolved = this.resolvedAgentBaseUrl ?? this.candidateBaseUrls[0] ?? DEFAULT_AGENT_BASE_URL;
    if (await isHealthyOnce(currentlyResolved)) {
      this.resolvedAgentBaseUrl = currentlyResolved;
      this.status.agentBaseUrl = currentlyResolved;
      this.status.state = 'healthy';
      this.status.lastError = null;
      this.status.runtimeSource = this.spawnedBySdk ? this.status.runtimeSource : 'external';
      this.status.ownsProcess = this.spawnedBySdk;
      return;
    }
    if (!this.startInFlight) {
      this.startInFlight = this.startInternal().finally(() => {
        this.startInFlight = null;
      });
    }
    await this.startInFlight;
  }

  async shutdown(reason = 'sdk_shutdown'): Promise<void> {
    const runtimeBaseUrl = this.getAgentBaseUrl();
    try {
      const shutdownController = new AbortController();
      const shutdownTimer = setTimeout(() => shutdownController.abort(), 400);
      await fetch(`${runtimeBaseUrl.replace(/\/+$/, '')}/shutdown`, {
        method: 'POST',
        signal: shutdownController.signal,
      }).catch(() => {
        // Runtime may not expose a shutdown endpoint yet.
      });
      clearTimeout(shutdownTimer);
    } catch {
      // best effort
    }

    const child = this.child;
    if (!child || child.exitCode !== null || !this.spawnedBySdk) {
      this.status.state = 'stopped';
      this.status.ownsProcess = false;
      return;
    }

    try {
      child.kill('SIGTERM');
    } catch {
      // best effort
    }

    const exitedGracefully = await waitForExit(child, this.shutdownTimeoutMs);
    if (!exitedGracefully) {
      try {
        child.kill('SIGKILL');
      } catch {
        // best effort
      }
      await waitForExit(child, 500);
    }
    this.status.state = 'stopped';
    this.status.lastError = reason;
    this.status.ownsProcess = false;
    this.child = null;
    this.spawnedBySdk = false;
  }

  private async startInternal(): Promise<void> {
    this.status.state = 'starting';
    this.status.lastError = null;
    const artifact = resolveRuntimeArtifact();
    this.status.helperPath = artifact.helperPath;
    this.status.runtimeVersion = artifact.runtimeVersion;
    this.status.runtimeSource = artifact.runtimeSource;

    for (const candidateBaseUrl of this.candidateBaseUrls) {
      if (await isHealthyOnce(candidateBaseUrl)) {
        this.resolvedAgentBaseUrl = candidateBaseUrl;
        this.status.agentBaseUrl = candidateBaseUrl;
        this.status.state = 'healthy';
        this.status.runtimeSource = 'external';
        this.status.ownsProcess = false;
        this.spawnedBySdk = false;
        this.status.lastError = null;
        return;
      }

      const started = await this.trySpawnForCandidate(artifact, candidateBaseUrl);
      if (started) {
        return;
      }
    }
    const fallbackBaseUrl = this.candidateBaseUrls[0] ?? DEFAULT_AGENT_BASE_URL;
    this.resolvedAgentBaseUrl = fallbackBaseUrl;
    this.status.agentBaseUrl = fallbackBaseUrl;
    this.status.state = 'unavailable';
    this.status.ownsProcess = false;
    this.spawnedBySdk = false;
    this.status.lastError = 'runtime_unavailable';
    throw new Error('runtime_unavailable');
  }

  private async trySpawnForCandidate(
    artifact: RuntimeArtifact,
    candidateBaseUrl: string,
  ): Promise<boolean> {
    const helperPath = artifact.helperPath;
    const isNodeEntrypoint = helperPath.endsWith('.js') || helperPath.endsWith('.cjs') || helperPath.endsWith('.mjs');
    const command = isNodeEntrypoint ? process.execPath : helperPath;
    const args = isNodeEntrypoint ? [helperPath] : [];
    const port = parsePortFromAgentBaseUrl(candidateBaseUrl);
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PORT: port,
        DYNO_PROJECT_ID: this.options.projectId ?? process.env.DYNO_PROJECT_ID,
        DYNO_CONFIG_RESOLVER_URL:
          this.options.configResolverUrl ?? process.env.DYNO_CONFIG_RESOLVER_URL,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      process.stdout.write(`[dyno-runtime] ${chunk.toString()}`);
    });
    child.stderr?.on('data', (chunk) => {
      process.stderr.write(`[dyno-runtime] ${chunk.toString()}`);
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) {
        this.child = null;
        this.spawnedBySdk = false;
        this.status.state = 'unavailable';
        this.status.ownsProcess = false;
        this.status.lastError = `runtime exited (${signal ?? code ?? 'unknown'})`;
      }
    });

    this.child = child;
    this.spawnedBySdk = true;
    const healthy = await waitForHealthy(candidateBaseUrl, this.startupTimeoutMs, this.startupPollIntervalMs);
    if (!healthy) {
      try {
        if (child.exitCode === null) {
          child.kill('SIGTERM');
          await waitForExit(child, 500);
        }
      } catch {
        // best effort
      }
      if (this.child === child) {
        this.child = null;
      }
      this.spawnedBySdk = false;
      return false;
    }

    this.resolvedAgentBaseUrl = candidateBaseUrl;
    this.status.agentBaseUrl = candidateBaseUrl;
    this.status.state = 'healthy';
    this.status.ownsProcess = true;
    this.status.lastError = null;
    return true;
  }
}

export function createDefaultRuntimeController(options: RuntimeControllerOptions): RuntimeController {
  return new ManagedRuntimeController(options);
}
