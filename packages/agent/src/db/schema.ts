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
  updated_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at INTEGER,
  finished_at INTEGER
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
  updated_at INTEGER NOT NULL,
  cpu_utilization_percent REAL,
  memory_available_mb REAL,
  memory_used_percent REAL,
  gpu_utilization_percent REAL,
  gpu_memory_free_mb REAL,
  gpu_memory_used_mb REAL,
  battery_percent REAL,
  thermal_state TEXT
);

CREATE TABLE IF NOT EXISTS worker_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_paused INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

/** Schema version `7`: richer `machine_state` signals for Step 15 readiness. */
const UPSERT_SCHEMA_VERSION = `
INSERT INTO agent_state (key, value) VALUES ('schema_version', '7')
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

/**
 * Idempotent ALTERs for existing DB files created before Step 12.
 */
function migrateJobsAttemptColumns(db: Database): void {
  const cols = listTableColumns(db, 'jobs');
  if (!cols.has('attempt_count')) {
    db.run(`ALTER TABLE jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.has('last_error')) {
    db.run(`ALTER TABLE jobs ADD COLUMN last_error TEXT`);
  }
}

/** Idempotent ALTERs for existing DB files before Step 14 (`started_at` / `finished_at` are ms since epoch). */
function migrateJobsLifecycleTimestamps(db: Database): void {
  const cols = listTableColumns(db, 'jobs');
  if (!cols.has('started_at')) {
    db.run(`ALTER TABLE jobs ADD COLUMN started_at INTEGER`);
  }
  if (!cols.has('finished_at')) {
    db.run(`ALTER TABLE jobs ADD COLUMN finished_at INTEGER`);
  }
}

/** Step 15: optional machine signals on `machine_state` (additive, nullable columns). */
function migrateMachineStateRichSignals(db: Database): void {
  const cols = listTableColumns(db, 'machine_state');
  const add = (name: string, sqlType: string) => {
    if (!cols.has(name)) {
      db.run(`ALTER TABLE machine_state ADD COLUMN ${name} ${sqlType}`);
    }
  };
  add('cpu_utilization_percent', 'REAL');
  add('memory_available_mb', 'REAL');
  add('memory_used_percent', 'REAL');
  add('gpu_utilization_percent', 'REAL');
  add('gpu_memory_free_mb', 'REAL');
  add('gpu_memory_used_mb', 'REAL');
  add('battery_percent', 'REAL');
  add('thermal_state', 'TEXT');
}

/**
 * Ensures `worker_state` singleton exists (CREATE IF NOT EXISTS already ran in DDL).
 */
function ensureWorkerStateRow(db: Database): void {
  const stmt = db.prepare(`SELECT 1 FROM worker_state WHERE id = 1`);
  const exists = stmt.step();
  stmt.free();
  if (!exists) {
    const now = Date.now();
    db.run(`INSERT INTO worker_state (id, is_paused, updated_at) VALUES (1, 0, ?)`, [now]);
  }
}

export function bootstrapSchema(db: Database): void {
  db.exec(DDL);
  migrateJobsExecutionColumns(db);
  migrateJobsAttemptColumns(db);
  migrateJobsLifecycleTimestamps(db);
  migrateMachineStateRichSignals(db);
  ensureWorkerStateRow(db);
  db.run(UPSERT_SCHEMA_VERSION);
}
