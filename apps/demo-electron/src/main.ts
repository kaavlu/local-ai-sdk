import path from 'node:path';
import os from 'node:os';
import { GoogleGenAI } from '@google/genai';
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import type { DemoProjectConfig, MachineStateInput } from '@dyno/sdk-ts';
import {
  createDemoProjectSdkContext,
  deriveSchedulingFromDemoProject,
  DynoSdk,
  HttpDemoConfigProvider,
} from '@dyno/sdk-ts';

type EmbedPurpose = 'index' | 'search';

type BackendStatus = {
  backendId: 'gemini_cloud' | 'dyno';
  backendLabel: string;
  statusLine: string;
  details: string[];
  model?: string;
  executionPolicy?: string;
  localMode?: string;
  projectConfig?: Pick<DemoProjectConfig, 'projectId' | 'use_case_type' | 'strategy_preset'>;
};

type EmbeddingBackend = {
  getStatus: () => Promise<BackendStatus>;
  embedTexts: (texts: string[], purpose: EmbedPurpose) => Promise<number[][]>;
};

const GEMINI_MODEL = 'gemini-embedding-001';

/** Base URL for the Dyno agent (override with `DYNO_AGENT_URL`; legacy `LOCAL_AGENT_URL` still honored). */
const AGENT_BASE_URL =
  (process.env.DYNO_AGENT_URL ?? process.env.LOCAL_AGENT_URL)?.trim() || 'http://127.0.0.1:8787';
const DEMO_PROJECT_ID = process.env.DYNO_PROJECT_ID?.trim() ?? '';
const CONFIG_RESOLVER_URL = process.env.DYNO_CONFIG_RESOLVER_URL?.trim() ?? '';
const CONFIG_RESOLVER_SECRET = process.env.DYNO_CONFIG_RESOLVER_SECRET?.trim() ?? '';

const machineStateSdk = new DynoSdk({ baseUrl: AGENT_BASE_URL });

/** How often to report machine state to the agent (ms). */
const MACHINE_STATE_INTERVAL_MS = 5000;

let lastMachineStateErrorLog = 0;
const MACHINE_STATE_ERROR_LOG_THROTTLE_MS = 30_000;

// Keep demo rendering stable on machines where Chromium GPU subprocesses crash.
app.disableHardwareAcceleration();
// Use a deterministic writable path to avoid cache permission failures in some shells.
app.setPath('userData', path.join(os.tmpdir(), 'dyno-demo-electron'));

async function loadDemoProjectSdkContext() {
  if (!DEMO_PROJECT_ID) {
    throw new Error(
      'DYNO_PROJECT_ID is required for Dyno backend mode (set it in the app environment).',
    );
  }
  if (!CONFIG_RESOLVER_URL) {
    throw new Error(
      'DYNO_CONFIG_RESOLVER_URL is required for Dyno backend mode (set it in the app environment).',
    );
  }

  const configProvider = new HttpDemoConfigProvider({
    configResolverUrl: CONFIG_RESOLVER_URL,
    resolverSecret: CONFIG_RESOLVER_SECRET || undefined,
  });
  return createDemoProjectSdkContext({
    projectId: DEMO_PROJECT_ID,
    sdkOptions: { baseUrl: AGENT_BASE_URL },
    configProvider,
  });
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
      const context = await loadDemoProjectSdkContext();
      const scheduling = deriveSchedulingFromDemoProject(context.projectConfig);
      console.log('[demo-electron][dyno] project config loaded', {
        projectId: context.projectConfig.projectId,
        use_case_type: context.projectConfig.use_case_type,
        strategy_preset: context.projectConfig.strategy_preset,
        executionPolicy: scheduling.executionPolicy,
        localMode: scheduling.localMode,
      });
      return {
        backendId: 'dyno',
        backendLabel: 'Dyno',
        statusLine: 'Ready',
        executionPolicy: scheduling.executionPolicy,
        localMode: scheduling.localMode,
        details: [
          `projectId: ${context.projectConfig.projectId}`,
          `use_case_type: ${context.projectConfig.use_case_type}`,
          `strategy_preset: ${context.projectConfig.strategy_preset}`,
          `executionPolicy=${scheduling.executionPolicy}, localMode=${scheduling.localMode}`,
        ],
        projectConfig: {
          projectId: context.projectConfig.projectId,
          use_case_type: context.projectConfig.use_case_type,
          strategy_preset: context.projectConfig.strategy_preset,
        },
      };
    },
    async embedTexts(texts, purpose) {
      const context = await loadDemoProjectSdkContext();
      const scheduling = deriveSchedulingFromDemoProject(context.projectConfig);
      console.log('[demo-electron][dyno] embedding request started', {
        purpose,
        count: texts.length,
        projectId: context.projectConfig.projectId,
        strategy_preset: context.projectConfig.strategy_preset,
        executionPolicy: scheduling.executionPolicy,
        localMode: scheduling.localMode,
      });
      const vectors: number[][] = [];
      for (const text of texts) {
        const created = await context.sdk.createJob({
          taskType: 'embed_text',
          payload: { text },
          executionPolicy: scheduling.executionPolicy,
          localMode: scheduling.localMode,
        });
        const finalJob = await context.sdk.waitForJobCompletion(created.id, {
          pollIntervalMs: 300,
          timeoutMs: 360_000,
        });
        if (finalJob.state !== 'completed') {
          throw new Error(`Dyno embedding job did not complete (state=${finalJob.state}).`);
        }
        const result = await context.sdk.getJobResult(created.id);
        vectors.push(parseDynoEmbeddingOutput(result.output));
      }
      console.log('[demo-electron][dyno] embedding request completed', {
        purpose,
        count: vectors.length,
        projectId: context.projectConfig.projectId,
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
  void machineStateSdk.reportMachineState(body).catch((err: unknown) => {
    const now = Date.now();
    if (now - lastMachineStateErrorLog >= MACHINE_STATE_ERROR_LOG_THROTTLE_MS) {
      lastMachineStateErrorLog = now;
      console.warn('[demo-electron] machine-state: report failed (is the agent running?)', err);
    }
  });
}

app.whenReady().then(() => {
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

  void machineStateSdk.healthCheck().then(() => {
    console.log('[demo-electron] agent health: ok');
  }).catch((err: unknown) => {
    console.warn('[demo-electron] agent health check failed (is the agent running?)', err);
  });

  createWindow();
  postMachineStateToAgent();
  const machineStateTimer = setInterval(postMachineStateToAgent, MACHINE_STATE_INTERVAL_MS);
  app.on('before-quit', () => {
    clearInterval(machineStateTimer);
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
