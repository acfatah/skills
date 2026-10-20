import { UsageError, ValidationError } from "../errors.ts";
import { formatId } from "../ids.ts";
import { type Milestone, checkDate } from "../model.ts";
import type { SqlValue, Store } from "../store/types.ts";

export interface MilestoneFields {
  goal?: string;
  due?: string;
  github?: string;
}

export interface MilestoneProgress extends Milestone {
  counts: Record<string, number>;
}

async function load(store: Store, name: string): Promise<Milestone> {
  const [row] = await store.query<Milestone>(
    "SELECT name, goal, due, state, github FROM milestones WHERE name = ?",
    [name],
  );
  if (!row) throw new ValidationError(`No milestone "${name}".`);
  return row;
}

export async function addMilestone(store: Store, name: string, f: MilestoneFields): Promise<void> {
  if (!name.trim()) throw new UsageError("A milestone needs a name.");
  if (f.due) checkDate("due", f.due);
  const existing = await store.query("SELECT name FROM milestones WHERE name = ?", [name]);
  if (existing.length > 0) throw new ValidationError(`Milestone "${name}" already exists.`);
  await store.exec("INSERT INTO milestones (name, goal, due, github) VALUES (?, ?, ?, ?)", [
    name,
    f.goal || null,
    f.due || null,
    f.github || null,
  ]);
}

export async function editMilestone(store: Store, name: string, f: MilestoneFields): Promise<void> {
  await load(store, name);
  const cols: Record<string, SqlValue> = {};
  if (f.goal !== undefined) cols.goal = f.goal || null;
  if (f.due !== undefined) cols.due = f.due ? checkDate("due", f.due) : null;
  if (f.github !== undefined) cols.github = f.github || null;
  const keys = Object.keys(cols);
  if (keys.length === 0) throw new UsageError("Nothing to change. Pass --goal, --due, or --github.");
  await store.exec(`UPDATE milestones SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE name = ?`, [
    ...keys.map((k) => cols[k]!),
    name,
  ]);
}

export async function closeMilestone(store: Store, name: string): Promise<void> {
  const m = await load(store, name);
  if (m.state === "closed") throw new ValidationError(`Milestone "${name}" is already closed.`);
  const open = await store.query<{ id: number; title: string }>(
    "SELECT id, title FROM issues WHERE milestone = ? AND status <> 'closed' ORDER BY id",
    [name],
  );
  if (open.length > 0) {
    const list = open.map((i) => `  ${formatId("issues", i.id)} ${i.title}`).join("\n");
    throw new ValidationError(
      `Milestone "${name}" still has open issues:\n${list}\nClose them or move them to another milestone first.`,
    );
  }
  await store.exec("UPDATE milestones SET state = 'closed' WHERE name = ?", [name]);
}

export async function listMilestones(store: Store): Promise<MilestoneProgress[]> {
  const rows = await store.query<Milestone>(
    "SELECT name, goal, due, state, github FROM milestones ORDER BY state DESC, due IS NULL, due, name",
  );
  const counts = await store.query<{ milestone: string; status: string; n: number }>(
    "SELECT milestone, status, COUNT(*) AS n FROM issues WHERE milestone IS NOT NULL GROUP BY milestone, status",
  );
  return rows.map((m) => ({
    ...m,
    counts: Object.fromEntries(counts.filter((c) => c.milestone === m.name).map((c) => [c.status, c.n])),
  }));
}
