/**
 * Deletes the agent local data directory (SQLite DB, etc.).
 * Matches `LOCAL_AGENT_DATA_DIR` / default `.local-agent-data` in `src/db/paths.ts`.
 *
 * Stop the agent (Ctrl+C) before running, or removal may fail if files are locked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, '..');

function getAgentDataDir() {
  const override = process.env.LOCAL_AGENT_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(PACKAGE_ROOT, '.local-agent-data');
}

function main() {
  console.log('[agent] reset: stop the agent first if it is running (Ctrl+C).');
  const dir = getAgentDataDir();
  console.log('[agent] reset: data directory=' + dir);

  if (!fs.existsSync(dir)) {
    console.log('[agent] reset: nothing to remove (directory does not exist)');
    process.exit(0);
    return;
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] reset: failed:', msg);
    console.error('[agent] reset: ensure the agent is stopped and no other process has the DB open.');
    process.exit(1);
    return;
  }

  console.log('[agent] reset: removed (jobs, results, device profile, and other local data)');
  console.log('[agent] reset: done');
}

main();
