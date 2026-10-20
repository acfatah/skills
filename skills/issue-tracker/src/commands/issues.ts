import { UsageError, ValidationError } from "../errors.ts";
import { type DbName, formatId } from "../ids.ts";
import {
  ACCEPTED_STATUSES,
  type Issue,
  type Note,
  type Status,
  TRANSITIONS,
  canMove,
  checkPriority,
  checkResolution,
  checkType,
  splitList,
} from "../model.ts";
import type { SqlValue, Stmt, Store } from "../store/types.ts";

const COLUMNS =
  "id, client_id, title, type, status, priority, milestone, parent, github, resolution, created, updated, closed, body";

type IssueRow = Omit<Issue, "labels">;

async function withLabels(store: Store, rows: IssueRow[]): Promise<Issue[]> {
  if (rows.length === 0) return [];
  const labels = await store.query<{ issue_id: number; label: string }>(
    "SELECT issue_id, label FROM labels ORDER BY label",
  );
  const byIssue = new Map<number, string[]>();
  for (const l of labels) {
    byIssue.set(l.issue_id, [...(byIssue.get(l.issue_id) ?? []), l.label]);
  }
  return rows.map((r) => ({ ...r, labels: byIssue.get(r.id) ?? [] }));
}

export async function findIssue(store: Store, id: number): Promise<Issue | null> {
  const rows = await store.query<IssueRow>(`SELECT ${COLUMNS} FROM issues WHERE id = ?`, [id]);
  const [issue] = await withLabels(store, rows);
  return issue ?? null;
}

export async function loadIssue(store: Store, db: DbName, id: number): Promise<Issue> {
  const issue = await findIssue(store, id);
  if (!issue) throw new ValidationError(`No issue ${formatId(db, id)}.`);
  return issue;
}

async function checkMilestone(store: Store, db: DbName, name: string): Promise<void> {
  if (db === "security") {
    throw new ValidationError("Security issues do not take a milestone.");
  }
  const rows = await store.query("SELECT name FROM milestones WHERE name = ?", [name]);
  if (rows.length === 0) {
    throw new ValidationError(`No milestone "${name}". Add it with: milestone add "${name}"`);
  }
}

function checkTypeFor(db: DbName, type: string): string {
  checkType(type);
  if (db === "security" && type !== "security") {
    throw new ValidationError("Issues in the security database always have type security.");
  }
  if (db === "issues" && type === "security") {
    throw new ValidationError(
      "A security issue lives in its own database. Create it with new --type security, then delete this one.",
    );
  }
  return type;
}

async function checkParent(store: Store, db: DbName, child: number | null, parent: number): Promise<Issue> {
  const p = await loadIssue(store, db, parent);
  // Walk up from the new parent; meeting the child means a cycle.
  let cursor: Issue | null = p;
  while (cursor && child !== null) {
    if (cursor.id === child) {
      throw new ValidationError(`${formatId(db, parent)} cannot be a parent of its own ancestor.`);
    }
    cursor = cursor.parent === null ? null : await findIssue(store, cursor.parent);
  }
  return p;
}

export interface NewIssue {
  title: string;
  type?: string | null;
  priority?: string | null;
  parent?: number | null;
  labels?: string[];
  milestone?: string | null;
  body?: string;
}

