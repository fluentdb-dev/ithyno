// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sqlite3 from "sqlite3";

const { Database } = sqlite3;

export interface DeliveryRecord {
  id: string;
  eventType: string;
  projectId: string;
  title: string;
  targetUrl: string;
  payloadRef: string;
  status: "accepted" | "queued" | "retrying" | "terminal_failed";
  attempts: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  nextAttemptAt?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  eventType: string;
  projectId: string;
  title: string;
  targetUrl: string;
  status: string;
  attempts: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  nextAttemptAt?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalStore {
  initialize(): Promise<void>;
  recordDelivery(delivery: DeliveryRecord): Promise<void>;
  recordAudit(eventType: string, projectId: string, outcome: string, detail: string): Promise<void>;
  createJob(id: string, eventType: string, projectId: string, title: string, targetUrl: string): Promise<void>;
  markJobRetry(id: string, attempt: number, nextAttemptAt: number): Promise<void>;
  markJobTerminal(id: string, error: string): Promise<void>;
  recoverExpiredLeases(now: number): Promise<string[]>;
  purgeExpiredRecords(now: number): Promise<void>;
  listReadyJobs(now: number, limit: number): Promise<JobRecord[]>;
  claimJob(id: string, leaseOwner: string, leaseExpiresAt: number): Promise<boolean>;
  close(): Promise<void>;
}

export function createOperationalStore(statePath: string, retentionMs = 7 * 24 * 60 * 60 * 1000): OperationalStore {
  return new SqliteOperationalStore(statePath, retentionMs);
}

class SqliteOperationalStore implements OperationalStore {
  private readonly dbPath: string;
  private readonly lockFilePath: string;
  private readonly retentionMs: number;
  private db: sqlite3.Database | null = null;
  private lockFileHandle: Awaited<ReturnType<typeof open>> | null = null;

  constructor(statePath: string, retentionMs: number) {
    this.dbPath = resolve(statePath, "operations.sqlite");
    this.lockFilePath = resolve(statePath, "operations.lock");
    this.retentionMs = retentionMs;
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.dbPath), { recursive: true });
    await this.acquireLock();
    this.db = new Database(this.dbPath);
    await this.run("PRAGMA journal_mode=WAL");
    await this.run("PRAGMA synchronous=NORMAL");
    await this.run(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        target_url TEXT NOT NULL,
        payload_ref TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        next_attempt_at INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await this.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        next_attempt_at INTEGER,
        terminal_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await this.run(`
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        detail TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    await this.purgeExpiredRecords(Date.now());
  }

  async recordDelivery(delivery: DeliveryRecord): Promise<void> {
    const now = new Date().toISOString();
    await this.run(
      `
        INSERT INTO deliveries (
          id, event_type, project_id, title, target_url, payload_ref, status, attempts,
          lease_owner, lease_expires_at, next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          event_type = excluded.event_type,
          project_id = excluded.project_id,
          title = excluded.title,
          target_url = excluded.target_url,
          payload_ref = excluded.payload_ref,
          status = excluded.status,
          attempts = excluded.attempts,
          lease_owner = excluded.lease_owner,
          lease_expires_at = excluded.lease_expires_at,
          next_attempt_at = excluded.next_attempt_at,
          updated_at = excluded.updated_at
      `,
      [
        delivery.id,
        delivery.eventType,
        delivery.projectId,
        delivery.title,
        delivery.targetUrl,
        delivery.payloadRef,
        delivery.status,
        delivery.attempts,
        delivery.leaseOwner ?? null,
        delivery.leaseExpiresAt ?? null,
        delivery.nextAttemptAt ?? null,
        delivery.createdAt || now,
        delivery.updatedAt || now,
      ],
    );
  }

  async recordAudit(eventType: string, projectId: string, outcome: string, detail: string): Promise<void> {
    await this.run(
      `INSERT INTO audits (id, event_type, project_id, outcome, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        eventType,
        projectId,
        outcome,
        detail,
        new Date().toISOString(),
      ],
    );
  }

  async createJob(id: string, eventType: string, projectId: string, title: string, targetUrl: string): Promise<void> {
    const now = new Date().toISOString();
    await this.run(
      `
        INSERT INTO jobs (id, event_type, project_id, title, target_url, status, attempts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `,
      [id, eventType, projectId, title, targetUrl, "queued", now, now],
    );
  }

  async markJobRetry(id: string, attempt: number, nextAttemptAt: number): Promise<void> {
    const now = new Date().toISOString();
    await this.run(
      `UPDATE jobs SET status = 'retrying', attempts = ?, next_attempt_at = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
      [attempt, nextAttemptAt, now, id],
    );
  }

  async markJobTerminal(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await this.run(
      `UPDATE jobs SET status = 'terminal_failed', terminal_error = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ? WHERE id = ?`,
      [error, now, id],
    );
  }

  async recoverExpiredLeases(now: number): Promise<string[]> {
    const rows = await this.all<{ id: string }>(
      `SELECT id FROM jobs WHERE lease_expires_at IS NOT NULL AND lease_expires_at <= ? AND status <> 'terminal_failed'`,
      [now],
    );
    if (rows.length === 0) return [];
    const recovered = rows.map((row) => row.id);
    await this.run(
      `UPDATE jobs SET lease_owner = NULL, lease_expires_at = NULL, status = 'queued', updated_at = ? WHERE id IN (${rows.map(() => "?").join(",")})`,
      [new Date().toISOString(), ...recovered],
    );
    return recovered;
  }

  async purgeExpiredRecords(now: number): Promise<void> {
    const cutoffAt = new Date(Math.max(0, now - this.retentionMs)).toISOString();
    await this.run(`DELETE FROM deliveries WHERE updated_at <= ?`, [cutoffAt]);
    await this.run(`DELETE FROM audits WHERE created_at <= ?`, [cutoffAt]);
    await this.run(`DELETE FROM jobs WHERE status = 'terminal_failed' AND updated_at <= ?`, [cutoffAt]);
  }

  async listReadyJobs(now: number, limit: number): Promise<JobRecord[]> {
    return await this.all<JobRecord>(
      `SELECT id, event_type AS eventType, project_id AS projectId, title, target_url AS targetUrl, status, attempts, lease_owner AS leaseOwner, lease_expires_at AS leaseExpiresAt, next_attempt_at AS nextAttemptAt, created_at AS createdAt, updated_at AS updatedAt FROM jobs WHERE status IN ('queued','retrying') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?) ORDER BY created_at LIMIT ?`,
      [now, now, limit],
    );
  }

  async claimJob(id: string, leaseOwner: string, leaseExpiresAt: number): Promise<boolean> {
    const now = Date.now();
    const existing = await this.all<JobRecord>(`SELECT id, lease_owner AS leaseOwner, lease_expires_at AS leaseExpiresAt FROM jobs WHERE id = ?`, [id]);
    if (existing.length === 0) return false;
    const current = existing[0];
    if (current.leaseOwner && current.leaseExpiresAt && current.leaseExpiresAt > now) {
      return false;
    }
    const result = await this.runAndGetInfo(
      `UPDATE jobs SET lease_owner = ?, lease_expires_at = ?, status = 'queued', updated_at = ? WHERE id = ? AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      [leaseOwner, leaseExpiresAt, new Date().toISOString(), id, now],
    );
    return result.changes > 0;
  }

