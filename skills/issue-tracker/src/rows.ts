import type { Row, Stmt, Store } from "./store/types.ts";

// A whole database as rows, for the mirror, remote enable, and export.
export interface Dump {
  milestones: Row[];
  issues: Row[];
  labels: Row[];
  notes: Row[];
  seq: { name: string; seq: number }[];
}

const ISSUE_COLS = [
  "id",
  "client_id",
  "title",
  "type",
  "status",
  "priority",
  "milestone",
  "parent",
  "github",
  "resolution",
  "created",
  "updated",
  "closed",
  "body",
] as const;
const MILESTONE_COLS = ["name", "goal", "due", "state", "github"] as const;
const NOTE_COLS = ["id", "client_id", "issue_id", "date", "text"] as const;

export async function dump(store: Store): Promise<Dump> {
  const [milestones, issues, labels, notes, seq] = await store.batch([
    { sql: `SELECT ${MILESTONE_COLS.join(", ")} FROM milestones ORDER BY name` },
    { sql: `SELECT ${ISSUE_COLS.join(", ")} FROM issues ORDER BY id` },
    { sql: "SELECT issue_id, label FROM labels ORDER BY issue_id, label" },
    { sql: `SELECT ${NOTE_COLS.join(", ")} FROM notes ORDER BY id` },
    { sql: "SELECT name, seq FROM sqlite_sequence WHERE name IN ('issues', 'notes')" },
  ]);
  return {
    milestones: milestones!,
    issues: issues!,
    labels: labels!,
    notes: notes!,
    seq: seq! as Dump["seq"],
  };
}

export function isEmpty(d: Dump): boolean {
  return d.milestones.length + d.issues.length === 0;
}

function insert(table: string, cols: readonly string[], row: Row): Stmt {
  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    args: cols.map((c) => (row[c] ?? null) as never),
  };
}

// Parents before children, so foreign keys hold at every insert.
function parentsFirst(issues: Row[]): Row[] {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const done = new Set<unknown>();
  const out: Row[] = [];
  const visit = (i: Row, depth: number) => {
    if (done.has(i.id) || depth > issues.length) return;
    const parent = i.parent === null ? undefined : byId.get(i.parent);
    if (parent) visit(parent, depth + 1);
    if (!done.has(i.id)) {
      done.add(i.id);
      out.push(i);
    }
  };
  for (const i of issues) visit(i, 0);
  return out;
}

export function clearStmts(): Stmt[] {
  return ["labels", "notes", "issues", "milestones"].map((t) => ({ sql: `DELETE FROM ${t}` }));
}

export function loadStmts(d: Dump): Stmt[] {
  return [
    ...d.milestones.map((m) => insert("milestones", MILESTONE_COLS, m)),
    ...parentsFirst(d.issues).map((i) => insert("issues", ISSUE_COLS, i)),
    ...d.labels.map((l) => insert("labels", ["issue_id", "label"], l)),
    ...d.notes.map((n) => insert("notes", NOTE_COLS, n)),
  ];
}

// Keeps the AUTOINCREMENT counters, so an id deleted on one side is not
// handed out again on the other.
export function seqStmts(d: Dump): Stmt[] {
  return d.seq.flatMap((s) => [
    { sql: "DELETE FROM sqlite_sequence WHERE name = ?", args: [s.name] },
    { sql: "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", args: [s.name, s.seq] },
  ]);
}