export async function createIssue(
  store: Store,
  db: DbName,
  input: NewIssue,
  opts: { clientId: string; date: string },
): Promise<{ id: number; status: Status }> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("A title is required.");
  let type = input.type || (db === "security" ? "security" : null);
  if (type) checkTypeFor(db, type);
  let priority = input.priority || null;
  if (priority) checkPriority(priority);
  let milestone = input.milestone || null;
  let status: Status = "triage";
  if (input.parent) {
    const parent = await checkParent(store, db, null, input.parent);
    // A new child of an accepted parent skips triage and inherits from it.
    if (ACCEPTED_STATUSES.includes(parent.status)) {
      if (!type) {
        throw new ValidationError(
          `${formatId(db, parent.id)} is accepted, so its new child starts open and needs a --type.`,
        );
      }
      status = "open";
      milestone ??= db === "security" ? null : parent.milestone;
      priority ??= parent.priority;
    }
  }
  if (milestone) await checkMilestone(store, db, milestone);

  const stmts: Stmt[] = [
    {
      sql: `INSERT INTO issues (client_id, title, type, status, priority, milestone, parent, created, updated, body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (client_id) DO NOTHING`,
      args: [
        opts.clientId,
        title,
        type,
        status,
        priority,
        milestone,
        input.parent ?? null,
        opts.date,
        opts.date,
        input.body ?? "",
      ],
    },
    ...(input.labels ?? []).map((label) => ({
      sql: "INSERT OR IGNORE INTO labels (issue_id, label) SELECT id, ? FROM issues WHERE client_id = ?",
      args: [label, opts.clientId],
    })),
    { sql: "SELECT id, status FROM issues WHERE client_id = ?", args: [opts.clientId] },
  ];
  const results = await store.batch(stmts);
  const row = results[results.length - 1]![0] as { id: number; status: Status };
  return { id: row.id, status: row.status };
}

export interface ListFilters {
  statuses?: Status[];
  type?: string;
  milestone?: string;
  label?: string;
  parent?: number;
}

export async function listIssues(store: Store, f: ListFilters): Promise<Issue[]> {
  const where: string[] = [];
  const args: SqlValue[] = [];
  if (f.statuses?.length) {
    where.push(`status IN (${f.statuses.map(() => "?").join(",")})`);
    args.push(...f.statuses);
  }
  if (f.type) {
    where.push("type = ?");
    args.push(f.type);
  }
  if (f.milestone) {
    where.push("milestone = ?");
    args.push(f.milestone);
  }
  if (f.parent !== undefined) {
    where.push("parent = ?");
    args.push(f.parent);
  }
  if (f.label) {
    where.push("id IN (SELECT issue_id FROM labels WHERE label = ?)");
    args.push(f.label);
  }
  const sql = `SELECT ${COLUMNS} FROM issues${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
  return withLabels(store, await store.query<IssueRow>(sql, args));
}

export interface IssueDetail {
  issue: Issue;
  notes: Note[];
  children: Pick<Issue, "id" | "title" | "status">[];
}

export async function showIssue(store: Store, db: DbName, id: number): Promise<IssueDetail> {
  const issue = await loadIssue(store, db, id);
  const notes = await store.query<Note>(
    "SELECT id, client_id, issue_id, date, text FROM notes WHERE issue_id = ? ORDER BY id",
    [id],
  );
  const children = await store.query<Pick<Issue, "id" | "title" | "status">>(
    "SELECT id, title, status FROM issues WHERE parent = ? ORDER BY id",
    [id],
  );
  return { issue, notes, children };
}

function noteStmt(issueId: number, date: string, text: string, clientId: string | null = null): Stmt {
  return {
    sql: "INSERT INTO notes (client_id, issue_id, date, text) VALUES (?, ?, ?, ?) ON CONFLICT (client_id) DO NOTHING",
    args: [clientId, issueId, date, text],
  };
}

export const EDITABLE = ["type", "priority", "milestone", "parent", "github", "labels"] as const;

export interface EditChanges {
  title?: string;
  body?: string;
  set: Record<string, string>;
}

export async function editIssue(
  store: Store,
  db: DbName,
  id: number,
  changes: EditChanges,
  date: string,
): Promise<void> {
  const issue = await loadIssue(store, db, id);
  const cols: Record<string, SqlValue> = {};
  const stmts: Stmt[] = [];
  if (changes.title !== undefined) {
    if (!changes.title.trim()) throw new ValidationError("The title cannot be empty.");
    cols.title = changes.title.trim();
  }
  if (changes.body !== undefined) cols.body = changes.body;
  for (const [key, raw] of Object.entries(changes.set)) {
    const value = raw.trim();
    switch (key) {
      case "type":
        if (!value && issue.status !== "triage") {
          throw new ValidationError("type is required outside triage.");
        }
        cols.type = value ? checkTypeFor(db, value) : null;
        break;
      case "priority":
        cols.priority = value ? checkPriority(value) : null;
        break;
      case "milestone":
        if (value) await checkMilestone(store, db, value);
        cols.milestone = value || null;
        break;
      case "parent": {
        if (!value) {
          cols.parent = null;
          break;
        }
        const ref = parseLocalRef(db, value);
        if (ref === id) throw new ValidationError("An issue cannot be its own parent.");
        await checkParent(store, db, id, ref);
        cols.parent = ref;
        break;
      }
      case "github":
        cols.github = value || null;
        break;
      case "labels":
        stmts.push({ sql: "DELETE FROM labels WHERE issue_id = ?", args: [id] });
        for (const label of splitList(value)) {
          stmts.push({ sql: "INSERT INTO labels (issue_id, label) VALUES (?, ?)", args: [id, label] });
        }
        break;
      default:
        throw new UsageError(
          `Cannot --set ${key}. Editable: ${EDITABLE.join(", ")}. Use move, close, or reopen for status.`,
        );
    }
  }
  if (Object.keys(cols).length === 0 && stmts.length === 0) {
    throw new UsageError("Nothing to change. Pass --title, --body-file, or --set key=value.");
  }
  cols.updated = date;
  const keys = Object.keys(cols);
  stmts.unshift({
    sql: `UPDATE issues SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    args: [...keys.map((k) => cols[k]!), id],
  });
  await store.batch(stmts);
}

