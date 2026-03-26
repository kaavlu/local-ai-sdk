import type { Database } from 'sql.js';
import { persistDatabaseToDisk } from '../db/persist.js';

/**
 * Single logical row in `machine_state` (id = 1), as stored in SQLite (booleans as 0/1).
 */
export interface MachineStateRecord {
  id: 1;
  is_system_idle: 0 | 1;
  idle_seconds: number;
  is_on_ac_power: 0 | 1;
  updated_at: number;
}

export interface MachineStatePostInput {
  isSystemIdle: boolean;
  idleSeconds: number;
  isOnAcPower: boolean;
}

const UPSERT_SQL = `
INSERT INTO machine_state (id, is_system_idle, idle_seconds, is_on_ac_power, updated_at)
VALUES (1, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  is_system_idle = excluded.is_system_idle,
  idle_seconds = excluded.idle_seconds,
  is_on_ac_power = excluded.is_on_ac_power,
  updated_at = excluded.updated_at
`;

/**
 * Upserts the single row `id = 1` and persists the database file.
 */
export function saveMachineState(
  db: Database,
  dbPath: string,
  input: MachineStatePostInput,
): MachineStateRecord {
  const updated_at = Date.now();
  const is_system_idle: 0 | 1 = input.isSystemIdle ? 1 : 0;
  const is_on_ac_power: 0 | 1 = input.isOnAcPower ? 1 : 0;
  const idle_seconds = Math.floor(input.idleSeconds);

  db.run(UPSERT_SQL, [is_system_idle, idle_seconds, is_on_ac_power, updated_at]);

  const record: MachineStateRecord = {
    id: 1,
    is_system_idle,
    idle_seconds,
    is_on_ac_power,
    updated_at,
  };

  persistDatabaseToDisk(db, dbPath);
  return record;
}

/**
 * Returns the stored row, or `null` if none exists yet.
 */
export function getLatestMachineState(db: Database): MachineStateRecord | null {
  const res = db.exec(
    `SELECT id, is_system_idle, idle_seconds, is_on_ac_power, updated_at
     FROM machine_state WHERE id = 1`,
  );
  const row = res[0]?.values?.[0];
  if (!row || row.length < 5) {
    return null;
  }

  const [, is_system_idle, idle_seconds, is_on_ac_power, updated_at] = row;

  return {
    id: 1,
    is_system_idle: Number(is_system_idle) === 1 ? 1 : 0,
    idle_seconds: typeof idle_seconds === 'number' ? idle_seconds : Number(idle_seconds),
    is_on_ac_power: Number(is_on_ac_power) === 1 ? 1 : 0,
    updated_at: typeof updated_at === 'number' ? updated_at : Number(updated_at),
  };
}

/** JSON shape for `GET /debug/machine-state`. */
export function machineStateToDebugJson(record: MachineStateRecord | null): Record<string, unknown> {
  if (!record) {
    return {
      exists: false,
      message:
        'No machine state row yet. POST /machine-state from the Electron demo (or manually) to report signals.',
    };
  }
  return {
    exists: true,
    isSystemIdle: record.is_system_idle === 1,
    idleSeconds: record.idle_seconds,
    isOnAcPower: record.is_on_ac_power === 1,
    updatedAt: record.updated_at,
  };
}

function machineStateMeaningfullyChanged(
  prev: MachineStateRecord | null,
  next: MachineStateRecord,
): boolean {
  if (!prev) {
    return true;
  }
  return (
    prev.is_system_idle !== next.is_system_idle ||
    prev.idle_seconds !== next.idle_seconds ||
    prev.is_on_ac_power !== next.is_on_ac_power
  );
}

export function maybeLogMachineStateUpdate(
  prev: MachineStateRecord | null,
  next: MachineStateRecord,
): void {
  if (!machineStateMeaningfullyChanged(prev, next)) {
    return;
  }
  console.log(
    '[agent] machine-state: updated (idle=' +
      (next.is_system_idle === 1 ? 'yes' : 'no') +
      ', idleSeconds=' +
      next.idle_seconds +
      ', ac=' +
      (next.is_on_ac_power === 1 ? 'yes' : 'no') +
      ')',
  );
}

export function validateMachineStatePostBody(
  body: unknown,
): { ok: true; value: MachineStatePostInput } | { ok: false; message: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'body must be a JSON object' };
  }

  const o = body as Record<string, unknown>;

  if (typeof o.isSystemIdle !== 'boolean') {
    return { ok: false, message: 'isSystemIdle must be a boolean' };
  }
  if (typeof o.isOnAcPower !== 'boolean') {
    return { ok: false, message: 'isOnAcPower must be a boolean' };
  }
  if (typeof o.idleSeconds !== 'number' || !Number.isFinite(o.idleSeconds)) {
    return { ok: false, message: 'idleSeconds must be a finite number' };
  }
  if (o.idleSeconds < 0) {
    return { ok: false, message: 'idleSeconds must be >= 0' };
  }

  return {
    ok: true,
    value: {
      isSystemIdle: o.isSystemIdle,
      idleSeconds: o.idleSeconds,
      isOnAcPower: o.isOnAcPower,
    },
  };
}
