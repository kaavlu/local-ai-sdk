import path from 'node:path';
import os from 'node:os';
import { GoogleGenAI } from '@google/genai';
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { Dyno, type DynoStatus, type MachineStateInput } from '@dynosdk/ts';

type EmbedPurpose = 'index' | 'search';

type BackendStatus = {
  backendId: 'gemini_cloud' | 'dyno';
  backendLabel: string;
  statusLine: string;
  details: string[];
  runtimeState?: string;
  runtimeLastError?: string | null;
  runtimeSource?: string;
  runtimeVersion?: string | null;
  model?: string;
  generationModelState?: 'not_loaded' | 'loading' | 'ready' | 'failed';
  generationWarmupState?: 'idle' | 'warming' | 'ready' | 'failed';
  generationWarmupLastError?: string | null;
};

type EmbeddingBackend = {
  getStatus: () => Promise<BackendStatus>;
  embedTexts: (texts: string[], purpose: EmbedPurpose) => Promise<number[][]>;
};

const GEMINI_MODEL = 'gemini-embedding-001';

const PROJECT_API_KEY = process.env.DYNO_PROJECT_API_KEY?.trim() || process.env.DYNO_API_KEY?.trim() || '';
const CONFIG_RESOLVER_URL = process.env.DYNO_CONFIG_RESOLVER_URL?.trim() ?? '';
const FALLBACK_BASE_URL = process.env.DYNO_FALLBACK_BASE_URL?.trim() ?? '';
const FALLBACK_API_KEY = process.env.DYNO_FALLBACK_API_KEY?.trim() ?? '';
const FALLBACK_MODEL = process.env.DYNO_FALLBACK_MODEL?.trim() ?? '';

/** How often to report machine state to the agent (ms). */
const MACHINE_STATE_INTERVAL_MS = 5000;

let lastMachineStateErrorLog = 0;
const MACHINE_STATE_ERROR_LOG_THROTTLE_MS = 30_000;

let dyno: Dyno | null = null;
let dynoStatus: DynoStatus | null = null;
let generationModelState: 'not_loaded' | 'loading' | 'ready' | 'failed' | null = null;
let generationWarmupState: 'idle' | 'warming' | 'ready' | 'failed' = 'idle';
let generationWarmupLastError: string | null = null;
let generationWarmupStartedAt: number | null = null;
let generationWarmupCompletedAt: number | null = null;
let generationWarmupPromise: Promise<void> | null = null;

// Keep demo rendering stable on machines where Chromium GPU subprocesses crash.
app.disableHardwareAcceleration();
// Use a deterministic writable path to avoid cache permission failures in some shells.
app.setPath('userData', path.join(os.tmpdir(), 'dyno-demo-electron'));

async function ensureDynoReady(): Promise<Dyno> {
  if (dyno) {
    return dyno;
  }
  if (!PROJECT_API_KEY) {
    throw new Error('DYNO_PROJECT_API_KEY (or DYNO_API_KEY) is required for Dyno backend mode.');
  }
  if (!FALLBACK_BASE_URL || !FALLBACK_API_KEY) {
    throw new Error(
      'DYNO_FALLBACK_BASE_URL and DYNO_FALLBACK_API_KEY are required for app-owned fallback configuration.',
    );
  }

  const initOptions: Parameters<typeof Dyno.init>[0] = {
    projectApiKey: PROJECT_API_KEY,
    fallback: {
      baseUrl: FALLBACK_BASE_URL,
      apiKey: FALLBACK_API_KEY,
      model: FALLBACK_MODEL || undefined,
    },
  };
  if (CONFIG_RESOLVER_URL) {
    initOptions.configResolverUrl = CONFIG_RESOLVER_URL;
  }

  dyno = await Dyno.init(initOptions);
  dynoStatus = await dyno.getStatus();
  void refreshGenerationModelState(dyno);
  return dyno;
}

async function refreshGenerationModelState(runtime: Dyno): Promise<void> {
  try {
    const models = await runtime.sdk.getModelDebugInfo();
    generationModelState = models.generate_text?.state ?? null;
    if (generationModelState === 'ready' && generationWarmupState === 'idle') {
      generationWarmupState = 'ready';
      generationWarmupCompletedAt = Date.now();
    }
    if (generationModelState === 'failed' && generationWarmupState !== 'failed') {
      generationWarmupState = 'failed';
      generationWarmupLastError = models.generate_text?.lastError ?? null;
      generationWarmupCompletedAt = Date.now();
    }
  } catch {
    /* keep previous generation model state; status call should stay resilient */
  }
}

