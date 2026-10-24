import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { LocationError } from "./errors.ts";

export interface Location {
  // The folder holding issues.sqlite3 and its siblings (D4).
  dir: string;
  // The checkout that owns `dir`, or null when it is outside any repo.
  repoRoot: string | null;
}

export const FILES = {
  issues: "issues.sqlite3",
  security: "issues-security.sqlite3",
  issuesOutbox: "issues.outbox.jsonl",
  securityOutbox: "issues-security.outbox.jsonl",
} as const;

export function git(args: string[], cwd: string): { ok: boolean; out: string } {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim() };
}

function nearestExisting(path: string): string {
  let p = path;
  while (!existsSync(p) && dirname(p) !== p) p = dirname(p);
  return p;
}

// The issues root, ported from v1's SKILL.md: the main checkout in a linked
// worktree, the top folder otherwise. A declared folder (--dir) skips it.
export function resolveLocation(opts: { dir?: string; cwd: string }): Location {
  if (opts.dir) {
    const dir = resolve(opts.cwd, opts.dir);
    const top = git(["rev-parse", "--show-toplevel"], nearestExisting(dir));
    return { dir, repoRoot: top.ok && top.out ? top.out : null };
  }
  const gitDir = git(["rev-parse", "--absolute-git-dir"], opts.cwd);
  if (!gitDir.ok) {
    throw new LocationError("Not inside a git repository. Pass --dir <path>.");
  }
  if (git(["rev-parse", "--is-bare-repository"], opts.cwd).out === "true") {
    throw new LocationError("This is a bare repository with no main checkout. Pass --dir <path>.");
  }
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], opts.cwd);
  let root: string;
  if (resolve(gitDir.out) !== resolve(common.out)) {
    const lines = git(["worktree", "list", "--porcelain"], opts.cwd).out.split("\n");
    if (lines[1] === "bare") {
      throw new LocationError(
        "This worktree belongs to a bare repository with no main checkout. Pass --dir <path>.",
      );
    }
    root = (lines[0] ?? "").replace(/^worktree /, "");
  } else {
    root = git(["rev-parse", "--show-toplevel"], opts.cwd).out;
  }
  return { dir: join(root, ".claude"), repoRoot: root };
}

// Adds `<dir>/issues*` to info/exclude unless the files are already ignored.
// Never touches the tracked .gitignore.
export function ensureIgnored(loc: Location): void {
  if (!loc.repoRoot) return;
  const rel = relative(loc.repoRoot, loc.dir);
  if (rel.startsWith("..") || isAbsolute(rel)) return;
  const prefix = rel ? rel.split(sep).join("/") + "/" : "";
  if (git(["check-ignore", "-q", `${prefix}${FILES.issues}`], loc.repoRoot).ok) return;
  const exclude = resolve(
    loc.repoRoot,
    git(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], loc.repoRoot).out,
  );
  mkdirSync(dirname(exclude), { recursive: true });
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  const lead = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(exclude, `${lead}${prefix}issues*\n`);
}

// Creates the folder and the ignore rule before the first database file.
export function prepareFile(loc: Location, name: string): string {
  const path = join(loc.dir, name);
  if (!existsSync(path)) {
    mkdirSync(loc.dir, { recursive: true });
    ensureIgnored(loc);
  }
  return path;
}
