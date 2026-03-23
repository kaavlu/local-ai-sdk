import type { Database } from 'sql.js';

const DDL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  policy TEXT NOT NULL,
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
`;

const UPSERT_SCHEMA_VERSION = `
INSERT INTO agent_state (key, value) VALUES ('schema_version', '1')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`;

export function bootstrapSchema(db: Database): void {
  db.exec(DDL);
  db.run(UPSERT_SCHEMA_VERSION);
}
