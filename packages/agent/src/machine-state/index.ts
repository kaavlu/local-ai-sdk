import type { Database } from 'sql.js';
import { persistDatabaseToDisk } from '../db/persist.js';

/**
 * Single logical row in `machine_state` (id = 1), as stored in SQLite (booleans as 0/1).
 * Optional signal columns are null when unknown or not reported (Step 15).
 */
export interface MachineStateRecord {
  id: 1;
  is_system_idle: 0 | 1;
  idle_seconds: number;
  is_on_ac_power: 0 | 1;
  updated_at: number;
  cpu_utilization_percent: number | null;
  memory_available_mb: number | null;
  memory_used_percent: number | null;
  gpu_utilization_percent: number | null;
  gpu_memory_free_mb: number | null;
  gpu_memory_used_mb: number | null;
  battery_percent: number | null;
  thermal_state: string | null;
}

/** POST /machine-state body (camelCase). Omitted optional keys keep prior DB values. */
export interface MachineStatePostInput {
  isSystemIdle: boolean;
  idleSeconds: number;
  isOnAcPower: boolean;
  cpuUtilizationPercent?: number | null;
  memoryAvailableMb?: number | null;
  memoryUsedPercent?: number | null;
  gpuUtilizationPercent?: number | null;
  gpuMemoryFreeMb?: number | null;
  gpuMemoryUsedMb?: number | null;
  batteryPercent?: number | null;
  thermalState?: string | null;
}

const UPSERT_SQL = `
INSERT INTO machine_state (
  id, is_system_idle, idle_seconds, is_on_ac_power, updated_at,
  cpu_utilization_percent, memory_available_mb, memory_used_percent,
  gpu_utilization_percent, gpu_memory_free_mb, gpu_memory_used_mb,
  battery_percent, thermal_state
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  is_system_idle = excluded.is_system_idle,
  idle_seconds = excluded.idle_seconds,
  is_on_ac_power = excluded.is_on_ac_power,
  updated_at = excluded.updated_at,
  cpu_utilization_percent = excluded.cpu_utilization_percent,
  memory_available_mb = excluded.memory_available_mb,
  memory_used_percent = excluded.memory_used_percent,
  gpu_utilization_percent = excluded.gpu_utilization_percent,
  gpu_memory_free_mb = excluded.gpu_memory_free_mb,
  gpu_memory_used_mb = excluded.gpu_memory_used_mb,
  battery_percent = excluded.battery_percent,
  thermal_state = excluded.thermal_state
`;

