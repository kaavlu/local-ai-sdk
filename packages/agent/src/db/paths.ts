import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Directory for agent-local files (SQLite DB, etc.).
 * Override with env `LOCAL_AGENT_DATA_DIR` (absolute or relative cwd).
 * Default: `<packages/agent>/.local-agent-data` (resolved from this module’s location in `dist/`).
 */
export function getAgentDataDir(): string {
  const override = process.env.LOCAL_AGENT_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  const packageRoot = path.resolve(MODULE_DIR, '..', '..');
  return path.join(packageRoot, '.local-agent-data');
}

export function getDbFilePath(): string {
  return path.join(getAgentDataDir(), 'agent.sqlite');
}

export function ensureAgentDataDir(): void {
  fs.mkdirSync(getAgentDataDir(), { recursive: true });
}
