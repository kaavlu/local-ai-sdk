import path from 'node:path';
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron';
import { LocalAiSdk } from '@local-ai/sdk-ts';

/** Base URL for the local agent (override with LOCAL_AGENT_URL). */
const AGENT_BASE_URL = process.env.LOCAL_AGENT_URL ?? 'http://127.0.0.1:8787';

const sdk = new LocalAiSdk({ baseUrl: AGENT_BASE_URL });

/** How often to report machine state to the agent (ms). */
const MACHINE_STATE_INTERVAL_MS = 5000;

let lastMachineStateErrorLog = 0;
const MACHINE_STATE_ERROR_LOG_THROTTLE_MS = 30_000;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 640,
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

  void sdk
    .reportMachineState({
      isSystemIdle,
      idleSeconds,
      isOnAcPower,
    })
    .then(() => {
      /* ok */
    })
    .catch((err: unknown) => {
      const now = Date.now();
      if (now - lastMachineStateErrorLog >= MACHINE_STATE_ERROR_LOG_THROTTLE_MS) {
        lastMachineStateErrorLog = now;
        console.warn('[demo-electron] machine-state: report failed (is the agent running?)', err);
      }
    });
}

app.whenReady().then(() => {
  ipcMain.handle('demo:create-demo-job', async () => {
    const created = await sdk.createJob({
      taskType: 'echo',
      payload: { text: 'sdk-demo' },
      policy: 'local',
    });
    const finalJob = await sdk.waitForJobCompletion(created.id, {
      pollIntervalMs: 300,
      timeoutMs: 60_000,
    });
    let result: Awaited<ReturnType<typeof sdk.getJobResult>> | null = null;
    if (finalJob.state === 'completed') {
      result = await sdk.getJobResult(created.id);
    }
    return {
      jobId: created.id,
      state: finalJob.state,
      result,
    };
  });

  void sdk
    .healthCheck()
    .then(() => {
      console.log('[demo-electron] agent health: ok');
    })
    .catch((err: unknown) => {
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
