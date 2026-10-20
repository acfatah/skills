import { Database } from "bun:sqlite";
import type { Row, SqlValue, Stmt, Store } from "./types.ts";

export class LocalStore implements Store {
  readonly kind = "local";
  readonly db: Database;

  constructor(readonly path: string) {
    this.db = new Database(path, { create: true });
    // busy_timeout first, so switching to WAL waits for other processes.
    this.db.run("PRAGMA busy_timeout = 5000");
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
  }

  async query<T = Row>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...args) as T[];
  }

  async exec(sql: string, args: SqlValue[] = []): Promise<void> {
    this.db.prepare(sql).run(...args);
  }

  async batch(stmts: Stmt[]): Promise<Row[][]> {
    // IMMEDIATE takes the write lock up front; a deferred transaction that
    // upgrades later can fail with SQLITE_BUSY without waiting.
    const run = this.db.transaction(() =>
      stmts.map((s) => this.db.prepare(s.sql).all(...(s.args ?? [])) as Row[]),
    );
    return run.immediate();
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
