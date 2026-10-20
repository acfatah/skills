import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gitRepo, run, tempDir } from "./helpers.ts";

const env = { ISSUE_TRACKER_TODAY: "2026-10-20" };

function cli(repo: string) {
  return (args: string[], opts: { stdin?: string } = {}) => run(args, repo, { ...opts, env });
}

function ok(r: ReturnType<ReturnType<typeof cli>>) {
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.stderr}${r.stdout}`);
  return r.stdout;
}

describe("issue verbs through the bundle", () => {
  test("create, list filters, show with children and notes", () => {
    const repo = gitRepo();
    const $ = cli(repo);
    expect(ok($(["new", "--title", "Login fails on empty password", "--type", "bug", "--label", "auth,ui"]))).toBe(
      "Created 0001 (triage): Login fails on empty password\n",
    );
    ok($(["new", "--title", "Dark mode", "--type", "idea", "--priority", "low"]));
    ok($(["milestone", "add", "v1.0", "--due", "2026-12-01", "--goal", "First release"]));
    ok($(["edit", "1", "--set", "milestone=v1.0", "--set", "priority=high"]));
    ok($(["move", "0001", "open"]));
    // A child of an accepted parent starts open with its milestone and priority.
    expect(ok($(["new", "--title", "Validate field", "--parent", "1", "--type", "task"]))).toContain("0003 (open)");
    expect($(["new", "--title", "No type", "--parent", "1"]).code).toBe(1);
    ok($(["note", "1", "Seen", "on", "staging"]));

    const all = JSON.parse(ok($(["list", "--json"])));
    expect(all.map((i: { id: string }) => i.id)).toEqual(["0001", "0002", "0003"]);
    const child = all[2];
    expect(child).toMatchObject({ status: "open", milestone: "v1.0", priority: "high", parent: "0001" });
    expect(JSON.parse(ok($(["list", "--label", "auth", "--json"]))).map((i: { id: string }) => i.id)).toEqual(["0001"]);
    expect(JSON.parse(ok($(["list", "--status", "triage", "--json"]))).map((i: { id: string }) => i.id)).toEqual(["0002"]);
    expect(JSON.parse(ok($(["list", "--parent", "1", "--json"]))).map((i: { id: string }) => i.id)).toEqual(["0003"]);
    expect(JSON.parse(ok($(["list", "--milestone", "v1.0", "--type", "task", "--json"])))).toHaveLength(1);

    const shown = ok($(["show", "1"]));
    expect(shown).toContain("0001 Login fails on empty password");
    expect(shown).toContain("labels: auth, ui");
    expect(shown).toContain("- 2026-10-20: Seen on staging");
    expect(shown).toContain("- 0003 [open] Validate field");
    const detail = JSON.parse(ok($(["show", "0001", "--json"])));
    expect(detail.children).toEqual([{ id: "0003", title: "Validate field", status: "open" }]);
  });

  test("body from stdin, edit title and labels", () => {
    const $ = cli(gitRepo());
    ok($(["new", "--title", "With body", "--body-file", "-"], { stdin: "## Summary\nHello\n" }));
    ok($(["edit", "1", "--title", "Renamed", "--set", "labels=a,b"]));
    const d = JSON.parse(ok($(["show", "1", "--json"])));
    expect(d).toMatchObject({ title: "Renamed", body: "## Summary\nHello\n", labels: ["a", "b"] });
    expect($(["edit", "1", "--set", "status=closed"]).code).toBe(1);
    expect($(["edit", "1", "--set", "milestone=nope"]).code).toBe(1);
  });

  test("close as duplicate, then reopen", () => {
    const $ = cli(gitRepo());
    ok($(["new", "--title", "Original", "--type", "bug"]));
    ok($(["new", "--title", "Copy", "--type", "bug"]));
    expect($(["close", "2", "--resolution", "duplicate"]).code).toBe(1);
    ok($(["close", "2", "--resolution", "duplicate", "--dup-of", "1"]));
    let d = JSON.parse(ok($(["show", "2", "--json"])));
    expect(d).toMatchObject({ status: "closed", resolution: "duplicate", closed: "2026-10-20" });
    expect(d.notes).toEqual([{ date: "2026-10-20", text: "Duplicate of 0001." }]);
    expect($(["reopen", "2"]).code).toBe(1);
    ok($(["reopen", "2", "--note", "Not the same bug"]));
    d = JSON.parse(ok($(["show", "2", "--json"])));
    expect(d).toMatchObject({ status: "open", resolution: null, closed: null });
    expect(d.notes[1].text).toBe("Not the same bug");
  });

  test("closing a parent with open children asks first", () => {
    const $ = cli(gitRepo());
    ok($(["new", "--title", "Parent", "--type", "feature"]));
    ok($(["new", "--title", "Child", "--type", "task", "--parent", "1"]));
    const r = $(["close", "1", "--resolution", "done"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("0002 Child");
    ok($(["close", "1", "--resolution", "done", "--keep-children"]));
    expect($(["delete", "1"]).code).toBe(1);
    ok($(["delete", "2"]));
    ok($(["delete", "1"]));
    expect(ok($(["new", "--title", "Next", "--type", "bug"]))).toContain("0003");
  });

  test("milestone close refuses while open issues name it", () => {
    const $ = cli(gitRepo());
    ok($(["milestone", "add", "beta"]));
    ok($(["new", "--title", "Work", "--type", "task", "--milestone", "beta"]));
    const r = $(["milestone", "close", "beta"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("0001 Work");
    ok($(["close", "1", "--resolution", "done"]));
    ok($(["milestone", "close", "beta"]));
    expect(ok($(["milestone", "list"]))).toContain("beta [closed]  1/1 closed");
  });

  test("security issues route to their own database with S ids", () => {
    const repo = gitRepo();
    const $ = cli(repo);
    ok($(["new", "--title", "Regular", "--type", "bug"]));
    expect(ok($(["new", "--title", "Token in logs", "--type", "security"]))).toContain("Created S0001");
    expect(ok($(["new", "--title", "Sub finding", "--parent", "S1", "--type", "security"]))).toContain("S0002");
    expect(ok($(["list"]))).not.toContain("Token");
    expect(ok($(["list", "--security"]))).toContain("S0001");
    expect(JSON.parse(ok($(["show", "S0001", "--json"]))).children[0].id).toBe("S0002");
    expect($(["new", "--title", "x", "--type", "security", "--milestone", "v1"]).code).toBe(1);
    expect($(["edit", "1", "--set", "parent=S1"]).code).toBe(1);
    const sec = new Database(join(repo, ".claude", "issues-security.sqlite3"), { readonly: true });
    expect(sec.query("SELECT COUNT(*) AS n FROM issues").get()).toEqual({ n: 2 });
    sec.close();
  });

  test("check catches a hand-broken row", () => {
    const repo = gitRepo();
    const $ = cli(repo);
    ok($(["new", "--title", "Fine", "--type", "bug"]));
    expect(ok($(["check"]))).toBe("No problems found.\n");
    const db = new Database(join(repo, ".claude", "issues.sqlite3"));
    db.run("PRAGMA ignore_check_constraints = ON");
    db.run("UPDATE issues SET status = 'closed', updated = 'yesterday' WHERE id = 1");
    db.close();
    const r = $(["check"]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("0001: closed and resolution disagree");
    expect(r.stdout).toContain("0001: updated is not YYYY-MM-DD");
  });

  test("ids, usage errors, exit codes", () => {
    const repo = gitRepo();
    const $ = cli(repo);
    expect($(["show", "1"]).code).toBe(1);
    expect($(["frobnicate"]).code).toBe(1);
    expect($(["new"]).code).toBe(1);
    expect($(["show", "P1"]).stderr).toContain("provisional");
    expect(run(["list"], tempDir(), { env }).code).toBe(3);
    const dir = tempDir();
    expect(run(["--dir", dir, "list"], tempDir(), { env }).code).toBe(0);
    ok($(["new", "--title", "x"]));
    const rules = readFileSync(join(repo, ".git", "info", "exclude"), "utf8").split("\n");
    expect(rules.filter((l) => l === ".claude/issues*")).toHaveLength(1);
  });

  test("20 parallel new processes get 20 distinct ids", async () => {
    const repo = gitRepo();
    ok(cli(repo)(["list"]));
    const procs = Array.from({ length: 20 }, (_, i) =>
      Bun.spawn(["bun", join(import.meta.dir, "..", "scripts", "issues.js"), "new", "--title", `t${i}`, "--json"], {
        cwd: repo,
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
    const outs = await Promise.all(
      procs.map(async (p) => {
        const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
        if (code !== 0) throw new Error(err);
        return JSON.parse(out).id as string;
      }),
    );
    expect(new Set(outs).size).toBe(20);
  });
});
