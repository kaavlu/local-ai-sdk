import type { Database, SqlValue } from 'sql.js';

export interface DatabaseDebugInfo {
  path: string;
  tables: string[];
  counts: { jobs: number; results: number; runningJobs: number };
  schema_version: string | null;
  device_profile_row: boolean;
  machine_state_row: boolean;
}

function firstColumnStrings(db: Database, sql: string): string[] {
  const res = db.exec(sql);
  const set = res[0];
  if (!set?.values?.length) {
    return [];
  }
  return set.values.map((row: SqlValue[]) => String(row[0]));
}

function firstScalarNumber(db: Database, sql: string): number {
  const res = db.exec(sql);
  const set = res[0];
  if (!set?.values?.length) {
    return 0;
  }
  const v = set.values[0][0];
  return typeof v === 'number' ? v : Number(v);
}

export function getDatabaseDebugInfo(db: Database, dbPath: string): DatabaseDebugInfo {
  const tables = firstColumnStrings(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );

  const jobs = firstScalarNumber(db, 'SELECT COUNT(*) FROM jobs');
  const results = firstScalarNumber(db, 'SELECT COUNT(*) FROM results');
  const runningJobs = firstScalarNumber(
    db,
    `SELECT COUNT(*) FROM jobs WHERE state = 'running'`,
  );

  const versionRes = db.exec(
    `SELECT value FROM agent_state WHERE key = 'schema_version'`,
  );
  const vset = versionRes[0];
  const schema_version =
    vset?.values?.length && vset.values[0][0] != null
      ? String(vset.values[0][0])
      : null;

  const device_profile_row = firstScalarNumber(db, 'SELECT COUNT(*) FROM device_profile WHERE id = 1') > 0;
  const machine_state_row = firstScalarNumber(db, 'SELECT COUNT(*) FROM machine_state WHERE id = 1') > 0;

  return {
    path: dbPath,
    tables,
    counts: { jobs, results, runningJobs },
    schema_version,
    device_profile_row,
    machine_state_row,
  };
}
