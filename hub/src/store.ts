// SPDX-License-Identifier: GPL-3.0-or-later
import { resolve } from "node:path";
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

export interface OperationalStore {
  initialize(): Promise<void>;
  recordDelivery(delivery: DeliveryRecord): Promise<void>;
  recordAudit(eventType: string, projectId: string, outcome: string, detail: string): Promise<void>;
  createJob(id: string, eventType: string, projectId: string, title: string, targetUrl: string): Promise<void>;
  markJobRetry(id: string, attempt: number, nextAttemptAt: number): Promise<void>;
  markJobTerminal(id: string, error: string): Promise<void>;
  recoverExpiredLeases(now: number): Promise<string[]>;
  close(): Promise<void>;
}

export function createOperationalStore(statePath: string): OperationalStore {
  return new SqliteOperationalStore(statePath);
}

class SqliteOperationalStore implements OperationalStore {
  private readonly db: sqlite3.Database;

  constructor(statePath: string) {
    const dbPath = resolve(statePath, "operations.sqlite");
    this.db = new Database(dbPath);
  }

  async initialize(): Promise<void> {
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

  async close(): Promise<void> {
    await this.closeDb();
  }

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.run(sql, params, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return await new Promise<T[]>((resolve, reject) => {
      this.db.all(sql, params, (error, rows: T[]) => {
        if (error) reject(error);
        else resolve(rows);
      });
    });
  }

  private async closeDb(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.db.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
