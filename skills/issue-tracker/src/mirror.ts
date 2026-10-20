import { CliError } from "./errors.ts";
import type { DbName } from "./ids.ts";
import { clearStmts, dump, loadStmts, seqStmts } from "./rows.ts";
import type { LocalStore } from "./store/local.ts";
import type { Store } from "./store/types.ts";

// The mirror: the local file of a Turso project, holding a full copy of the
// remote plus a sync table (synced_at, next_pid, pid_map).

async function ensureSync(mirror: Store): Promise<void> {
  await mirror.exec("CREATE TABLE IF NOT EXISTS sync (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}

export async function getSync(mirror: Store, key: string): Promise<string | null> {
  await ensureSync(mirror);
  const [row] = await mirror.query<{ value: string }>("SELECT value FROM sync WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setSync(mirror: Store, key: string, value: string): Promise<void> {
  await ensureSync(mirror);
  await mirror.exec(
    "INSERT INTO sync (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Replaces the mirror's rows with the remote's, in one transaction.
export async function refreshMirror(remote: Store, mirror: LocalStore): Promise<void> {
  const d = await dump(remote);
  await ensureSync(mirror);
  await mirror.batch([
    ...clearStmts(),
    ...loadStmts(d),
    ...seqStmts(d),
    {
      sql: "INSERT INTO sync (key, value) VALUES ('synced_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      args: [now()],
    },
  ]);
}

export async function resolvePid(mirror: Store, db: DbName, pid: number): Promise<number> {
  const map = JSON.parse((await getSync(mirror, "pid_map")) ?? "{}") as Record<string, number>;
  const id = map[String(pid)];
  if (id === undefined) {
    throw new CliError(`Provisional id ${db === "security" ? "S" : ""}P${pid} is unknown or not replayed yet.`);
  }
  return id;
}
