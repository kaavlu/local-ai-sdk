import type { Database, SqlValue } from 'sql.js';
import { MAX_JOB_ATTEMPTS } from '../jobs/index.js';
import { EMBED_TEXT_MODEL_ID, getEmbedTextModelState } from '../models/embed-text-model.js';
import { getWorkerRuntimeSnapshot } from '../worker/index.js';
import { getIsWorkerPaused } from '../worker/state.js';

type JobStateKey = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

interface StatusCounts {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

function emptyStatusCounts(): StatusCounts {
  return {
    total: 0,
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
}

function parseJobState(raw: string): JobStateKey {
  if (
    raw === 'queued' ||
    raw === 'running' ||
    raw === 'completed' ||
    raw === 'failed' ||
    raw === 'cancelled'
  ) {
    return raw;
  }
  return 'queued';
}

function safeAvgMs(db: Database, sql: string): number {
  try {
    const res = db.exec(sql);
    const set = res[0];
    if (!set?.values?.length) {
      return 0;
    }
    const v = set.values[0][0] as SqlValue;
    if (v === null) {
      return 0;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    return Math.round(n);
  } catch {
    return 0;
  }
}

function safeScalarInt(db: Database, sql: string): number {
  try {
    const res = db.exec(sql);
    const set = res[0];
    if (!set?.values?.length) {
      return 0;
    }
    const v = set.values[0][0] as SqlValue;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  } catch {
    return 0;
  }
}

function aggregateStatusByState(db: Database): StatusCounts {
  const out = emptyStatusCounts();
  try {
    const res = db.exec(`SELECT state, COUNT(*) AS c FROM jobs GROUP BY state`);
    const set = res[0];
    if (!set?.values?.length) {
      return out;
    }
    const stateIdx =
      set.columns.indexOf('state') >= 0 ? set.columns.indexOf('state') : 0;
    let cIdx = set.columns.indexOf('c');
    if (cIdx < 0) {
      cIdx = set.columns.findIndex((col) => /count/i.test(col) && col !== 'state');
    }
    if (cIdx < 0) {
      cIdx = 1;
    }
    if (set.columns.length < 2) {
      return out;
    }
    for (const row of set.values) {
      const st = row[stateIdx];
      const cRaw = row[cIdx];
      const state = parseJobState(st != null ? String(st) : 'queued');
      const c = typeof cRaw === 'number' ? cRaw : Number(cRaw);
      const n = Number.isFinite(c) ? Math.trunc(c) : 0;
      out[state] += n;
      out.total += n;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function aggregateByTaskType(db: Database): Record<string, StatusCounts> {
  const map: Record<string, StatusCounts> = {};
  try {
    const res = db.exec(
      `SELECT task_type, state, COUNT(*) AS c FROM jobs GROUP BY task_type, state`,
    );
    const set = res[0];
    if (!set?.values?.length) {
      return map;
    }
    const ttIdx =
      set.columns.indexOf('task_type') >= 0 ? set.columns.indexOf('task_type') : 0;
    const stateIdx =
      set.columns.indexOf('state') >= 0 ? set.columns.indexOf('state') : 1;
    let cIdx = set.columns.indexOf('c');
    if (cIdx < 0) {
      cIdx = set.columns.findIndex((col) => /count/i.test(col));
    }
    if (cIdx < 0) {
      cIdx = 2;
    }
    if (set.columns.length < 3) {
      return map;
    }
    for (const row of set.values) {
      const tt = row[ttIdx] != null ? String(row[ttIdx]) : '';
      if (!tt) {
        continue;
      }
      if (!map[tt]) {
        map[tt] = emptyStatusCounts();
      }
      const state = parseJobState(row[stateIdx] != null ? String(row[stateIdx]) : 'queued');
      const cRaw = row[cIdx];
      const c = typeof cRaw === 'number' ? cRaw : Number(cRaw);
      const n = Number.isFinite(c) ? Math.trunc(c) : 0;
      map[tt][state] += n;
      map[tt].total += n;
    }
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Local debug metrics derived from persisted job rows + worker/model snapshots (Step 14).
 */
export function getDebugMetricsJson(db: Database): Record<string, unknown> {
  const jobs = aggregateStatusByState(db);
  const jobTypes = aggregateByTaskType(db);

  const avgQueueMs = safeAvgMs(
    db,
    `SELECT AVG(started_at - created_at) FROM jobs
     WHERE started_at IS NOT NULL AND created_at IS NOT NULL AND started_at >= created_at`,
  );
  const avgRunMs = safeAvgMs(
    db,
    `SELECT AVG(finished_at - started_at) FROM jobs
     WHERE state IN ('completed', 'failed', 'cancelled')
       AND started_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at >= started_at`,
  );
  const avgEndToEndMs = safeAvgMs(
    db,
    `SELECT AVG(finished_at - created_at) FROM jobs
     WHERE state IN ('completed', 'failed', 'cancelled')
       AND created_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at >= created_at`,
  );

  const jobsRetried = safeScalarInt(
    db,
    `SELECT COUNT(*) FROM jobs WHERE attempt_count > 1`,
  );
  const totalAttempts = safeScalarInt(
    db,
    `SELECT COALESCE(SUM(attempt_count), 0) FROM jobs`,
  );

  const isPaused = getIsWorkerPaused(db);
  const rt = getWorkerRuntimeSnapshot();
  const embed = getEmbedTextModelState();

  return {
    ok: true,
    metrics: {
      jobs,
      jobTypes,
      timingMs: {
        avgQueueMs,
        avgRunMs,
        avgEndToEndMs,
      },
      retries: {
        jobsRetried,
        totalAttempts,
        maxAttemptsConfigured: MAX_JOB_ATTEMPTS,
      },
      worker: {
        isPaused,
        currentRunningJobId: rt.currentRunningJobId,
        jobInFlight: rt.jobInFlight,
      },
      models: {
        embedText: {
          modelId: EMBED_TEXT_MODEL_ID,
          state: embed.state,
          loadedAt: embed.loadedAt,
        },
      },
    },
  };
}
