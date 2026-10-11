import { expoDb } from '../db/client';

/**
 * SQLite-backed offline message queue.
 *
 * Messages composed while the raw TCP socket is down (or that exhaust their
 * in-flight retry budget) are persisted here so they can be flushed once the
 * engine reaches `online`. The table is created and owned by this module via
 * the synchronous expo-sqlite API, so it needs no Drizzle migration and never
 * blocks the JS thread on a promise.
 */

export type OfflineQueueStatus = 'queued' | 'sending' | 'sent' | 'failed';

export interface OfflineQueueItem {
  id: string;
  to: string;
  body: string;
  protocol: string;
  meta: Record<string, unknown> | null;
  status: OfflineQueueStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  nextAttemptAt: number;
  lastAttemptAt: number | null;
  error: string | null;
}

export interface EnqueueInput {
  id: string;
  to: string;
  body: string;
  protocol?: string;
  meta?: Record<string, unknown> | null;
  maxAttempts?: number;
  /** Delay before the first flush attempt (default: immediate). */
  delayMs?: number;
  createdAt?: number;
}

interface OfflineQueueRow {
  id: string;
  to_user: string;
  body: string;
  protocol: string;
  meta: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: number;
  next_attempt_at: number;
  last_attempt_at: number | null;
  error: string | null;
}

const DEFAULT_MAX_ATTEMPTS = 3;

const DDL = `
CREATE TABLE IF NOT EXISTS offline_queue (
  id TEXT PRIMARY KEY NOT NULL,
  to_user TEXT NOT NULL,
  body TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'im',
  meta TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS offline_queue_status_idx
  ON offline_queue (status, next_attempt_at);
`;

function rowToItem(row: OfflineQueueRow): OfflineQueueItem {
  let meta: Record<string, unknown> | null = null;
  if (row.meta) {
    try {
      const parsed: unknown = JSON.parse(row.meta);
      if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    to: row.to_user,
    body: row.body,
    protocol: row.protocol,
    meta,
    status: row.status as OfflineQueueStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
    nextAttemptAt: row.next_attempt_at,
    lastAttemptAt: row.last_attempt_at,
    error: row.error,
  };
}

export class OfflineQueue {
  constructor() {
    expoDb.execSync(DDL);
  }

  enqueue(input: EnqueueInput): Promise<void> {
    const now = input.createdAt ?? Date.now();
    expoDb.runSync(
      `INSERT OR REPLACE INTO offline_queue
        (id, to_user, body, protocol, meta, status, attempts, max_attempts, created_at, next_attempt_at, last_attempt_at, error)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, NULL, NULL)`,
      input.id,
      input.to,
      input.body,
      input.protocol ?? 'im',
      input.meta ? JSON.stringify(input.meta) : null,
      input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      now,
      now + (input.delayMs ?? 0),
    );
    return Promise.resolve();
  }

  /** Return up to `limit` due items and atomically mark them `sending`. */
  dequeue(limit = 50, now = Date.now()): Promise<OfflineQueueItem[]> {
    const rows = expoDb.getAllSync<OfflineQueueRow>(
      `SELECT * FROM offline_queue
       WHERE status = 'queued' AND next_attempt_at <= ?
       ORDER BY created_at ASC
       LIMIT ?`,
      now,
      limit,
    );
    const items = rows.map(rowToItem);
    for (const item of items) this.markSending(item.id, now);
    return Promise.resolve(items);
  }

  markSending(id: string, now = Date.now()): Promise<void> {
    expoDb.runSync(
      `UPDATE offline_queue SET status = 'sending', last_attempt_at = ? WHERE id = ?`,
      now,
      id,
    );
    return Promise.resolve();
  }

  markSent(id: string, now = Date.now()): Promise<void> {
    expoDb.runSync(
      `UPDATE offline_queue SET status = 'sent', last_attempt_at = ?, error = NULL WHERE id = ?`,
      now,
      id,
    );
    return Promise.resolve();
  }

  /** Reschedule a failed attempt, marking the item terminal once exhausted. */
  markRetry(id: string, error: string, delayMs: number, now = Date.now()): Promise<void> {
    expoDb.runSync(
      `UPDATE offline_queue
         SET attempts = attempts + 1,
             status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'queued' END,
             next_attempt_at = ?,
             last_attempt_at = ?,
             error = ?
       WHERE id = ?`,
      now + delayMs,
      now,
      error,
      id,
    );
    return Promise.resolve();
  }

  markFailed(id: string, error: string, now = Date.now()): Promise<void> {
    expoDb.runSync(
      `UPDATE offline_queue SET status = 'failed', error = ?, last_attempt_at = ? WHERE id = ?`,
      error,
      now,
      id,
    );
    return Promise.resolve();
  }

  getById(id: string): OfflineQueueItem | null {
    const row = expoDb.getFirstSync<OfflineQueueRow>(
      `SELECT * FROM offline_queue WHERE id = ?`,
      id,
    );
    return row ? rowToItem(row) : null;
  }

  getAll(status?: OfflineQueueStatus): OfflineQueueItem[] {
    const rows =
      status === undefined
        ? expoDb.getAllSync<OfflineQueueRow>(`SELECT * FROM offline_queue ORDER BY created_at ASC`)
        : expoDb.getAllSync<OfflineQueueRow>(
            `SELECT * FROM offline_queue WHERE status = ? ORDER BY created_at ASC`,
            status,
          );
    return rows.map(rowToItem);
  }

  count(status?: OfflineQueueStatus): number {
    const row =
      status === undefined
        ? expoDb.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM offline_queue`)
        : expoDb.getFirstSync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM offline_queue WHERE status = ?`,
            status,
          );
    return row?.count ?? 0;
  }

  pendingCount(): number {
    const row = expoDb.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM offline_queue WHERE status IN ('queued', 'sending')`,
    );
    return row?.count ?? 0;
  }

  remove(id: string): Promise<void> {
    expoDb.runSync(`DELETE FROM offline_queue WHERE id = ?`, id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    expoDb.execSync(`DELETE FROM offline_queue;`);
    return Promise.resolve();
  }

  /** Drop delivered / permanently failed rows older than `maxAgeMs`. */
  prune(maxAgeMs: number, now = Date.now()): Promise<number> {
    const cutoff = now - maxAgeMs;
    const before = this.count();
    expoDb.runSync(
      `DELETE FROM offline_queue
       WHERE status IN ('sent', 'failed') AND created_at < ?`,
      cutoff,
    );
    return Promise.resolve(before - this.count());
  }
}

export const offlineQueue = new OfflineQueue();
