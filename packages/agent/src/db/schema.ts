import type { Database } from 'sql.js';

const DDL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  policy TEXT NOT NULL,
  execution_policy TEXT,
  local_mode TEXT,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  job_id TEXT PRIMARY KEY,
  output_json TEXT NOT NULL,
  executor TEXT NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  os TEXT,
  arch TEXT,
  cpu_count INTEGER,
  ram_total_mb INTEGER,
  ram_free_mb INTEGER,
  disk_free_mb INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS machine_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_system_idle INTEGER NOT NULL,
  idle_seconds INTEGER NOT NULL,
  is_on_ac_power INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** Schema version `3`: adds `jobs.execution_policy` and `jobs.local_mode` (Step 9 execution model). */
const UPSERT_SCHEMA_VERSION = `
INSERT INTO agent_state (key, value) VALUES ('schema_version', '3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

function listTableColumns(db: Database, table: string): Set<string> {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const names = new Set<string>();
  while (stmt.step()) {
    const row = stmt.getAsObject() as Record<string, unknown>;
    const n = row.name;
    if (typeof n === 'string') {
      names.add(n);
    }
  }
  stmt.free();
  return names;
}

/**
 * Idempotent ALTERs for existing DB files created before Step 9.
 */
function migrateJobsExecutionColumns(db: Database): void {
  const cols = listTableColumns(db, 'jobs');
  if (!cols.has('execution_policy')) {
    db.run(`ALTER TABLE jobs ADD COLUMN execution_policy TEXT`);
  }
  if (!cols.has('local_mode')) {
    db.run(`ALTER TABLE jobs ADD COLUMN local_mode TEXT`);
  }
}

export function bootstrapSchema(db: Database): void {
  db.exec(DDL);
  migrateJobsExecutionColumns(db);
  db.run(UPSERT_SCHEMA_VERSION);
}
