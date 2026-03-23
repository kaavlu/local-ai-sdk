import fs from 'node:fs';
import os from 'node:os';
import type { Database } from 'sql.js';
import { persistDatabaseToDisk } from '../db/persist.js';

/**
 * Snapshot of device characteristics stored in `device_profile` (single row, id = 1).
 */
export interface DeviceProfile {
  id: 1;
  os: string;
  arch: string;
  cpu_count: number;
  ram_total_mb: number;
  ram_free_mb: number;
  disk_free_mb: number;
  updated_at: number;
}

export interface CollectDeviceProfileOptions {
  /**
   * Directory whose filesystem is queried for free space via `fs.statfsSync` when available.
   * Defaults to `process.cwd()`. After DB init, pass the agent data directory so disk numbers
   * match where the SQLite file lives.
   */
  diskPath?: string;
}

const MB = 1024 * 1024;

function getCpuCount(): number {
  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }
  const cpus = os.cpus();
  return cpus.length > 0 ? cpus.length : 0;
}

/**
 * Free space on the filesystem containing `targetPath`, in MiB (rounded).
 * Returns `-1` if `fs.statfsSync` is unavailable or the probe fails (see README caveats).
 */
export function getDiskFreeMb(targetPath: string): number {
  const statfsSync = (
    fs as typeof import('node:fs') & { statfsSync?: (path: string) => import('node:fs').StatsFs }
  ).statfsSync;

  if (typeof statfsSync !== 'function') {
    return -1;
  }

  try {
    const s = statfsSync(targetPath);
    const avail = s.bavail ?? s.bfree;
    const bytes = Number(avail) * Number(s.bsize);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return -1;
    }
    return Math.round(bytes / MB);
  } catch {
    return -1;
  }
}

/**
 * Collects OS/arch/CPU/RAM/disk metrics. Does not touch the database.
 */
export function collectDeviceProfile(options?: CollectDeviceProfileOptions): Omit<DeviceProfile, 'id' | 'updated_at'> {
  const diskPath = options?.diskPath ?? process.cwd();
  const platform = os.platform();
  const release = os.release();

  return {
    os: platform + ' ' + release,
    arch: os.arch(),
    cpu_count: getCpuCount(),
    ram_total_mb: Math.round(os.totalmem() / MB),
    ram_free_mb: Math.round(os.freemem() / MB),
    disk_free_mb: getDiskFreeMb(diskPath),
  };
}

const UPSERT_SQL = `
INSERT INTO device_profile (id, os, arch, cpu_count, ram_total_mb, ram_free_mb, disk_free_mb, updated_at)
VALUES (1, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  os = excluded.os,
  arch = excluded.arch,
  cpu_count = excluded.cpu_count,
  ram_total_mb = excluded.ram_total_mb,
  ram_free_mb = excluded.ram_free_mb,
  disk_free_mb = excluded.disk_free_mb,
  updated_at = excluded.updated_at
`;

/**
 * Writes the profile for id = 1 and flushes the sql.js DB to disk (required for persistence).
 */
export function saveDeviceProfile(
  db: Database,
  dbPath: string,
  metrics: Omit<DeviceProfile, 'id' | 'updated_at'>,
): DeviceProfile {
  const updated_at = Date.now();
  const profile: DeviceProfile = {
    id: 1,
    ...metrics,
    updated_at,
  };

  db.run(UPSERT_SQL, [
    profile.os,
    profile.arch,
    profile.cpu_count,
    profile.ram_total_mb,
    profile.ram_free_mb,
    profile.disk_free_mb,
    profile.updated_at,
  ]);

  persistDatabaseToDisk(db, dbPath);
  return profile;
}

/**
 * Returns the stored profile row, or null if missing.
 */
export function getLatestDeviceProfile(db: Database): DeviceProfile | null {
  const res = db.exec(
    `SELECT id, os, arch, cpu_count, ram_total_mb, ram_free_mb, disk_free_mb, updated_at
     FROM device_profile WHERE id = 1`,
  );
  const row = res[0]?.values?.[0];
  if (!row || row.length < 8) {
    return null;
  }

  const [, osVal, archVal, cpu_count, ram_total_mb, ram_free_mb, disk_free_mb, updated_at] = row;

  return {
    id: 1,
    os: osVal != null ? String(osVal) : '',
    arch: archVal != null ? String(archVal) : '',
    cpu_count: typeof cpu_count === 'number' ? cpu_count : Number(cpu_count),
    ram_total_mb: typeof ram_total_mb === 'number' ? ram_total_mb : Number(ram_total_mb),
    ram_free_mb: typeof ram_free_mb === 'number' ? ram_free_mb : Number(ram_free_mb),
    disk_free_mb: typeof disk_free_mb === 'number' ? disk_free_mb : Number(disk_free_mb),
    updated_at: typeof updated_at === 'number' ? updated_at : Number(updated_at),
  };
}
