import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { type NewIssue, addNote, createIssue } from "./commands/issues.ts";
import { CliError, Offline } from "./errors.ts";
import { type DbName, formatId, formatPid } from "./ids.ts";
import { getSync, setSync } from "./mirror.ts";
import type { LocalStore } from "./store/local.ts";
import type { Store } from "./store/types.ts";

// Offline, only additions queue (D7): a new issue, or a note on an issue
// that is either real (`id`) or still provisional (`pid`).
export type Entry =
  | { kind: "new"; client_id: string; pid: number; date: string; issue: NewIssue }
  | { kind: "note"; client_id: string; date: string; target: { id: number } | { pid: number }; text: string };

export class Outbox {
  constructor(readonly path: string) {}

  read(): Entry[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as Entry);
  }

  append(entry: Entry): void {
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  }

  // Temp file plus rename, so a crash leaves the old or the new file, never
  // half of one.
  write(entries: Entry[]): void {
    const tmp = `${this.path}.tmp-${process.pid}`;
    writeFileSync(tmp, entries.map((e) => `${JSON.stringify(e)}\n`).join(""), { mode: 0o600 });
    renameSync(tmp, this.path);
  }
}

export interface ReplayHooks {
  // Runs after Turso confirms an entry and before the outbox is rewritten;
  // tests use it to simulate a crash in between.
  afterCommit?: (entry: Entry) => void;
}

// Sends queued entries in order. Each one is removed only after Turso
// confirms it; a resend after a crash is a no-op thanks to client_id.
export async function replay(
  remote: Store,
  db: DbName,
  outbox: Outbox,
  mirror: LocalStore,
  hooks: ReplayHooks = {},
): Promise<string[]> {
  const lines: string[] = [];
  let entries = outbox.read();
  while (entries.length > 0) {
    const entry = entries[0]!;
    const map = JSON.parse((await getSync(mirror, "pid_map")) ?? "{}") as Record<string, number>;
    try {
      if (entry.kind === "new") {
        const { id } = await createIssue(remote, db, entry.issue, { clientId: entry.client_id, date: entry.date });
        hooks.afterCommit?.(entry);
        map[String(entry.pid)] = id;
        await setSync(mirror, "pid_map", JSON.stringify(map));
        lines.push(`${formatPid(db, entry.pid)} → ${formatId(db, id)}`);
      } else {
        const id = "id" in entry.target ? entry.target.id : map[String(entry.target.pid)];
        if (id === undefined) {
          throw new CliError(`it names ${formatPid(db, (entry.target as { pid: number }).pid)}, which was never queued`);
        }
        await addNote(remote, db, id, entry.text, { clientId: entry.client_id, date: entry.date });
        hooks.afterCommit?.(entry);
        lines.push(`Sent a queued note on ${formatId(db, id)}.`);
      }
    } catch (err) {
      if (err instanceof Offline) throw err;
      const what = entry.kind === "new" ? formatPid(db, entry.pid) : "a queued note";
      throw new CliError(
        `Could not replay ${what} from ${outbox.path}: ${(err as Error).message}. It stays queued.`,
      );
    }
    entries = entries.slice(1);
    outbox.write(entries);
  }
  return lines;
}
