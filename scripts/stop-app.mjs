/**
 * Best-effort: stop Electron processes that look like this repo's demo-electron dev session.
 * Matches CommandLine containing "demo-electron", not every electron.exe.
 */
import { execFileSync, execSync } from 'node:child_process';
import process from 'node:process';

function stopWindows() {
  const oneLiner =
    "$procs = Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" -ErrorAction SilentlyContinue; " +
    "if (-not $procs) { Write-Host '[stop:app] no electron.exe processes'; exit 0 }; " +
    "$k = 0; foreach ($p in $procs) { if ($p.CommandLine -and ($p.CommandLine -match 'demo-electron')) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('[stop:app] stopped PID ' + $p.ProcessId); $k++ } }; " +
    "if ($k -eq 0) { Write-Host '[stop:app] no matching demo-electron Electron processes found' }";
  try {
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', oneLiner],
      { stdio: 'inherit', windowsHide: true },
    );
  } catch {
    console.warn('[stop:app] PowerShell finished with non-zero exit (often harmless if nothing to stop)');
  }
}

function stopUnix() {
  try {
    const out = execSync('pgrep -f electron 2>/dev/null || true', { encoding: 'utf8', shell: true });
    const pids = out
      .trim()
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    let killed = 0;
    for (const pid of pids) {
      try {
        const cmd = execSync(`ps -p ${pid} -o args= 2>/dev/null`, { encoding: 'utf8' }).trim();
        if (cmd.includes('demo-electron')) {
          process.kill(Number(pid), 'SIGTERM');
          console.log(`[stop:app] stopped PID ${pid}`);
          killed++;
        }
      } catch {
        /* ignore */
      }
    }
    if (killed === 0) {
      console.log('[stop:app] no matching demo-electron Electron processes found');
    }
  } catch (e) {
    console.warn('[stop:app] unix scan failed:', e?.message ?? e);
  }
}

if (process.platform === 'win32') {
  stopWindows();
} else {
  stopUnix();
}
