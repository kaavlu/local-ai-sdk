import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DATA_DIR = '.dyno-agent-data';
const LEGACY_DATA_DIR = '.local-agent-data';

/**
 * Directory for agent-local files (SQLite DB, etc.).
 * Override with env `DYNO_AGENT_DATA_DIR`, or legacy `LOCAL_AGENT_DATA_DIR`.
 * Default: `<packages/agent>/.dyno-agent-data`. If that path does not exist and
 * `.local-agent-data` exists, the legacy directory is used (existing dev DBs keep working).
 */
export function getAgentDataDir(): string {
  const override =
    process.env.DYNO_AGENT_DATA_DIR?.trim() || process.env.LOCAL_AGENT_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  const packageRoot = path.resolve(MODULE_DIR, '..', '..');
  const dynoPath = path.join(packageRoot, DEFAULT_DATA_DIR);
  const legacyPath = path.join(packageRoot, LEGACY_DATA_DIR);
  let dynoExists = false;
  let legacyExists = false;
  try {
    dynoExists = fs.existsSync(dynoPath);
    legacyExists = fs.existsSync(legacyPath);
  } catch {
    // treat as absent
  }
  if (dynoExists) {
    return dynoPath;
  }
  if (legacyExists) {
    return legacyPath;
  }
  return dynoPath;
}

export function getDbFilePath(): string {
  return path.join(getAgentDataDir(), 'agent.sqlite');
}

export function ensureAgentDataDir(): void {
  fs.mkdirSync(getAgentDataDir(), { recursive: true });
}