// A parent given to edit or new must be in the same database.
export function parseLocalRef(db: DbName, text: string): number {
  const m = /^(S)?(P)?0*(\d+)$/i.exec(text.trim());
  if (!m) throw new UsageError(`Not an issue id: ${text}.`);
  if (m[2]) {
    throw new UsageError(`${text} is a provisional id. A parent needs a real id; run flush first.`);
  }
  const refDb: DbName = m[1] ? "security" : "issues";
  if (refDb !== db) {
    throw new ValidationError(
      db === "security"
        ? "A security issue's parent must be another security issue (S…)."
        : "A security issue (S…) cannot be the parent of a regular issue.",
    );
  }
  return Number(m[3]);
}

export async function moveIssue(
  store: Store,
  db: DbName,
  id: number,
  to: Status,
  note: string | undefined,
  date: string,
): Promise<Status> {
  if (to === "closed") throw new UsageError("Use close <id> --resolution … to close an issue.");
  const issue = await loadIssue(store, db, id);
  const label = formatId(db, id);
  if (issue.status === to) throw new ValidationError(`${label} is already ${to}.`);
  if (issue.status === "closed") throw new ValidationError(`${label} is closed. Use reopen.`);
  if (!canMove(issue.status, to)) {
    throw new ValidationError(
      `Cannot move ${label} from ${issue.status} to ${to}. Allowed: ${TRANSITIONS[issue.status].join(", ")}.`,
    );
  }
  if (to !== "triage" && !issue.type) {
    throw new ValidationError(`${label} needs a type before it leaves triage: edit ${label} --set type=…`);
  }
  if (to === "blocked" && !note?.trim()) {
    throw new UsageError("A blocked issue needs --note saying what it waits for.");
  }
  const stmts: Stmt[] = [
    { sql: "UPDATE issues SET status = ?, updated = ? WHERE id = ?", args: [to, date, id] },
  ];
  if (note?.trim()) stmts.push(noteStmt(id, date, note.trim()));
  await store.batch(stmts);
  return issue.status;
}

export interface CloseOptions {
  resolution: string;
  dupOf?: number;
  github?: string;
  note?: string;
  keepChildren?: boolean;
}

