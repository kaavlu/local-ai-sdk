import type { Database } from 'sql.js';
import { persistDatabaseToDisk } from '../db/persist.js';

const ROW_ID = 1;

export function getIsWorkerPaused(db: Database): boolean {
  const stmt = db.prepare(`SELECT is_paused FROM worker_state WHERE id = ?`);
  stmt.bind([ROW_ID]);
  if (!stmt.step()) {
    stmt.free();
    return false;
  }
  const row = stmt.getAsObject() as Record<string, unknown>;
  stmt.free();
  const v = row.is_paused;
  return v === 1 || v === true;
}

/** Idempotent; persists to disk. */
export function setWorkerPaused(db: Database, dbPath: string, paused: boolean): void {
  const now = Date.now();
  db.run(`UPDATE worker_state SET is_paused = ?, updated_at = ? WHERE id = ?`, [
    paused ? 1 : 0,
    now,
    ROW_ID,
  ]);
  persistDatabaseToDisk(db, dbPath);
}
