import fs from 'node:fs';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import type { Database } from 'sql.js';
import { ensureAgentDataDir, getAgentDataDir, getDbFilePath } from './paths.js';
import { bootstrapSchema } from './schema.js';
import { persistDatabaseToDisk } from './persist.js';

const require = createRequire(import.meta.url);

export interface InitializedDatabase {
  db: Database;
  path: string;
}

function loadWasmBinary(): ArrayBuffer {
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  const buf = fs.readFileSync(wasmPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function readSchemaVersion(db: Database): string | null {
  const res = db.exec(`SELECT value FROM agent_state WHERE key = 'schema_version'`);
  const row = res[0]?.values?.[0]?.[0];
  return row != null ? String(row) : null;
}

/**
 * Opens (or creates) the SQLite file, runs idempotent schema DDL, sets `schema_version` in `agent_state`, and persists to disk.
 */
export async function initDatabase(): Promise<InitializedDatabase> {
  const dataDir = getAgentDataDir();
  console.log('[agent] phase=data: data_dir=' + dataDir);
  ensureAgentDataDir();
  console.log('[agent] phase=data: ok (directory exists or was created)');

  const dbPath = getDbFilePath();
  console.log('[agent] phase=db: db_file=' + dbPath);

  console.log('[agent] phase=db: initializing SQLite engine (sql.js wasm)');
  const SQL = await initSqlJs({ wasmBinary: loadWasmBinary() });

  const existed = fs.existsSync(dbPath);
  let db: Database;
  if (existed) {
    console.log('[agent] phase=db: opening existing database file');
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } else {
    console.log('[agent] phase=db: creating new in-memory database (will persist after schema)');
    db = new SQL.Database();
  }

  try {
    console.log('[agent] phase=db: applying schema (CREATE IF NOT EXISTS + schema_version upsert)');
    bootstrapSchema(db);
    const version = readSchemaVersion(db);
    console.log(
      '[agent] phase=db: schema ok (agent_state.schema_version=' + (version ?? '(missing)') + ')',
    );
    console.log('[agent] phase=db: writing database file to disk');
    persistDatabaseToDisk(db, dbPath);
    console.log('[agent] phase=db: complete');
  } catch (err) {
    db.close();
    console.error('[agent] phase=db: FAILED during schema or persist — see error above');
    throw err;
  }

  return { db, path: dbPath };
}

export { getAgentDataDir, getDbFilePath } from './paths.js';
export { getDatabaseDebugInfo, type DatabaseDebugInfo } from './debug-info.js';
export { persistDatabaseToDisk } from './persist.js';