  async close(): Promise<void> {
    await this.closeDb();
    await this.releaseLock();
  }

  private async acquireLock(): Promise<void> {
    try {
      this.lockFileHandle = await open(this.lockFilePath, "wx");
      await this.lockFileHandle.writeFile(String(process.pid));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        const existingContents = await readFile(this.lockFilePath, "utf8").catch(() => "");
        const pid = Number.parseInt(existingContents.trim(), 10);
        if (Number.isFinite(pid)) {
          try {
            process.kill(pid, 0);
            throw new Error(`single-writer lock already held: ${this.lockFilePath}`);
          } catch (killError) {
            const killCode = (killError as NodeJS.ErrnoException).code;
            if (killCode === "ESRCH") {
              await rm(this.lockFilePath, { force: true });
              return await this.acquireLock();
            }
            throw killError;
          }
        }
        throw new Error(`single-writer lock already held: ${this.lockFilePath}`);
      }
      throw error;
    }
  }

  private async releaseLock(): Promise<void> {
    if (this.lockFileHandle) {
      await this.lockFileHandle.close();
      this.lockFileHandle = null;
    }
    await rm(this.lockFilePath, { force: true });
  }

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.db) {
        reject(new Error("store is not initialized"));
        return;
      }
      this.db.run(sql, params, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async runAndGetInfo(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
    return await new Promise<{ changes: number }>((resolve, reject) => {
      if (!this.db) {
        reject(new Error("store is not initialized"));
        return;
      }
      this.db.run(sql, params, function (error) {
        if (error) reject(error);
        else resolve({ changes: this.changes });
      });
    });
  }

  private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return await new Promise<T[]>((resolve, reject) => {
      if (!this.db) {
        reject(new Error("store is not initialized"));
        return;
      }
      this.db.all(sql, params, (error, rows: T[]) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  private async closeDb(): Promise<void> {
    if (!this.db) return;
    await new Promise<void>((resolve, reject) => {
      this.db!.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.db = null;
  }
}
