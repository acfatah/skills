import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LABELS } from "../src/promote.ts";
import { ROOT, gitRepo, run } from "./helpers.ts";

const env = { ISSUE_TRACKER_TODAY: "2026-10-20" };

function setup() {
  const repo = gitRepo();
  return (...args: string[]) => {
    const r = run(args, repo, { env });
    return r;
  };
}

function ok(r: ReturnType<typeof run>) {
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.stderr}${r.stdout}`);
  return r.stdout;
}

describe("promote --dry-run", () => {
  test("a bug: labels, body with notes, project status", () => {
    const $ = setup();
    ok($("new", "--title", "Login fails on empty password", "--type", "bug", "--priority", "medium", "--label", "auth", "--body", "## Summary\nIt fails.\n"));
    ok($("move", "1", "open"));
    ok($("note", "1", "Seen on staging"));
    expect(ok($("promote", "1", "--dry-run"))).toBe(`Promote 0001 to GitHub (dry run; nothing was created).
Title: Login fails on empty password
Labels: bug, priority:medium, auth
Milestone: none
Project Status: Open
Labels that may need creating:
  gh label create priority:medium --color D93F0B --force
  gh label create auth --force
Body:
-----
## Summary
It fails.

## Notes
- 2026-10-20: Seen on staging
-----
Then record the link: close 0001 --resolution moved --github <issue-url>
`);
  });

  test("a feature whose parent and child are already on GitHub", () => {
    const $ = setup();
    ok($("new", "--title", "Accounts", "--type", "feature"));
    ok($("move", "1", "open"));
    ok($("new", "--title", "Login", "--type", "feature", "--parent", "1"));
    ok($("new", "--title", "Form", "--type", "task", "--parent", "2"));
    ok($("close", "1", "--resolution", "moved", "--github", "https://github.com/a/b/issues/10", "--keep-children"));
    ok($("close", "3", "--resolution", "moved", "--github", "https://github.com/a/b/issues/12"));
    expect(JSON.parse(ok($("promote", "2", "--dry-run", "--json")))).toEqual({
      id: "0002",
      title: "Login",
      body: "",
      labels: ["enhancement"],
      milestone: null,
      milestone_github: null,
      project_status: "Open",
      create_labels: [],
      parent_github: "https://github.com/a/b/issues/10",
      children_github: ["https://github.com/a/b/issues/12"],
      then: "close 0002 --resolution moved --github <issue-url>",
    });
  });

  test("a milestone, with and without its GitHub link", () => {
    const $ = setup();
    ok($("milestone", "add", "v1.0", "--due", "2026-12-01"));
    ok($("new", "--title", "Ship it", "--type", "chore", "--priority", "low", "--milestone", "v1.0"));
    expect(ok($("promote", "1", "--dry-run"))).toContain("Milestone: v1.0 (not on GitHub yet; create it first)");
    ok($("milestone", "edit", "v1.0", "--github", "https://github.com/a/b/milestone/1"));
    const p = JSON.parse(ok($("promote", "1", "--dry-run", "--json")));
    expect(p).toMatchObject({
      labels: ["chore", "priority:low"],
      milestone: "v1.0",
      milestone_github: "https://github.com/a/b/milestone/1",
      project_status: "Triage",
      create_labels: [
        { name: "chore", color: "EDEDED" },
        { name: "priority:low", color: "FBCA04" },
      ],
    });
  });

  test("refuses without --dry-run, for security issues, and for closed issues", () => {
    const $ = setup();
    ok($("new", "--title", "x", "--type", "bug"));
    ok($("new", "--title", "s", "--type", "security"));
    expect($("promote", "1").stderr).toContain("never runs gh");
    expect($("promote", "S1", "--dry-run").stderr).toContain("private security advisory");
    ok($("close", "1", "--resolution", "done"));
    expect($("promote", "1", "--dry-run").stderr).toContain("is closed");
  });
});

test("the label table in references/github.md matches promote.ts", () => {
  const md = readFileSync(join(ROOT, "references", "github.md"), "utf8");
  const start = md.indexOf("\n## Labels\n");
  const end = md.indexOf("\n## ", start + 1);
  const section = md.slice(start, end < 0 ? undefined : end);
  const rows = section
    .split("\n")
    .filter((l) => /^\| `[^`]+`/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .map((c) => ({
      label: c[1]!.replace(/`/g, ""),
      for: c[2]!.replace(/`/g, ""),
      color: c[3] === "default" ? null : c[3]!.replace(/`/g, ""),
    }));
  expect(rows).toEqual(LABELS);
  // The gh label create block lists exactly the new labels, with their colors.
  const creates = [...section.matchAll(/^gh label create (\S+)\s+--color (\w+) --force$/gm)].map((m) => ({ label: m[1], color: m[2] as string | null }));
  expect(creates).toEqual(LABELS.filter((l) => l.color).map(({ label, color }) => ({ label, color })));
});
