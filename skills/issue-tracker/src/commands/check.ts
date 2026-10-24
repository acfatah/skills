import { Offline } from "../errors.ts";
import { type DbName, formatId } from "../ids.ts";
import { DATE_RE } from "../model.ts";
import { PRIORITIES, RESOLUTIONS, STATUSES, TYPES } from "../schema.ts";
import type { Row, Store } from "../store/types.ts";

// Re-checks every rule in code, so a row edited by hand, or written with
// constraints switched off, is still caught.
export async function checkDb(store: Store, db: DbName, milestones: Set<string>): Promise<string[]> {
  const problems: string[] = [];
  // Turso may not run these PRAGMAs; the row checks below still apply.
  try {
    const [integrity] = await store.query<{ integrity_check: string }>("PRAGMA integrity_check");
    if (integrity && integrity.integrity_check !== "ok") {
      problems.push(`${db} database: integrity_check says ${integrity.integrity_check}`);
    }
    for (const fk of await store.query<Row>("PRAGMA foreign_key_check")) {
      problems.push(`${db} database: foreign key broken in ${fk.table} row ${fk.rowid}`);
    }
  } catch (err) {
    if (store.kind === "local" || err instanceof Offline) throw err;
  }
  const rows = await store.query<Row>(
    "SELECT id, title, type, status, priority, milestone, parent, resolution, created, updated, closed FROM issues ORDER BY id",
  );
  const byId = new Map(rows.map((r) => [r.id as number, r]));
  const has = (values: readonly string[], v: unknown) => (values as readonly unknown[]).includes(v);
  for (const r of rows) {
    const id = formatId(db, r.id as number);
    const bad = (msg: string) => problems.push(`${id}: ${msg}`);
    if (!r.title || typeof r.title !== "string" || !r.title.trim()) bad("empty title");
    if (!has(STATUSES, r.status)) bad(`unknown status "${r.status}"`);
    if (r.type !== null && !has(TYPES, r.type)) bad(`unknown type "${r.type}"`);
    if (r.type === null && r.status !== "triage") bad(`no type while ${r.status}`);
    if (db === "security" && r.type !== null && r.type !== "security") bad(`type ${r.type} in the security database`);
    if (db === "issues" && r.type === "security") bad("type security outside the security database");
    if (r.priority !== null && !has(PRIORITIES, r.priority)) bad(`unknown priority "${r.priority}"`);
    if (r.resolution !== null && !has(RESOLUTIONS, r.resolution)) bad(`unknown resolution "${r.resolution}"`);
    if ((r.status === "closed") !== (r.resolution !== null)) bad("closed and resolution disagree");
    if ((r.status === "closed") !== (r.closed !== null)) bad("closed status and closed date disagree");
    for (const field of ["created", "updated", "closed"] as const) {
      if (r[field] !== null && !DATE_RE.test(String(r[field]))) bad(`${field} is not YYYY-MM-DD`);
    }
    if (r.milestone !== null) {
      if (db === "security") bad("security issues do not take a milestone");
      else if (!milestones.has(r.milestone as string)) bad(`unknown milestone "${r.milestone}"`);
    }
    if (r.parent !== null) {
      const seen = new Set<unknown>([r.id]);
      let p = byId.get(r.parent as number);
      if (!p) bad(`parent ${formatId(db, r.parent as number)} does not exist`);
      while (p) {
        if (seen.has(p.id)) {
          bad("parent chain loops");
          break;
        }
        seen.add(p.id);
        p = p.parent === null ? undefined : byId.get(p.parent as number);
      }
    }
  }
  return problems;
}
