import { ValidationError } from "./errors.ts";
import { formatId } from "./ids.ts";
import type { Issue, Note, Status } from "./model.ts";
import type { Store } from "./store/types.ts";
import { findIssue, loadIssue } from "./commands/issues.ts";

// The mapping in references/github.md, as code. A test keeps the two in
// step: change both together.
export interface LabelSpec {
  label: string;
  for: string;
  color: string | null; // null: a GitHub default label
}

export const LABELS: LabelSpec[] = [
  { label: "bug", for: "type bug", color: null },
  { label: "enhancement", for: "type feature", color: null },
  { label: "documentation", for: "type docs", color: null },
  { label: "question", for: "type question", color: null },
  { label: "idea", for: "type idea", color: "C5DEF5" },
  { label: "feedback", for: "type feedback", color: "BFDADC" },
  { label: "task", for: "type task", color: "1D76DB" },
  { label: "chore", for: "type chore", color: "EDEDED" },
  { label: "refactor", for: "type refactor", color: "5319E7" },
  { label: "priority:high", for: "priority high", color: "B60205" },
  { label: "priority:medium", for: "priority medium", color: "D93F0B" },
  { label: "priority:low", for: "priority low", color: "FBCA04" },
  { label: "duplicate", for: "resolution duplicate", color: null },
  { label: "wontfix", for: "resolution wont-fix", color: null },
  { label: "invalid", for: "resolution invalid", color: null },
];

export const PROJECT_STATUS: Record<Status, string> = {
  triage: "Triage",
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  closed: "Done",
};

const labelFor = (what: string) => LABELS.find((l) => l.for === what);

export interface Promotion {
  id: string;
  title: string;
  body: string;
  labels: string[];
  milestone: string | null;
  milestone_github: string | null;
  project_status: string;
  create_labels: { name: string; color: string | null }[];
  parent_github: string | null;
  children_github: string[];
  then: string;
}

export const ADVISORY =
  "Security issues never become GitHub issues. Use a private security advisory: " +
  "repo Security tab → Advisories → New draft security advisory.";

export async function promote(store: Store, id: number): Promise<Promotion> {
  const issue: Issue = await loadIssue(store, "issues", id);
  const shown = formatId("issues", id);
  if (issue.status === "closed") {
    throw new ValidationError(
      `${shown} is closed (${issue.resolution}${issue.github ? `, ${issue.github}` : ""}); there is nothing to promote.`,
    );
  }
  const notes = await store.query<Note>("SELECT date, text FROM notes WHERE issue_id = ? ORDER BY id", [id]);
  let body = issue.body.trimEnd();
  if (notes.length) {
    const lines = notes.map((n) => `- ${n.date}: ${n.text.replace(/\n/g, "\n  ")}`);
    body = `${body ? `${body}\n\n` : ""}## Notes\n${lines.join("\n")}`;
  }
  const specs = [
    issue.type ? labelFor(`type ${issue.type}`) : undefined,
    issue.priority ? labelFor(`priority ${issue.priority}`) : undefined,
  ].filter((s): s is LabelSpec => Boolean(s));
  const labels = [...new Set([...specs.map((s) => s.label), ...issue.labels])];
  // New table labels have a fixed color; the issue's own labels may not
  // exist in the repo yet either.
  const create = [
    ...specs.filter((s) => s.color).map((s) => ({ name: s.label, color: s.color })),
    ...issue.labels.filter((l) => !LABELS.some((s) => s.label === l)).map((name) => ({ name, color: null })),
  ];
  let milestoneGithub: string | null = null;
  if (issue.milestone) {
    const [m] = await store.query<{ github: string | null }>("SELECT github FROM milestones WHERE name = ?", [
      issue.milestone,
    ]);
    milestoneGithub = m?.github ?? null;
  }
  const parent = issue.parent === null ? null : await findIssue(store, issue.parent);
  const children = await store.query<{ github: string }>(
    "SELECT github FROM issues WHERE parent = ? AND github IS NOT NULL ORDER BY id",
    [id],
  );
  return {
    id: shown,
    title: issue.title,
    body: body ? `${body}\n` : "",
    labels,
    milestone: issue.milestone,
    milestone_github: milestoneGithub,
    project_status: PROJECT_STATUS[issue.status],
    create_labels: create,
    parent_github: parent?.github ?? null,
    children_github: children.map((c) => c.github),
    then: `close ${shown} --resolution moved --github <issue-url>`,
  };
}

export function promotionText(p: Promotion): string {
  const out = [
    `Promote ${p.id} to GitHub (dry run; nothing was created).`,
    `Title: ${p.title}`,
    `Labels: ${p.labels.join(", ") || "none"}`,
    `Milestone: ${p.milestone ? `${p.milestone} (${p.milestone_github ?? "not on GitHub yet; create it first"})` : "none"}`,
    `Project Status: ${p.project_status}`,
  ];
  if (p.create_labels.length) {
    out.push("Labels that may need creating:");
    for (const l of p.create_labels) {
      out.push(`  gh label create ${l.name}${l.color ? ` --color ${l.color}` : ""} --force`);
    }
  }
  if (p.parent_github) out.push(`Parent on GitHub: ${p.parent_github}`);
  if (p.children_github.length) out.push(`Children on GitHub: ${p.children_github.join(", ")}`);
  out.push("Body:", "-----", p.body.trimEnd(), "-----", `Then record the link: ${p.then}`);
  return out.join("\n");
}