function nullableNumberCell(v: unknown): number | null {
  if (v === null || v === undefined) {
    return null;
  }
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function nullableStringCell(v: unknown): string | null {
  if (v === null || v === undefined) {
    return null;
  }
  return String(v);
}

function parseMachineStateRow(values: unknown[]): MachineStateRecord | null {
  if (!values || values.length < 5) {
    return null;
  }
  const [
    ,
    is_system_idle,
    idle_seconds,
    is_on_ac_power,
    updated_at,
    cpu_utilization_percent,
    memory_available_mb,
    memory_used_percent,
    gpu_utilization_percent,
    gpu_memory_free_mb,
    gpu_memory_used_mb,
    battery_percent,
    thermal_state,
  ] = values;

  return {
    id: 1,
    is_system_idle: Number(is_system_idle) === 1 ? 1 : 0,
    idle_seconds: typeof idle_seconds === 'number' ? idle_seconds : Number(idle_seconds),
    is_on_ac_power: Number(is_on_ac_power) === 1 ? 1 : 0,
    updated_at: typeof updated_at === 'number' ? updated_at : Number(updated_at),
    cpu_utilization_percent: nullableNumberCell(cpu_utilization_percent),
    memory_available_mb: nullableNumberCell(memory_available_mb),
    memory_used_percent: nullableNumberCell(memory_used_percent),
    gpu_utilization_percent: nullableNumberCell(gpu_utilization_percent),
    gpu_memory_free_mb: nullableNumberCell(gpu_memory_free_mb),
    gpu_memory_used_mb: nullableNumberCell(gpu_memory_used_mb),
    battery_percent: nullableNumberCell(battery_percent),
    thermal_state: nullableStringCell(thermal_state),
  };
}

function mergeOptionalField<T>(
  prev: MachineStateRecord | null,
  input: MachineStatePostInput,
  key: keyof MachineStatePostInput,
  pickPrev: (r: MachineStateRecord) => T | null,
): T | null {
  if (!(key in input)) {
    return prev ? pickPrev(prev) : null;
  }
  return (input[key] as T | null | undefined) ?? null;
}

/**
 * Upserts the single row `id = 1` and persists the database file.
 * Optional fields omitted from the request keep their previous stored values.
 */
export function saveMachineState(
  db: Database,
  dbPath: string,
  input: MachineStatePostInput,
): MachineStateRecord {
  const prev = getLatestMachineState(db);
  const updated_at = Date.now();
  const is_system_idle: 0 | 1 = input.isSystemIdle ? 1 : 0;
  const is_on_ac_power: 0 | 1 = input.isOnAcPower ? 1 : 0;
  const idle_seconds = Math.floor(input.idleSeconds);

  const record: MachineStateRecord = {
    id: 1,
    is_system_idle,
    idle_seconds,
    is_on_ac_power,
    updated_at,
    cpu_utilization_percent: mergeOptionalField(prev, input, 'cpuUtilizationPercent', (r) => r.cpu_utilization_percent),
    memory_available_mb: mergeOptionalField(prev, input, 'memoryAvailableMb', (r) => r.memory_available_mb),
    memory_used_percent: mergeOptionalField(prev, input, 'memoryUsedPercent', (r) => r.memory_used_percent),
    gpu_utilization_percent: mergeOptionalField(prev, input, 'gpuUtilizationPercent', (r) => r.gpu_utilization_percent),
    gpu_memory_free_mb: mergeOptionalField(prev, input, 'gpuMemoryFreeMb', (r) => r.gpu_memory_free_mb),
    gpu_memory_used_mb: mergeOptionalField(prev, input, 'gpuMemoryUsedMb', (r) => r.gpu_memory_used_mb),
    battery_percent: mergeOptionalField(prev, input, 'batteryPercent', (r) => r.battery_percent),
    thermal_state: mergeOptionalField(prev, input, 'thermalState', (r) => r.thermal_state),
  };

  db.run(UPSERT_SQL, [
    record.id,
    record.is_system_idle,
    record.idle_seconds,
    record.is_on_ac_power,
    record.updated_at,
    record.cpu_utilization_percent,
    record.memory_available_mb,
    record.memory_used_percent,
    record.gpu_utilization_percent,
    record.gpu_memory_free_mb,
    record.gpu_memory_used_mb,
    record.battery_percent,
    record.thermal_state,
  ]);

  persistDatabaseToDisk(db, dbPath);
  return record;
}

/**
 * Returns the stored row, or `null` if none exists yet.
 */
export function getLatestMachineState(db: Database): MachineStateRecord | null {
  const res = db.exec(
    `SELECT id, is_system_idle, idle_seconds, is_on_ac_power, updated_at,
            cpu_utilization_percent, memory_available_mb, memory_used_percent,
            gpu_utilization_percent, gpu_memory_free_mb, gpu_memory_used_mb,
            battery_percent, thermal_state
     FROM machine_state WHERE id = 1`,
  );
  const row = res[0]?.values?.[0];
  if (!row) {
    return null;
  }
  return parseMachineStateRow(row);
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
    cpuUtilizationPercent: record.cpu_utilization_percent,
    memoryAvailableMb: record.memory_available_mb,
    memoryUsedPercent: record.memory_used_percent,
    gpuUtilizationPercent: record.gpu_utilization_percent,
    gpuMemoryFreeMb: record.gpu_memory_free_mb,
    gpuMemoryUsedMb: record.gpu_memory_used_mb,
    batteryPercent: record.battery_percent,
    thermalState: record.thermal_state,
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
    prev.is_on_ac_power !== next.is_on_ac_power ||
    prev.cpu_utilization_percent !== next.cpu_utilization_percent ||
    prev.memory_available_mb !== next.memory_available_mb ||
    prev.memory_used_percent !== next.memory_used_percent ||
    prev.gpu_utilization_percent !== next.gpu_utilization_percent ||
    prev.gpu_memory_free_mb !== next.gpu_memory_free_mb ||
    prev.gpu_memory_used_mb !== next.gpu_memory_used_mb ||
    prev.battery_percent !== next.battery_percent ||
    prev.thermal_state !== next.thermal_state
  );
}