function startGenerationWarmup(runtime: Dyno): void {
  if (generationWarmupPromise) {
    return;
  }
  generationWarmupState = 'warming';
  generationWarmupLastError = null;
  generationWarmupStartedAt = Date.now();
  generationWarmupCompletedAt = null;
  generationWarmupPromise = (async () => {
    try {
      const state = await runtime.sdk.warmupGenerateTextModel();
      generationModelState = state.state;
      if (state.state === 'ready') {
        generationWarmupState = 'ready';
        generationWarmupCompletedAt = Date.now();
      } else if (state.state === 'failed') {
        generationWarmupState = 'failed';
        generationWarmupLastError = state.lastError;
        generationWarmupCompletedAt = Date.now();
      } else {
        generationWarmupState = 'warming';
      }
    } catch (error) {
      generationWarmupState = 'failed';
      generationWarmupLastError = error instanceof Error ? error.message : String(error);
      generationWarmupCompletedAt = Date.now();
    } finally {
      await refreshGenerationModelState(runtime);
      generationWarmupPromise = null;
    }
  })();
}

function parseGeminiVector(raw: unknown): number[] {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('Gemini embedding response did not include a valid object.');
  }
  const root = raw as Record<string, unknown>;
  const candidates = [
    (root.embedding as Record<string, unknown> | undefined)?.values,
    (Array.isArray(root.embeddings) ? root.embeddings[0] : undefined) as
      | Record<string, unknown>
      | undefined,
  ];
  for (const item of candidates) {
    const maybeValues =
      Array.isArray(item) ? item : (item as Record<string, unknown> | undefined)?.values;
    if (Array.isArray(maybeValues) && maybeValues.every((v) => typeof v === 'number')) {
      return maybeValues;
    }
  }
  throw new Error('Gemini embedding response did not include numeric vector values.');
}

function parseDynoEmbeddingOutput(output: unknown): number[] {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('Dyno embedding job output has unexpected shape.');
  }
  const maybeEmbedding = (output as Record<string, unknown>).embedding;
  if (!Array.isArray(maybeEmbedding) || !maybeEmbedding.every((v) => typeof v === 'number')) {
    throw new Error('Dyno embedding job output is missing numeric `embedding`.');
  }
  return maybeEmbedding;
}

function createGeminiBackend(): EmbeddingBackend {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for Gemini Cloud backend mode.');
  }
  const client = new GoogleGenAI({ apiKey });
  return {
    async getStatus() {
      return {
        backendId: 'gemini_cloud',
        backendLabel: 'Gemini Cloud',
        statusLine: 'Ready',
        model: GEMINI_MODEL,
        details: [
          `model: ${GEMINI_MODEL}`,
          'provider: Gemini embedContent API',
        ],
      };
    },
    async embedTexts(texts, purpose) {
      console.log('[demo-electron][gemini] embedding request', { purpose, count: texts.length });
      const vectors: number[][] = [];
      for (const text of texts) {
        const response = await client.models.embedContent({
          model: GEMINI_MODEL,
          contents: text,
        });
        vectors.push(parseGeminiVector(response));
      }
      console.log('[demo-electron][gemini] embedding request completed', {
        purpose,
        count: vectors.length,
      });
      return vectors;
    },
  };
}

function createDynoBackend(): EmbeddingBackend {
  return {
    async getStatus() {
      const runtimeAgentUrl = dynoStatus?.runtime.agentBaseUrl ?? '(runtime unresolved)';
      try {
        const runtime = await ensureDynoReady();
        dynoStatus = await runtime.getStatus();
        await refreshGenerationModelState(runtime);
      } catch (error) {
        return {
          backendId: 'dyno',
          backendLabel: 'Dyno',
          statusLine: 'Runtime unavailable',
          runtimeState: dynoStatus?.runtime.state ?? 'unavailable',
          runtimeLastError:
            dynoStatus?.runtime.lastError ?? (error instanceof Error ? error.message : String(error)),
          runtimeSource: dynoStatus?.runtime.runtimeSource ?? 'external',
          runtimeVersion: dynoStatus?.runtime.runtimeVersion ?? null,
          generationModelState: generationModelState ?? undefined,
          generationWarmupState,
          generationWarmupLastError,
          details: [
            `agentUrl: ${runtimeAgentUrl}`,
            `runtimeState: ${dynoStatus?.runtime.state ?? 'unavailable'}`,
            `runtimeError: ${dynoStatus?.runtime.lastError ?? (error instanceof Error ? error.message : String(error))}`,
            `generationWarmup: ${generationWarmupState}`,
          ],
        };
      }
      const resolvedAgentUrl = dynoStatus?.runtime.agentBaseUrl ?? runtimeAgentUrl;
      const warmupLine =
        generationWarmupState === 'warming'
          ? 'Ready (warming local generation model...)'
          : generationWarmupState === 'failed'
            ? 'Ready (generation warmup failed; cloud fallback may be used)'
            : 'Ready';
      const warmupDurationMs =
        generationWarmupStartedAt && generationWarmupCompletedAt
          ? Math.max(0, generationWarmupCompletedAt - generationWarmupStartedAt)
          : null;
      return {
        backendId: 'dyno',
        backendLabel: 'Dyno',
        statusLine: warmupLine,
        runtimeState: dynoStatus?.runtime.state ?? 'healthy',
        runtimeLastError: dynoStatus?.runtime.lastError ?? null,
        runtimeSource: dynoStatus?.runtime.runtimeSource ?? 'external',
        runtimeVersion: dynoStatus?.runtime.runtimeVersion ?? null,
        generationModelState: generationModelState ?? undefined,
        generationWarmupState,
        generationWarmupLastError,
        details: [
          `agentUrl: ${resolvedAgentUrl}`,
          `runtimeState: ${dynoStatus?.runtime.state ?? 'healthy'}`,
          `runtimeSource: ${dynoStatus?.runtime.runtimeSource ?? 'external'}`,
          `generationModelState: ${generationModelState ?? 'unknown'}`,
          `generationWarmup: ${generationWarmupState}${warmupDurationMs !== null ? ` (${warmupDurationMs}ms)` : ''}`,
          ...(generationWarmupLastError ? [`generationWarmupError: ${generationWarmupLastError}`] : []),
        ],
      };
    },
    async embedTexts(texts, purpose) {
      const runtime = await ensureDynoReady();
      console.log('[demo-electron][dyno] embedding request started', {
        purpose,
        count: texts.length,
      });
      const vectors: number[][] = [];
      for (const text of texts) {
        const result = await runtime.embedText(text);
        vectors.push(result.embedding);
      }
      dynoStatus = await runtime.getStatus();
      console.log('[demo-electron][dyno] embedding request completed', {
        purpose,
        count: vectors.length,
      });
      return vectors;
    },
  };
}

