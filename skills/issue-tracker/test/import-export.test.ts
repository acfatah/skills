import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitBody } from "../src/importer.ts";
import { gitRepo, run, tempDir } from "./helpers.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "v1");
const env = { ISSUE_TRACKER_TODAY: "2026-10-20" };

function setup() {
  const repo = gitRepo();
  cpSync(FIXTURE, join(repo, ".claude", "issues"), { recursive: true });
  const $ = (...args: string[]) => run(args, repo, { env });
  return { repo, $ };
}

function ok(r: ReturnType<typeof run>) {
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.stderr}${r.stdout}`);
  return r;
}

describe("splitBody", () => {
  test("drops the sub-issue mirror and moves clean notes", () => {
    const r = splitBody("## Summary\nx\n\n## Sub-issues\n- [ ] 0002 y\n\n## Notes\n- 2026-01-01: a\n  b\n");
    expect(r.body).toBe("## Summary\nx\n");
    expect(r.notes).toEqual([{ date: "2026-01-01", text: "a\nb" }]);
  });

  test("leaves messy notes in the body", () => {
    const r = splitBody("## Notes\n- 2026-01-01: a\nfree text\n");
    expect(r.body).toBe("## Notes\n- 2026-01-01: a\nfree text\n");
    expect(r.notes).toEqual([]);
  });
});

describe("import --v1", () => {
  test("keeps every id, reports counts, and leaves the folder until asked", () => {
    const { repo, $ } = setup();
    const r = ok($("import", "--v1"));
    expect(r.stdout).toContain("open/: 1 files, 1 rows");
    expect(r.stdout).toContain("security/: 1 files, 1 rows");
    expect(r.stdout).toContain("MILESTONES.md: 2 milestones");
    expect(r.stdout).toContain("import --v1 --delete-old");
    expect(existsSync(join(repo, ".claude", "issues", "open"))).toBe(true);

    const all = JSON.parse(ok($("list", "--status", "all", "--json")).stdout);
    expect(all.map((i: { id: string; status: string }) => `${i.id} ${i.status}`)).toEqual([
      "0001 closed",
      "0002 triage",
      "0003 open",
      "0004 in-progress",
      "0005 blocked",
      "0007 closed",
    ]);
    const parent = JSON.parse(ok($("show", "3", "--json")).stdout);
    expect(parent).toMatchObject({ type: "feature", priority: "high", milestone: "v1.0", labels: ["auth", "ui"] });
    expect(parent.body).toBe("## Summary\nRework the login flow.\n\n## Steps\n- [ ] Sketch the form\n");
    expect(parent.notes).toEqual([
      { date: "2026-10-02", text: "Agreed with the user to split this up\ninto smaller issues." },
      { date: "2026-10-05", text: "Child 0004 started." },
    ]);
    expect(parent.children).toEqual([{ id: "0004", title: "Validate password field", status: "in-progress" }]);
    const blocked = JSON.parse(ok($("show", "5", "--json")).stdout);
    expect(blocked.body).toContain("Some free text the user wrote here.");
    expect(blocked.notes).toEqual([]);
    const untyped = JSON.parse(ok($("show", "2", "--json")).stdout);
    expect(untyped).toMatchObject({ type: null, priority: null, milestone: null, parent: null, labels: [] });
    expect(JSON.parse(ok($("show", "S6", "--json")).stdout)).toMatchObject({ id: "S0006", status: "open", type: "security" });
    expect(ok($("milestone", "list")).stdout).toContain("beta [closed]");
    // New ids continue after the highest imported one.
    expect(ok($("new", "--title", "Next")).stdout).toContain("0008");
    expect(ok($("new", "--title", "Next finding", "--type", "security")).stdout).toContain("S0007");
    expect(ok($("check")).stdout).toBe("No problems found.\n");

    expect($("import", "--v1").code).toBe(1);
    const del = ok($("import", "--v1", "--delete-old"));
    expect(del.stdout).toContain("Deleted the v1 files");
    expect(existsSync(join(repo, ".claude", "issues"))).toBe(false);
    expect(existsSync(join(repo, ".claude", "issues.sqlite3"))).toBe(true);
  });

  test("--delete-old refuses on a count mismatch", () => {
    const { repo, $ } = setup();
    ok($("import", "--v1"));
    writeFileSync(
      join(repo, ".claude", "issues", "open", "0099-added-later.md"),
      "---\nid: 0099\ntitle: Added later\ntype: bug\n---\n",
    );
    const r = $("import", "--v1", "--delete-old");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("open/: 2 files, 1 rows");
    expect(existsSync(join(repo, ".claude", "issues", "open"))).toBe(true);
  });

  test("a broken v1 file stops the import before any write", () => {
    const { repo, $ } = setup();
    writeFileSync(join(repo, ".claude", "issues", "open", "0010-no-type.md"), "---\nid: 0010\ntitle: No type\n---\n");
    const r = $("import", "--v1");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("open/0010-no-type.md: no type while open");
    expect(JSON.parse(ok($("list", "--status", "all", "--json")).stdout)).toEqual([]);
  });

  test("a declared folder: v1 files inside it, v2 files beside them", () => {
    const dir = tempDir();
    cpSync(FIXTURE, dir, { recursive: true });
    const $ = (...args: string[]) => run(["--dir", dir, ...args], tempDir(), { env });
    ok($("import", "--v1"));
    ok($("import", "--v1", "--delete-old"));
    expect(existsSync(join(dir, "open"))).toBe(false);
    expect(existsSync(join(dir, "issues.sqlite3"))).toBe(true);
  });
});

describe("export and import --from", () => {
  test("round trip gives identical records", () => {
    const { repo, $ } = setup();
    ok($("import", "--v1"));
    ok($("delete", "7"));
    const out = join(tempDir(), "backup.jsonl");
    const r = ok($("export", "--out", out));
    expect(r.stderr).toContain("security findings included");
    expect(statSync(out).mode & 0o777).toBe(0o600);

    const other = gitRepo();
    const $2 = (...args: string[]) => run(args, other, { env });
    ok($2("import", "--from", out));
    const again = join(tempDir(), "again.jsonl");
    ok($2("export", "--out", again));
    const strip = (p: string) =>
      readFileSync(p, "utf8")
        .split("\n")
        .filter((l) => l && !l.includes('"record":"meta"'));
    expect(strip(again)).toEqual(strip(out));
    // The deleted id 7 stays retired after the round trip.
    expect(ok($2("new", "--title", "After")).stdout).toContain("0008");
    expect($2("import", "--from", out).code).toBe(1);
    rmSync(repo, { recursive: true, force: true });
  });

  test("export warns inside a repo when not ignored, and needs --out", () => {
    const repo = gitRepo();
    const $ = (...args: string[]) => run(args, repo, { env });
    expect($("export").code).toBe(1);
    const r = ok($("export", "--out", join(repo, "backup.jsonl")));
    expect(r.stderr).toContain("not ignored; do not commit it");
  });
});
