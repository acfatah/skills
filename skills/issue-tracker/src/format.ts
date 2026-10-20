import type { IssueDetail } from "./commands/issues.ts";
import type { MilestoneProgress } from "./commands/milestones.ts";
import { type DbName, formatId } from "./ids.ts";
import type { Issue, Note } from "./model.ts";

// What --json prints for an issue: ids formatted as everywhere else.
export function issueJson(db: DbName, issue: Issue, shownId?: string) {
  const { client_id: _, ...rest } = issue;
  return {
    ...rest,
    id: shownId ?? formatId(db, issue.id),
    parent: issue.parent === null ? null : formatId(db, issue.parent),
  };
}

export function issueLine(db: DbName, issue: Issue, shownId?: string): string {
  const extras: string[] = [];
  if (issue.milestone) extras.push(`milestone ${issue.milestone}`);
  if (issue.parent !== null) extras.push(`parent ${formatId(db, issue.parent)}`);
  if (issue.labels.length) extras.push(`labels ${issue.labels.join(",")}`);
  if (issue.resolution) extras.push(`resolution ${issue.resolution}`);
  const head = [
    (shownId ?? formatId(db, issue.id)).padEnd(6),
    issue.status.padEnd(11),
    (issue.type ?? "-").padEnd(8),
    (issue.priority ?? "-").padEnd(6),
    issue.title,
  ].join(" ");
  return extras.length ? `${head}  (${extras.join("; ")})` : head;
}

export function noteLine(n: Pick<Note, "date" | "text">): string {
  return `- ${n.date}: ${n.text}`;
}

export function detailText(db: DbName, d: IssueDetail, shownId?: string): string {
  const i = d.issue;
  const field = (k: string, v: string | null) => (v ? `${k}: ${v}` : null);
  const meta = [
    field("status", i.status),
    field("type", i.type),
    field("priority", i.priority),
    field("milestone", i.milestone),
    field("parent", i.parent === null ? null : formatId(db, i.parent)),
    field("labels", i.labels.join(", ")),
    field("created", i.created),
    field("updated", i.updated),
    field("resolution", i.resolution),
    field("closed", i.closed),
    field("github", i.github),
  ].filter(Boolean);
  const out = [`${shownId ?? formatId(db, i.id)} ${i.title}`, meta.join("  ")];
  if (i.body.trim()) out.push("", i.body.trimEnd());
  if (d.notes.length) out.push("", "Notes:", ...d.notes.map(noteLine));
  if (d.children.length) {
    out.push(
      "",
      "Children:",
      ...d.children.map((c) => `- ${formatId(db, c.id)} [${c.status}] ${c.title}`),
    );
  }
  return out.join("\n");
}

export function milestoneLine(m: MilestoneProgress): string {
  const total = Object.values(m.counts).reduce((a, b) => a + b, 0);
  const closed = m.counts.closed ?? 0;
  const parts = [`${m.name} [${m.state}]`];
  if (m.due) parts.push(`due ${m.due}`);
  parts.push(`${closed}/${total} closed`);
  if (m.goal) parts.push(`goal: ${m.goal}`);
  if (m.github) parts.push(m.github);
  return parts.join("  ");
}
