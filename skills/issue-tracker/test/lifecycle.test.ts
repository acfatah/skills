import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { closeIssue, createIssue, moveIssue, reopenIssue } from "../src/commands/issues.ts";
import type { Status } from "../src/model.ts";
import { migrate } from "../src/schema.ts";
import { LocalStore } from "../src/store/local.ts";
import { gitRepo, run, sh, tempDir } from "./helpers.ts";

// Every (from, to) pair, and whether the lifecycle allows it.
const TABLE: [Status, Status, boolean][] = [];
const ALLOWED: Record<Status, Status[]> = {
  triage: ["open", "closed"],
  open: ["in-progress", "closed"],
  "in-progress": ["blocked", "closed", "open"],
  blocked: ["open", "in-progress"],
  closed: ["open"],
};
const ALL: Status[] = ["triage", "open", "in-progress", "blocked", "closed"];
for (const from of ALL) for (const to of ALL) if (from !== to) TABLE.push([from, to, ALLOWED[from].includes(to)]);

const DATE = "2026-10-20";

// Puts a fresh issue into `status` by direct SQL.
async function issueIn(store: LocalStore, status: Status): Promise<number> {
  const { id } = await createIssue(store, "issues", { title: status, type: "bug" }, { clientId: crypto.randomUUID(), date: DATE });
  const closed = status === "closed";
  await store.exec("UPDATE issues SET status = ?, resolution = ?, closed = ? WHERE id = ?", [
    status,
    closed ? "done" : null,
    closed ? DATE : null,
    id,
  ]);
  return id;
}

async function attempt(store: LocalStore, id: number, to: Status): Promise<void> {
  if (to === "closed") return closeIssue(store, "issues", id, { resolution: "done" }, DATE);
  const [row] = await store.query<{ status: Status }>("SELECT status FROM issues WHERE id = ?", [id]);
  if (row!.status === "closed") {
    if (to !== "open") throw new Error("reopen only goes to open");
    await reopenIssue(store, "issues", id, "why", DATE);
    return;
  }
  await moveIssue(store, "issues", id, to, "note", DATE);
}

describe("lifecycle", async () => {
  const store = new LocalStore(join(tempDir(), "issues.sqlite3"));
  await migrate(store);
  for (const [from, to, allowed] of TABLE) {
    test(`${from} → ${to}: ${allowed ? "allowed" : "refused"}`, async () => {
      const id = await issueIn(store, from);
      if (allowed) {
        await attempt(store, id, to);
        const [row] = await store.query<{ status: string; updated: string }>("SELECT status, updated FROM issues WHERE id = ?", [id]);
        expect(row!.status).toBe(to);
      } else {
        await expect(attempt(store, id, to)).rejects.toThrow();
      }
    });
  }

  test("blocked needs a note", async () => {
    const id = await issueIn(store, "in-progress");
    await expect(moveIssue(store, "issues", id, "blocked", undefined, DATE)).rejects.toThrow(/--note/);
  });

  test("an issue without a type cannot leave triage", async () => {
    const { id } = await createIssue(store, "issues", { title: "untyped" }, { clientId: crypto.randomUUID(), date: DATE });
    await expect(moveIssue(store, "issues", id, "open", undefined, DATE)).rejects.toThrow(/needs a type/);
  });
});

describe("branch links through the bundle", () => {
  const env = { ISSUE_TRACKER_TODAY: DATE };
  function setup() {
    const repo = gitRepo();
    const $ = (...args: string[]) => run(args, repo, { env });
    const ok = (...args: string[]) => {
      const r = $(...args);
      if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.stderr}${r.stdout}`);
      return r;
    };
    const branches = (id: string) => JSON.parse(ok("show", id, "--json").stdout).branches as string[];
    const git = (...args: string[]) => sh(["git", ...args], repo);
    ok("new", "--title", "First", "--type", "bug");
    ok("new", "--title", "Second", "--type", "bug");
    ok("move", "1", "open");
    ok("move", "2", "open");
    return { repo, $, ok, branches, git };
  }

  test("move records the current branch; blocked → in-progress keeps one link", () => {
    const { ok, branches, git } = setup();
    git("checkout", "-q", "-b", "feat/links");
    const r = ok("move", "1", "in-progress");
    expect(r.stdout).toBe("Moved 0001: open → in-progress. Linked to branch feat/links.\n");
    expect(r.stderr).toBe("");
    ok("move", "1", "blocked", "--note", "waits");
    ok("move", "1", "in-progress");
    expect(branches("1")).toEqual(["feat/links"]);
    expect(ok("show", "1").stdout).toContain("branches: feat/links");
    expect(ok("list").stdout).toContain("(branches feat/links)");
  });

  test("--branch overrides, --no-branch skips, both is a usage error", () => {
    const { $, ok, branches, git } = setup();
    git("checkout", "-q", "-b", "feat/links");
    ok("move", "1", "in-progress", "--branch", "other");
    expect(branches("1")).toEqual(["other"]);
    const r = ok("move", "2", "in-progress", "--no-branch");
    expect(r.stderr).toBe("not linked: --no-branch\n");
    expect(branches("2")).toEqual([]);
    expect($("move", "1", "open", "--branch", "x").code).toBe(1);
    ok("move", "1", "open");
    expect($("move", "1", "in-progress", "--branch", "x", "--no-branch").code).toBe(1);
    expect($("move", "1", "in-progress", "--branch=").code).toBe(1);
  });

  test("main and detached HEAD skip with a hint; --branch main is recorded", () => {
    const { ok, branches, git } = setup();
    let r = ok("move", "1", "in-progress");
    expect(r.stderr).toBe("not linked: on main; pass --branch to link\n");
    expect(branches("1")).toEqual([]);
    git("checkout", "-q", "--detach");
    r = ok("move", "2", "in-progress");
    expect(r.stderr).toBe("not linked: detached HEAD; pass --branch to link\n");
    ok("move", "2", "open");
    ok("move", "2", "in-progress", "--branch", "main");
    expect(branches("2")).toEqual(["main"]);
  });

  test("the origin default branch is protected too", () => {
    const { ok, branches, git } = setup();
    git("checkout", "-q", "-b", "dev");
    git("update-ref", "refs/remotes/origin/dev", "HEAD");
    git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/dev");
    expect(ok("move", "1", "in-progress").stderr).toBe("not linked: on dev; pass --branch to link\n");
    expect(branches("1")).toEqual([]);
  });

  test("close keeps links; edit replaces and clears; list --branch filters", () => {
    const { ok, branches, git } = setup();
    git("checkout", "-q", "-b", "feat/a");
    ok("move", "1", "in-progress");
    ok("move", "2", "in-progress");
    ok("edit", "2", "--set", "branches=feat/b, feat/a,feat/b");
    expect(branches("2")).toEqual(["feat/a", "feat/b"]);
    const ids = (...args: string[]) => JSON.parse(ok("list", ...args, "--json").stdout).map((i: { id: string }) => i.id);
    expect(ids("--branch", "feat/a")).toEqual(["0001", "0002"]);
    expect(ids("--branch", "feat/b")).toEqual(["0002"]);
    expect(ids("--branch", "feat/b", "--type", "task")).toEqual([]);
    ok("close", "1", "--resolution", "done");
    expect(branches("1")).toEqual(["feat/a"]);
    expect(ids("--branch", "feat/a")).toEqual(["0002"]);
    expect(ids("--branch", "feat/a", "--status", "all")).toEqual(["0001", "0002"]);
    ok("edit", "2", "--set", "branches=");
    expect(branches("2")).toEqual([]);
  });
});
