/**
 * Dev-only: stop whatever is listening on the dashboard dev port (default 3000)
 * so `npm run dev:dashboard` can bind again after a stuck Next listener.
 * Override with DASHBOARD_PORT. Exits 0 even when the port is free.
 */
import { execFileSync, execSync } from 'node:child_process';
import process from 'node:process';

const port = Number(process.env.DASHBOARD_PORT) || 3000;

function findListeningPidsWindows(netstatText) {
  const pids = new Set();
  const needle = `:${port}`;
  for (const line of netstatText.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) {
      continue;
    }
    const localIdx = line.indexOf(needle);
    if (localIdx === -1) {
      continue;
    }
    const afterPort = line[localIdx + needle.length];
    if (afterPort !== undefined && afterPort !== ' ' && afterPort !== '\t') {
      continue;
    }
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (/^\d+$/.test(pid)) {
      pids.add(pid);
    }
  }
  return [...pids];
}

function findListeningPidsUnixLsof() {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    });
    return out
      .trim()
      .split(/\n/)
      .filter((p) => /^\d+$/.test(p));
  } catch {
    return [];
  }
}

function main() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      const pids = findListeningPidsWindows(out);
      if (pids.length === 0) {
        console.log(`[dashboard] port ${port} is free`);
        return;
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
          console.log(`[dashboard] freed port ${port} (stopped PID ${pid})`);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const pids = findListeningPidsUnixLsof();
    if (pids.length === 0) {
      console.log(`[dashboard] port ${port} is free`);
      return;
    }
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
        console.log(`[dashboard] freed port ${port} (stopped PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn('[dashboard] could not check/free port:', err?.message ?? err);
  }
}

main();
