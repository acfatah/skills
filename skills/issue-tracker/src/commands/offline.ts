import type { QueueCtx } from "../backend.ts";
import { ValidationError } from "../errors.ts";
import { type DbName, type IdRef, formatId, formatPid } from "../ids.ts";
import { getSync } from "../mirror.ts";
import { type Issue, type Note, checkPriority, checkType } from "../model.ts";
import type { Entry, Outbox } from "../outbox.ts";
import { type ListFilters, type NewIssue, findIssue } from "./issues.ts";

// Offline on a Turso project, new and note go to the outbox (D7). Checks run
// against the mirror now; the full checks run again at replay.

export async function queueNew(
  q: QueueCtx,
  db: DbName,
  input: NewIssue,
  opts: { clientId: string; date: string },
): Promise<{ id: string; status: string }> {
  if (!input.title.trim()) throw new ValidationError("A title is required.");
  if (input.type) checkType(input.type);
  if (input.priority) checkPriority(input.priority);
  if (input.parent && !(await findIssue(q.mirror, input.parent))) {
    throw new ValidationError(`No issue ${formatId(db, input.parent)} in the local mirror.`);
  }
  if (input.milestone) {
    const rows = await q.mirror.query("SELECT name FROM milestones WHERE name = ?", [input.milestone]);
    if (db === "security" || rows.length === 0) throw new ValidationError(`No milestone "${input.milestone}".`);
  }
  const pid = await q.nextPid();
  q.outbox.append({ kind: "new", client_id: opts.clientId, pid, date: opts.date, issue: input });
  return { id: formatPid(db, pid), status: "queued" };
}

export async function queueNote(
  q: QueueCtx,
  db: DbName,
  ref: IdRef,
  text: string,
  opts: { clientId: string; date: string },
): Promise<string> {
  if (!text.trim()) throw new ValidationError("The note is empty.");
  let target: { id: number } | { pid: number };
  if (ref.pid !== undefined) {
    const map = JSON.parse((await getSync(q.mirror, "pid_map")) ?? "{}") as Record<string, number>;
    const mapped = map[String(ref.pid)];
    const queued = q.outbox.read().some((e) => e.kind === "new" && e.pid === ref.pid);
    if (mapped !== undefined) target = { id: mapped };
    else if (queued) target = { pid: ref.pid };
    else throw new ValidationError(`No queued issue ${formatPid(db, ref.pid)}.`);
  } else {
    if (!(await findIssue(q.mirror, ref.id))) {
      throw new ValidationError(`No issue ${formatId(db, ref.id)} in the local mirror.`);
    }
    target = { id: ref.id };
  }
  q.outbox.append({ kind: "note", client_id: opts.clientId, date: opts.date, target, text: text.trim() });
  return "id" in target ? formatId(db, target.id) : formatPid(db, target.pid);
}

// A queued issue shaped like a stored one, so list and show can print it.
export interface QueuedIssue {
  shownId: string;
  issue: Issue;
  notes: Pick<Note, "date" | "text">[];
}

export function queuedIssues(db: DbName, outbox: Outbox): QueuedIssue[] {
  const entries = outbox.read();
  const notesFor = (pid: number) =>
    entries
      .filter((e): e is Extract<Entry, { kind: "note" }> => e.kind === "note" && "pid" in e.target && e.target.pid === pid)
      .map((e) => ({ date: e.date, text: e.text }));
  return entries
    .filter((e): e is Extract<Entry, { kind: "new" }> => e.kind === "new")
    .map((e) => ({
      shownId: formatPid(db, e.pid),
      notes: notesFor(e.pid),
      issue: {
        id: 0,
        client_id: e.client_id,
        title: e.issue.title.trim(),
        type: (e.issue.type || (db === "security" ? "security" : null)) as Issue["type"],
        status: "queued" as Issue["status"],
        priority: (e.issue.priority || null) as Issue["priority"],
        milestone: e.issue.milestone || null,
        parent: e.issue.parent ?? null,
        github: null,
        resolution: null,
        created: e.date,
        updated: e.date,
        closed: null,
        body: e.issue.body ?? "",
        labels: e.issue.labels ?? [],
      },
    }));
}

export function matches(i: Issue, f: ListFilters): boolean {
  return (
    (!f.type || i.type === f.type) &&
    (!f.milestone || i.milestone === f.milestone) &&
    (!f.label || i.labels.includes(f.label)) &&
    (f.parent === undefined || i.parent === f.parent) &&
    (!f.query || [i.title, i.body].some((t) => t.toLowerCase().includes(f.query!.toLowerCase())))
  );
}

// Notes queued on a real issue, shown under it while offline.
export function queuedNotesOn(outbox: Outbox, id: number): Pick<Note, "date" | "text">[] {
  return outbox
    .read()
    .filter((e): e is Extract<Entry, { kind: "note" }> => e.kind === "note" && "id" in e.target && e.target.id === id)
    .map((e) => ({ date: e.date, text: e.text }));
}
