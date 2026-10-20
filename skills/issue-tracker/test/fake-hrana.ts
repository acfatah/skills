// An in-process stand-in for a Turso database: Hrana v3 over HTTP on
// /v3/pipeline (and /v3/cursor), backed by an in-memory bun:sqlite. It
// answers the request shapes @tursodatabase/serverless sends for batch,
// execute, sequence, get_autocommit, and close.
import { Database } from "bun:sqlite";
import type { Server } from "bun";

type Value = { type: "null" } | { type: "integer"; value: string } | { type: "float"; value: number } | { type: "text"; value: string } | { type: "blob"; base64: string };

interface HStmt {
  sql: string;
  args?: Value[];
  named_args?: { name: string; value: Value }[];
  want_rows?: boolean;
}

type Cond =
  | { type: "ok"; step: number }
  | { type: "error"; step: number }
  | { type: "not"; cond: Cond }
  | { type: "and"; conds: Cond[] }
  | { type: "or"; conds: Cond[] }
  | { type: "is_autocommit" };

function decode(v: Value): unknown {
  switch (v.type) {
    case "null":
      return null;
    case "integer":
      return Number(v.value);
    case "float":
    case "text":
      return v.value;
    case "blob":
      return Buffer.from(v.base64, "base64");
  }
}

function encode(v: unknown): Value {
  if (v === null || v === undefined) return { type: "null" };
  if (typeof v === "bigint") return { type: "integer", value: v.toString() };
  if (typeof v === "number") return Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v };
  if (v instanceof Uint8Array) return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}

export type Mode = "up" | "unauthorized" | "unavailable";

export class FakeHrana {
  readonly db = new Database(":memory:");
  readonly requests: unknown[] = [];
  mode: Mode = "up";
  token = "secret-token";
  private server: Server<undefined> | null = null;
  private port = 0;

  constructor() {
    this.db.run("PRAGMA foreign_keys = ON");
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  start(): this {
    this.server = Bun.serve({ port: this.port, hostname: "127.0.0.1", fetch: (req) => this.handle(req) });
    this.port = this.server.port!;
    return this;
  }

  // Simulates losing the network: the port refuses connections.
  stop(): void {
    this.server?.stop(true);
    this.server = null;
  }

  private async handle(req: Request): Promise<Response> {
    if (this.mode === "unavailable") return new Response("down", { status: 503 });
    if (this.mode === "unauthorized" || req.headers.get("authorization") !== `Bearer ${this.token}`) {
      return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
    }
    const path = new URL(req.url).pathname;
    const body = (await req.json()) as { baton: string | null; requests?: unknown[]; batch?: unknown };
    this.requests.push({ path, body });
    if (path === "/v3/pipeline") {
      const results = (body.requests ?? []).map((r) => this.request(r as { type: string }));
      return Response.json({ baton: "baton-1", base_url: null, results });
    }
    if (path === "/v3/cursor") {
      const { step_results, step_errors } = this.runBatch((body.batch as { steps: { stmt: HStmt; condition?: Cond }[] }).steps);
      const lines = [JSON.stringify({ baton: "baton-1", base_url: null })];
      step_results.forEach((r, step) => {
        const err = step_errors[step];
        if (err) lines.push(JSON.stringify({ type: "step_error", step, error: err }));
        if (!r) return;
        lines.push(JSON.stringify({ type: "step_begin", step, cols: r.cols }));
        for (const row of r.rows) lines.push(JSON.stringify({ type: "row", row }));
        lines.push(JSON.stringify({ type: "step_end", affected_row_count: r.affected_row_count, last_insert_rowid: r.last_insert_rowid }));
      });
      return new Response(`${lines.join("\n")}\n`);
    }
    return new Response("not found", { status: 404 });
  }

  private request(r: { type: string; [k: string]: unknown }) {
    try {
      switch (r.type) {
        case "batch": {
          const result = this.runBatch((r.batch as { steps: { stmt: HStmt; condition?: Cond }[] }).steps);
          return { type: "ok", response: { type: "batch", result } };
        }
        case "execute":
          return { type: "ok", response: { type: "execute", result: this.exec(r.stmt as HStmt) } };
        case "sequence":
          this.db.run(r.sql as string);
          return { type: "ok", response: { type: "sequence" } };
        case "get_autocommit":
          return { type: "ok", response: { type: "get_autocommit", is_autocommit: !this.db.inTransaction } };
        case "close":
          return { type: "ok", response: { type: "close" } };
        default:
          return { type: "error", error: { message: `fake: unsupported request ${r.type}`, code: "UNSUPPORTED" } };
      }
    } catch (err) {
      return { type: "error", error: { message: (err as Error).message, code: "SQLITE_ERROR" } };
    }
  }

  private exec(stmt: HStmt) {
    const args = stmt.named_args?.length
      ? Object.fromEntries(stmt.named_args.map((a) => [a.name, decode(a.value)]))
      : (stmt.args ?? []).map(decode);
    const st = this.db.prepare(stmt.sql);
    const cols = st.columnNames.map((name) => ({ name, decltype: null }));
    let rows: Value[][] = [];
    let affected = 0;
    let lastId: string | null = null;
    if (cols.length > 0) {
      const raw = Array.isArray(args) ? st.values(...(args as never[])) : st.values(args as never);
      rows = raw.map((row) => row.map(encode));
    } else {
      const res = Array.isArray(args) ? st.run(...(args as never[])) : st.run(args as never);
      affected = res.changes;
      lastId = String(res.lastInsertRowid);
    }
    return { cols, rows, affected_row_count: affected, last_insert_rowid: lastId, rows_read: 0, rows_written: 0, query_duration_ms: 0 };
  }

  private runBatch(steps: { stmt: HStmt; condition?: Cond }[]) {
    const step_results: (ReturnType<FakeHrana["exec"]> | null)[] = [];
    const step_errors: ({ message: string; code: string } | null)[] = [];
    const holds = (c: Cond): boolean => {
      switch (c.type) {
        case "ok":
          return step_results[c.step] != null && step_errors[c.step] == null;
        case "error":
          return step_errors[c.step] != null;
        case "not":
          return !holds(c.cond);
        case "and":
          return c.conds.every(holds);
        case "or":
          return c.conds.some(holds);
        case "is_autocommit":
          return !this.db.inTransaction;
      }
    };
    for (const step of steps) {
      if (step.condition && !holds(step.condition)) {
        step_results.push(null);
        step_errors.push(null);
        continue;
      }
      try {
        step_results.push(this.exec(step.stmt));
        step_errors.push(null);
      } catch (err) {
        step_results.push(null);
        step_errors.push({ message: (err as Error).message, code: (err as { code?: string }).code ?? "SQLITE_ERROR" });
      }
    }
    return { step_results, step_errors };
  }
}