export async function closeIssue(
  store: Store,
  db: DbName,
  id: number,
  opts: CloseOptions,
  date: string,
): Promise<void> {
  const resolution = checkResolution(opts.resolution);
  const issue = await loadIssue(store, db, id);
  const label = formatId(db, id);
  if (issue.status === "closed") throw new ValidationError(`${label} is already closed.`);
  if (!canMove(issue.status, "closed")) {
    throw new ValidationError(
      `Cannot close ${label} while it is ${issue.status}. Allowed: ${TRANSITIONS[issue.status].join(", ")}.`,
    );
  }
  const notes: string[] = [];
  if (resolution === "duplicate") {
    if (opts.dupOf === undefined) throw new UsageError("A duplicate needs --dup-of <id>.");
    if (opts.dupOf === id) throw new ValidationError("An issue cannot duplicate itself.");
    await loadIssue(store, db, opts.dupOf);
    notes.push(`Duplicate of ${formatId(db, opts.dupOf)}.`);
  } else if (opts.dupOf !== undefined) {
    throw new UsageError("--dup-of goes with --resolution duplicate.");
  }
  if (resolution === "moved") {
    if (!opts.github) throw new UsageError("Resolution moved needs --github <url>.");
    notes.push(`Moved to ${opts.github}.`);
  }
  if (opts.note?.trim()) notes.push(opts.note.trim());
  const open = await store.query<{ id: number; title: string }>(
    "SELECT id, title FROM issues WHERE parent = ? AND status <> 'closed' ORDER BY id",
    [id],
  );
  if (open.length > 0 && !opts.keepChildren) {
    const list = open.map((c) => `  ${formatId(db, c.id)} ${c.title}`).join("\n");
    throw new ValidationError(
      `${label} has open children:\n${list}\nClose or re-parent them first, or pass --keep-children to leave them open.`,
    );
  }
  await store.batch([
    {
      sql: "UPDATE issues SET status = 'closed', resolution = ?, closed = ?, updated = ?, github = COALESCE(?, github) WHERE id = ?",
      args: [resolution, date, date, opts.github ?? null, id],
    },
    ...notes.map((n) => noteStmt(id, date, n)),
  ]);
}

export async function reopenIssue(
  store: Store,
  db: DbName,
  id: number,
  note: string | undefined,
  date: string,
): Promise<Status> {
  if (!note?.trim()) throw new UsageError("Reopening needs --note saying why.");
  const issue = await loadIssue(store, db, id);
  if (issue.status !== "closed") {
    throw new ValidationError(`${formatId(db, id)} is not closed; it is ${issue.status}.`);
  }
  // An issue closed straight from triage may still have no type.
  const status: Status = issue.type ? "open" : "triage";
  await store.batch([
    {
      sql: "UPDATE issues SET status = ?, resolution = NULL, closed = NULL, updated = ? WHERE id = ?",
      args: [status, date, id],
    },
    noteStmt(id, date, note.trim()),
  ]);
  return status;
}

export async function addNote(
  store: Store,
  db: DbName,
  id: number,
  text: string,
  opts: { clientId: string | null; date: string },
): Promise<void> {
  if (!text.trim()) throw new UsageError("The note is empty.");
  await loadIssue(store, db, id);
  await store.batch([
    noteStmt(id, opts.date, text.trim(), opts.clientId),
    { sql: "UPDATE issues SET updated = ? WHERE id = ?", args: [opts.date, id] },
  ]);
}

export async function deleteIssue(store: Store, db: DbName, id: number): Promise<void> {
  await loadIssue(store, db, id);
  const children = await store.query<{ id: number }>("SELECT id FROM issues WHERE parent = ?", [id]);
  if (children.length > 0) {
    throw new ValidationError(
      `${formatId(db, id)} has children (${children.map((c) => formatId(db, c.id)).join(", ")}). Re-parent or delete them first.`,
    );
  }
  await store.exec("DELETE FROM issues WHERE id = ?", [id]);
}
