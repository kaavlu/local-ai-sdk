import path from 'node:path';
import { app, BrowserWindow, powerMonitor } from 'electron';
import { enqueueJob } from '@local-ai/sdk-ts';

// Workspace wiring check: SDK is loadable from the main process (not invoked yet).
void enqueueJob;

/** Base URL for the local agent (override with LOCAL_AGENT_URL). */
const AGENT_BASE_URL = process.env.LOCAL_AGENT_URL ?? 'http://127.0.0.1:8787';

/** How often to POST machine state to the agent (ms). */
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
 * Reads idle + power signals from Electron and reports them to the agent.
 * Kept in the main process (not renderer); demo-only, not part of the SDK.
 */
function postMachineStateToAgent(): void {
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const idleState = powerMonitor.getSystemIdleState(10);
  const isSystemIdle = idleState === 'idle' || idleState === 'locked';
  const isOnAcPower = !powerMonitor.onBatteryPower;

  void fetch(`${AGENT_BASE_URL.replace(/\/+$/, '')}/machine-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      isSystemIdle,
      idleSeconds,
      isOnAcPower,
    }),
  })
    .then((res) => {
      if (res.ok) {
        return;
      }
      const now = Date.now();
      if (now - lastMachineStateErrorLog >= MACHINE_STATE_ERROR_LOG_THROTTLE_MS) {
        lastMachineStateErrorLog = now;
        console.warn('[demo-electron] machine-state: agent returned ' + res.status);
      }
    })
    .catch((err: unknown) => {
      const now = Date.now();
      if (now - lastMachineStateErrorLog >= MACHINE_STATE_ERROR_LOG_THROTTLE_MS) {
        lastMachineStateErrorLog = now;
        console.warn('[demo-electron] machine-state: POST failed (is the agent running?)', err);
      }
    });
}

app.whenReady().then(() => {
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
