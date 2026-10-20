import { chmodSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Backend } from "./backend.ts";
import { CliError, ValidationError } from "./errors.ts";
import type { DbName } from "./ids.ts";
import { git } from "./location.ts";
import { type Dump, dump } from "./rows.ts";
import { LATEST_VERSION } from "./schema.ts";
import type { Row } from "./store/types.ts";

const DBS: DbName[] = ["issues", "security"];

// D10: one JSONL file, lossless, that import --from reads back. Records:
// meta, milestone, issue (labels inline), note, sequence, named by
// a `record` field.
export async function exportAll(b: Backend, out: string, warn: (m: string) => void): Promise<Record<string, number>> {
  const lines: unknown[] = [
    { record: "meta", schema: LATEST_VERSION, project: b.key, exported_at: new Date().toISOString() },
  ];
  const counts: Record<string, number> = {};
  for (const db of DBS) {
    const d = await b.run(db, dump);
    const labels = new Map<unknown, string[]>();
    for (const l of d.labels) labels.set(l.issue_id, [...(labels.get(l.issue_id) ?? []), l.label as string]);
    for (const m of d.milestones) lines.push({ record: "milestone", db, ...m });
    for (const i of d.issues) lines.push({ record: "issue", db, ...i, labels: labels.get(i.id) ?? [] });
    for (const { id: _, issue_id, ...n } of d.notes) lines.push({ record: "note", db, issue: issue_id, ...n });
    for (const s of d.seq) lines.push({ record: "sequence", db, ...s });
    counts[db] = d.issues.length;
  }
  const path = resolve(out);
  writeFileSync(path, lines.map((l) => `${JSON.stringify(l)}\n`).join(""), { mode: 0o600 });
  chmodSync(path, 0o600);
  warn(`warning: ${path} holds every issue, security findings included. Keep it private.`);
  const top = git(["rev-parse", "--show-toplevel"], dirname(path));
  if (top.ok && !git(["check-ignore", "-q", path], top.out).ok) {
    warn(`warning: ${path} is inside the git repo ${top.out} and not ignored; do not commit it.`);
  }
  return counts;
}

export function parseExport(text: string): Record<DbName, Dump> {
  const dumps: Record<DbName, Dump> = {
    issues: { milestones: [], issues: [], labels: [], notes: [], seq: [] },
    security: { milestones: [], issues: [], labels: [], notes: [], seq: [] },
  };
  let meta = false;
  text.split("\n").forEach((line, n) => {
    if (!line.trim()) return;
    let rec: Row;
    try {
      rec = JSON.parse(line) as Row;
    } catch {
      throw new ValidationError(`Line ${n + 1} is not JSON.`);
    }
    const { record, db, ...rest } = rec;
    if (record === "meta") {
      meta = true;
      if (Number(rest.schema) > LATEST_VERSION) {
        throw new CliError(`The export has schema version ${rest.schema}; update the issue-tracker skill.`);
      }
      return;
    }
    const d = dumps[db as DbName];
    if (!d) throw new ValidationError(`Line ${n + 1}: unknown db "${db}".`);
    if (record === "milestone") d.milestones.push(rest);
    else if (record === "issue") {
      const { labels, ...row } = rest;
      d.issues.push(row);
      for (const label of (labels as string[]) ?? []) d.labels.push({ issue_id: row.id, label });
    } else if (record === "note") {
      const { issue, ...note } = rest;
      d.notes.push({ id: null, issue_id: issue, ...note });
    } else if (record === "sequence") d.seq.push(rest as Dump["seq"][number]);
    else throw new ValidationError(`Line ${n + 1}: unknown record "${record}".`);
  });
  if (!meta) throw new ValidationError("Not an issue-tracker export: no meta record.");
  return dumps;
}
