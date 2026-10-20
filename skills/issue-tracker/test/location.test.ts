import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LocationError } from "../src/errors.ts";
import { FILES, ensureIgnored, prepareFile, resolveLocation } from "../src/location.ts";
import { gitRepo, sh, tempDir } from "./helpers.ts";

const exclude = (repo: string) => join(repo, ".git", "info", "exclude");

describe("resolveLocation", () => {
  test("normal checkout: the top folder, from a subfolder too", () => {
    const repo = gitRepo();
    mkdirSync(join(repo, "a", "b"), { recursive: true });
    const loc = resolveLocation({ cwd: join(repo, "a", "b") });
    expect(loc).toEqual({ dir: join(repo, ".claude"), repoRoot: repo });
  });

  test("submodule: its own top folder", () => {
    const sub = gitRepo();
    const repo = gitRepo();
    sh(["git", "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "mod"], repo);
    const loc = resolveLocation({ cwd: join(repo, "mod") });
    expect(loc.dir).toBe(join(repo, "mod", ".claude"));
  });

  test("linked worktree: the main checkout", () => {
    const repo = gitRepo();
    const wt = join(tempDir(), "wt");
    sh(["git", "worktree", "add", "-q", "-b", "side", wt], repo);
    const loc = resolveLocation({ cwd: wt });
    expect(loc).toEqual({ dir: join(repo, ".claude"), repoRoot: repo });
  });

  test("bare repository and its worktrees: exit code 3", () => {
    const bare = join(tempDir(), "bare.git");
    sh(["git", "init", "-q", "--bare", bare], tempDir());
    expect(() => resolveLocation({ cwd: bare })).toThrow(LocationError);
    const seed = gitRepo();
    sh(["git", "push", "-q", bare, "main"], seed);
    const wt = join(tempDir(), "wt");
    sh(["git", "worktree", "add", "-q", wt, "main"], bare);
    try {
      resolveLocation({ cwd: wt });
      throw new Error("expected a LocationError");
    } catch (err) {
      expect(err).toBeInstanceOf(LocationError);
      expect((err as LocationError).exitCode).toBe(3);
    }
  });

  test("no git: exit code 3 asking for --dir", () => {
    expect(() => resolveLocation({ cwd: tempDir() })).toThrow(/--dir/);
  });

  test("--dir wins, inside or outside a repo", () => {
    const repo = gitRepo();
    expect(resolveLocation({ cwd: repo, dir: "notes/issues" })).toEqual({
      dir: join(repo, "notes", "issues"),
      repoRoot: repo,
    });
    const plain = tempDir();
    expect(resolveLocation({ cwd: tempDir(), dir: plain })).toEqual({ dir: plain, repoRoot: null });
  });
});

describe("ignore rule", () => {
  test("added once, to info/exclude, never to .gitignore", () => {
    const repo = gitRepo();
    const loc = resolveLocation({ cwd: repo });
    prepareFile(loc, FILES.issues);
    ensureIgnored(loc);
    ensureIgnored(loc);
    const lines = readFileSync(exclude(repo), "utf8").split("\n");
    expect(lines.filter((l) => l === ".claude/issues*")).toHaveLength(1);
    expect(existsSync(join(repo, ".gitignore"))).toBe(false);
    sh(["git", "check-ignore", "-q", ".claude/issues.outbox.jsonl"], repo);
    sh(["git", "check-ignore", "-q", ".claude/issues-security.sqlite3"], repo);
  });

  test("skipped when the files are already ignored", () => {
    const repo = gitRepo();
    Bun.write(join(repo, ".gitignore"), ".claude/\n");
    const before = readFileSync(exclude(repo), "utf8");
    ensureIgnored(resolveLocation({ cwd: repo }));
    expect(readFileSync(exclude(repo), "utf8")).toBe(before);
  });

  test("a linked worktree writes the shared exclude file", () => {
    const repo = gitRepo();
    const wt = join(tempDir(), "wt");
    sh(["git", "worktree", "add", "-q", "-b", "side", wt], repo);
    ensureIgnored(resolveLocation({ cwd: wt }));
    expect(readFileSync(exclude(repo), "utf8")).toContain(".claude/issues*");
  });

  test("a --dir inside the repo gets its own rule; outside, none", () => {
    const repo = gitRepo();
    ensureIgnored(resolveLocation({ cwd: repo, dir: "docs/issues" }));
    expect(readFileSync(exclude(repo), "utf8")).toContain("docs/issues/issues*");
    const outside = tempDir();
    ensureIgnored(resolveLocation({ cwd: repo, dir: outside }));
    expect(readFileSync(exclude(repo), "utf8")).not.toContain(outside);
  });
});
