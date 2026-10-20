import { type Connection, DatabaseError, TimeoutError, connect } from "@tursodatabase/serverless";
import { AuthError, CliError, Offline } from "../errors.ts";
import type { Row, SqlValue, Stmt, Store } from "./types.ts";

interface ResultSet {
  columns: string[];
  rows: unknown[][];
}

function toNumber(v: unknown): unknown {
  if (typeof v === "bigint" && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(v);
  }
  return v;
}

// Same row shape as bun:sqlite: one plain object per row, integers as numbers.
function toRows(r: ResultSet): Row[] {
  return r.rows.map((values) => Object.fromEntries(r.columns.map((c, i) => [c, toNumber(values[i])])));
}

export function classify(err: unknown, url: string): Error {
  if (err instanceof TimeoutError) return new Offline(`Turso did not answer in time (${url})`);
  if (err instanceof DatabaseError) {
    const status = /HTTP error! status: (\d+)/.exec(err.message);
    if (status) {
      const code = Number(status[1]);
      if (code === 401 || code === 403) return new AuthError(`Turso refused the token for ${url} (HTTP ${code})`);
      if (code === 429 || code >= 500) return new Offline(`Turso is unavailable (HTTP ${code}, ${url})`);
      return new CliError(`Turso request failed (HTTP ${code}, ${url})`);
    }
    return new CliError(err.message);
  }
  // fetch itself failed: DNS, refused connection, no network.
  return new Offline(`Turso is unreachable (${url}): ${(err as Error)?.message ?? err}`);
}

export class TursoStore implements Store {
  readonly kind = "turso";
  private conn: Connection;

  constructor(
    readonly url: string,
    authToken: string,
    timeoutMs = 5000,
  ) {
    this.conn = connect({ url, authToken, defaultQueryTimeout: timeoutMs });
  }

  private async send(stmts: Stmt[], atomic: boolean): Promise<Row[][]> {
    const batch = stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] }));
    try {
      const results = (await this.conn.batch(batch, { mode: atomic ? "write" : undefined, raw: true })) as ResultSet[];
      return results.map(toRows);
    } catch (err) {
      throw classify(err, this.url);
    }
  }

  async query<T = Row>(sql: string, args: SqlValue[] = []): Promise<T[]> {
    const [rows] = await this.send([{ sql, args }], false);
    return (rows ?? []) as T[];
  }

  async exec(sql: string, args: SqlValue[] = []): Promise<void> {
    await this.send([{ sql, args }], false);
  }

  async batch(stmts: Stmt[]): Promise<Row[][]> {
    return this.send(stmts, true);
  }

  async close(): Promise<void> {
    try {
      await this.conn.close();
    } catch {
      // Closing is best effort; the server drops idle streams anyway.
    }
  }
}