// DEMO SWITCH: choose one embedding backend, then reload the app.
// const embeddingBackend = createGeminiBackend();
const embeddingBackend = createDynoBackend();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 980,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

/**
 * Reads idle + power signals from Electron and reports them to the agent via the SDK.
 * Kept in the main process (not renderer); demo-only, not part of the SDK surface.
 */
function postMachineStateToAgent(): void {
  if (!dyno) {
    return;
  }
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const idleState = powerMonitor.getSystemIdleState(10);
  const isSystemIdle = idleState === 'idle' || idleState === 'locked';
  const isOnAcPower = !powerMonitor.onBatteryPower;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryAvailableMb = Math.floor(freeMem / (1024 * 1024));
  const memoryUsedPercent =
    totalMem > 0 ? Math.round(100 * (1 - freeMem / totalMem)) : undefined;
  const body: MachineStateInput = {
    isSystemIdle,
    idleSeconds,
    isOnAcPower,
    memoryAvailableMb,
  };
  if (memoryUsedPercent !== undefined) {
    body.memoryUsedPercent = memoryUsedPercent;
  }
  const thermalFn = (
    powerMonitor as typeof powerMonitor & { getCurrentThermalState?: () => string }
  ).getCurrentThermalState;
  if (typeof thermalFn === 'function') {
    const thermalState = thermalFn.call(powerMonitor);
    if (thermalState != null && thermalState !== 'unknown') {
      body.thermalState = thermalState;
    }
  }
  void dyno.sdk.reportMachineState(body).catch((err: unknown) => {
    const now = Date.now();
    if (now - lastMachineStateErrorLog >= MACHINE_STATE_ERROR_LOG_THROTTLE_MS) {
      lastMachineStateErrorLog = now;
      console.warn('[demo-electron] machine-state: report failed (runtime unavailable?)', err);
    }
  });
}

app.whenReady().then(async () => {
  ipcMain.handle('demo:get-backend-status', async () => embeddingBackend.getStatus());

  ipcMain.handle('demo:embed-texts', async (_event, payload: { texts: string[]; purpose: EmbedPurpose }) => {
    if (!payload || !Array.isArray(payload.texts)) {
      throw new Error('Invalid embed request payload. Expected { texts: string[] }.');
    }
    const texts = payload.texts.map((text) => String(text).trim()).filter((text) => text.length > 0);
    if (texts.length === 0) {
      throw new Error('No non-empty texts were provided.');
    }
    const vectors = await embeddingBackend.embedTexts(texts, payload.purpose);
    return { count: vectors.length, dimensions: vectors[0]?.length ?? 0, vectors };
  });

  try {
    await ensureDynoReady();
    if (dyno) {
      startGenerationWarmup(dyno);
    }
    console.log('[demo-electron] dyno.init completed');
  } catch (err) {
    console.warn(
      '[demo-electron] Dyno init failed; runtime remains unavailable until configuration is fixed',
      err,
    );
  }

  createWindow();
  postMachineStateToAgent();
  const machineStateTimer = setInterval(postMachineStateToAgent, MACHINE_STATE_INTERVAL_MS);
  app.on('before-quit', () => {
    clearInterval(machineStateTimer);
    void dyno?.shutdown('electron_before_quit');
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