export function maybeLogMachineStateUpdate(
  prev: MachineStateRecord | null,
  next: MachineStateRecord,
): void {
  if (!machineStateMeaningfullyChanged(prev, next)) {
    return;
  }
  const mem =
    next.memory_available_mb != null
      ? ' memAvailMb=' + Math.round(next.memory_available_mb)
      : next.memory_used_percent != null
        ? ' memUsed%=' + Math.round(next.memory_used_percent)
        : '';
  const cpu = next.cpu_utilization_percent != null ? ' cpu%=' + Math.round(next.cpu_utilization_percent) : '';
  console.log(
    '[agent] machine-state: updated (idle=' +
      (next.is_system_idle === 1 ? 'yes' : 'no') +
      ', idleSeconds=' +
      next.idle_seconds +
      ', ac=' +
      (next.is_on_ac_power === 1 ? 'yes' : 'no') +
      mem +
      cpu +
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

  const out: MachineStatePostInput = {
    isSystemIdle: o.isSystemIdle,
    idleSeconds: o.idleSeconds,
    isOnAcPower: o.isOnAcPower,
  };

  const readOptNumber = (jsonKey: string): { ok: false; message: string } | { ok: true; n: number | null } => {
    const v = o[jsonKey];
    if (v === null) {
      return { ok: true, n: null };
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, message: `${jsonKey} must be a finite number or null` };
    }
    return { ok: true, n: v };
  };

  if ('cpuUtilizationPercent' in o) {
    const r = readOptNumber('cpuUtilizationPercent');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && (r.n < 0 || r.n > 100)) {
      return { ok: false, message: 'cpuUtilizationPercent must be between 0 and 100 when set' };
    }
    out.cpuUtilizationPercent = r.n;
  }
  if ('memoryAvailableMb' in o) {
    const r = readOptNumber('memoryAvailableMb');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && r.n < 0) {
      return { ok: false, message: 'memoryAvailableMb must be >= 0 when set' };
    }
    out.memoryAvailableMb = r.n;
  }
  if ('memoryUsedPercent' in o) {
    const r = readOptNumber('memoryUsedPercent');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && (r.n < 0 || r.n > 100)) {
      return { ok: false, message: 'memoryUsedPercent must be between 0 and 100 when set' };
    }
    out.memoryUsedPercent = r.n;
  }
  if ('gpuUtilizationPercent' in o) {
    const r = readOptNumber('gpuUtilizationPercent');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && (r.n < 0 || r.n > 100)) {
      return { ok: false, message: 'gpuUtilizationPercent must be between 0 and 100 when set' };
    }
    out.gpuUtilizationPercent = r.n;
  }
  if ('gpuMemoryFreeMb' in o) {
    const r = readOptNumber('gpuMemoryFreeMb');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && r.n < 0) {
      return { ok: false, message: 'gpuMemoryFreeMb must be >= 0 when set' };
    }
    out.gpuMemoryFreeMb = r.n;
  }
  if ('gpuMemoryUsedMb' in o) {
    const r = readOptNumber('gpuMemoryUsedMb');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && r.n < 0) {
      return { ok: false, message: 'gpuMemoryUsedMb must be >= 0 when set' };
    }
    out.gpuMemoryUsedMb = r.n;
  }
  if ('batteryPercent' in o) {
    const r = readOptNumber('batteryPercent');
    if (!r.ok) {
      return r;
    }
    if (r.n !== null && (r.n < 0 || r.n > 100)) {
      return { ok: false, message: 'batteryPercent must be between 0 and 100 when set' };
    }
    out.batteryPercent = r.n;
  }
  if ('thermalState' in o) {
    const v = o.thermalState;
    if (v === null) {
      out.thermalState = null;
    } else if (typeof v !== 'string') {
      return { ok: false, message: 'thermalState must be a string or null' };
    } else {
      const t = v.trim();
      if (t.length > 64) {
        return { ok: false, message: 'thermalState is too long' };
      }
      out.thermalState = t.length > 0 ? t : null;
    }
  }

  return { ok: true, value: out };
}
