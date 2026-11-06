#!/usr/bin/env bun
// release: plan a project's next version for the release skill, as JSON.
// Read-only except `write`, which sets a VERSION file. It never commits,
// tags or pushes; the skill's confirm is the only path to those.
// Run with Bun directly; no build step and no dependencies.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type Scheme = "semver" | "calver";
export type Level = "major" | "minor" | "patch" | "none";
export type State = "no-version" | "untagged" | "fresh" | "half-done" | "behind";

export interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: string | null; // e.g. "rc.1"
}

export interface Commit {
  sha: string;
  type: string | null; // null when the subject is not a Conventional Commit
  breaking: boolean;
  subject: string;
}

export interface Issue {
  code: string;
  message: string;
}

// ---------------------------------------------------------------- versions

const VERSION_RE =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Parse `1.2.3`, `v1.2.3` or `1.2.3-rc.1`; null when it is not SemVer. */
export function parseVersion(text: string): Version | null {
  const m = VERSION_RE.exec(text.trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? null };
}

export function formatVersion(v: Version): string {
  const core = `${v.major}.${v.minor}.${v.patch}`;
  return v.pre ? `${core}-${v.pre}` : core;
}

function comparePre(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1; // a release ranks above its pre-releases
  if (b === null) return -1;
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const na = /^\d+$/.test(pa[i]);
    const nb = /^\d+$/.test(pb[i]);
    if (na && nb) {
      const d = +pa[i] - +pb[i];
      if (d !== 0) return Math.sign(d);
    } else if (na !== nb) {
      return na ? -1 : 1; // numeric ids rank below alphanumeric ones
    } else if (pa[i] !== pb[i]) {
      return pa[i] < pb[i] ? -1 : 1;
    }
  }
  return 0;
}

/** SemVer precedence: negative, zero or positive, like a sort comparator. */
export function compareVersions(a: Version, b: Version): number {
  return (
    Math.sign(a.major - b.major) ||
    Math.sign(a.minor - b.minor) ||
    Math.sign(a.patch - b.patch) ||
    comparePre(a.pre, b.pre)
  );
}

/**
 * A year-like major (2000-2999) with a month-like minor (1-12) is CalVer;
 * anything else is SemVer. `0.0.0` and no version have no scheme yet.
 */
export function inferScheme(v: Version | null): Scheme | null {
  if (!v) return null;
  if (v.major === 0 && v.minor === 0 && v.patch === 0 && !v.pre) return null;
  if (v.major >= 2000 && v.major <= 2999 && v.minor >= 1 && v.minor <= 12) {
    return "calver";
  }
  return "semver";
}

// ---------------------------------------------------------------- commits

const SUBJECT_RE = /^(\w+)(?:\([^)]*\))?(!)?:\s*\S/;

export function parseCommit(sha: string, subject: string, body: string): Commit {
  const m = SUBJECT_RE.exec(subject);
  const breakingBody = /^BREAKING[ -]CHANGE:/m.test(body);
  return {
    sha,
    type: m ? m[1].toLowerCase() : null,
    breaking: Boolean(m && (m[2] || breakingBody)),
    subject,
  };
}

const PATCH_TYPES = new Set(["fix", "perf"]);
const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 };

function commitLevel(c: Commit): Level {
  if (c.breaking) return "major";
  if (c.type === "feat") return "minor";
  if (c.type && PATCH_TYPES.has(c.type)) return "patch";
  return "none";
}

/** The SemVer level the commits call for, with one reason per releasable commit. */
export function levelFromCommits(commits: Commit[]): { level: Level; reasons: string[] } {
  let level: Level = "none";
  const reasons: string[] = [];
  for (const c of commits) {
    const l = commitLevel(c);
    if (l === "none") continue;
    if (RANK[l] > RANK[level]) level = l;
    const why = c.breaking ? "breaking change" : c.type;
    reasons.push(`${l}: ${c.sha.slice(0, 7)} ${c.subject} (${why})`);
  }
  return { level, reasons };
}

// ---------------------------------------------------------------- next version

/**
 * Put a pre-release id on a target core version. Continuing the same id on
 * the same core counts up (`rc.0` to `rc.1`); anything else starts at `.0`.
 */
function withPre(current: Version | null, core: Version, pre: string | undefined): Version {
  if (!pre) return { ...core, pre: null };
  if (current?.pre && sameCore(current, core)) {
    const parts = current.pre.split(".");
    const n = parts.length === 2 && parts[0] === pre ? Number(parts[1]) : NaN;
    if (Number.isInteger(n)) return { ...core, pre: `${pre}.${n + 1}` };
  }
  return { ...core, pre: `${pre}.0` };
}

function sameCore(a: Version, b: Version): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

/**
 * Next SemVer version. No version (or `0.0.0`) gives `0.1.0`. Below 1.0.0 a
 * breaking change bumps minor. A current pre-release releases its own core
 * version instead of bumping again. Level `none` gives a patch bump; the
 * caller warns that nothing is releasable.
 */
export function nextSemver(current: Version | null, level: Level, pre?: string): Version {
  if (!current || inferScheme(current) === null) {
    return withPre(current, { major: 0, minor: 1, patch: 0, pre: null }, pre);
  }
  if (current.pre) return withPre(current, { ...current, pre: null }, pre);
  const { major, minor, patch } = current;
  const effective: Level = major === 0 && level === "major" ? "minor" : level;
  let core: Version;
  if (effective === "major") core = { major: major + 1, minor: 0, patch: 0, pre: null };
  else if (effective === "minor") core = { major, minor: minor + 1, patch: 0, pre: null };
  else core = { major, minor, patch: patch + 1, pre: null };
  return withPre(current, core, pre);
}

/**
 * Next CalVer version, `YYYY.M.MICRO` with no padding. Same month: MICRO + 1
 * (or the current pre-release's own core). New month: MICRO 0.
 */
export function nextCalver(current: Version | null, today: Date, pre?: string): Version {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const sameMonth = current && current.major === year && current.minor === month;
  let core: Version;
  if (sameMonth && current.pre) core = { ...current, pre: null };
  else if (sameMonth) core = { major: year, minor: month, patch: current.patch + 1, pre: null };
  else core = { major: year, minor: month, patch: 0, pre: null };
  return withPre(current, core, pre);
}

// ---------------------------------------------------------------- state

/** The highest `v*` tag that parses as a version, sorted by precedence. */
export function lastTagOf(tags: string[]): string | null {
  let best: { tag: string; v: Version } | null = null;
  for (const tag of tags) {
    if (!tag.startsWith("v")) continue;
    const v = parseVersion(tag);
    if (v && (!best || compareVersions(v, best.v) > 0)) best = { tag, v };
  }
  return best?.tag ?? null;
}

/**
 * - `no-version`: no version file holds a version.
 * - `untagged`: a version, but no `v*` tags.
 * - `fresh`: the version equals the last tag.
 * - `half-done`: the version is above the last tag and has no tag of its own.
 * - `behind`: anything else, such as a version below the last tag.
 */
export function detectState(current: Version | null, tags: string[]): State {
  if (!current) return "no-version";
  const last = lastTagOf(tags);
  if (!last) return "untagged";
  const lastV = parseVersion(last)!;
  const cmp = compareVersions(current, lastV);
  if (cmp === 0) return "fresh";
  if (cmp > 0 && !tags.includes(`v${formatVersion(current)}`)) return "half-done";
  return "behind";
}

// ---------------------------------------------------------------- git and files

export type Git = (args: string[]) => { ok: boolean; out: string };

export function realGit(root: string): Git {
  return (args) => {
    const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    return { ok: r.exitCode === 0, out: r.stdout.toString() };
  };
}

function listTags(git: Git): string[] {
  const r = git(["tag", "--list", "v*"]);
  return r.ok ? r.out.split("\n").filter(Boolean) : [];
}

function listCommits(git: Git, range: string): Commit[] {
  const r = git(["log", "--no-merges", "--format=%H%x1f%s%x1f%b%x1e", range]);
  if (!r.ok) return [];
  return r.out
    .split("\x1e")
    .map((rec) => rec.replace(/^\n/, ""))
    .filter(Boolean)
    .map((rec) => {
      const [sha, subject, body = ""] = rec.split("\x1f");
      return parseCommit(sha, subject, body);
    });
}

const VERSION_FILES = ["VERSION", "package.json"] as const;
type VersionFile = (typeof VERSION_FILES)[number];

function readVersions(root: string): Partial<Record<VersionFile, string>> {
  const out: Partial<Record<VersionFile, string>> = {};
  const vf = join(root, "VERSION");
  if (existsSync(vf)) out.VERSION = readFileSync(vf, "utf8").trim();
  const pj = join(root, "package.json");
  if (existsSync(pj)) {
    try {
      const v = (JSON.parse(readFileSync(pj, "utf8")) as { version?: unknown }).version;
      if (typeof v === "string") out["package.json"] = v;
    } catch {
      // an unreadable package.json carries no version
    }
  }
  return out;
}

function detectBumpp(root: string): string | null {
  const cfg = readdirSync(root).find((f) => /^bump\.config\.[cm]?[jt]s$|^bump\.config\.json$/.test(f));
  if (cfg) return cfg;
  const pj = join(root, "package.json");
  if (!existsSync(pj)) return null;
  try {
    const dev = (JSON.parse(readFileSync(pj, "utf8")) as { devDependencies?: Record<string, string> })
      .devDependencies;
    if (dev?.bumpp) return "package.json devDependencies.bumpp";
  } catch {
    // ignore
  }
  return null;
}

function detectChangelogithub(root: string): string | null {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    if (readFileSync(join(dir, f), "utf8").includes("changelogithub")) {
      return `.github/workflows/${f}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------- plan

export interface PlanOptions {
  root: string;
  version?: string;
  pre?: string;
  at?: string;
  today?: string;
  scheme?: Scheme;
  file?: VersionFile;
}

export interface Plan {
  root: string;
  versionFile: VersionFile | null;
  versions: Partial<Record<VersionFile, string>>;
  current: string | null;
  scheme: Scheme | null;
  bumpp: string | null;
  changelogithub: string | null;
  lastTag: string | null;
  state: State;
  range: string;
  commits: Commit[];
  level: Level;
  proposed: string | null;
  reasons: string[];
  warnings: Issue[];
  errors: Issue[];
}

function parseToday(text: string | undefined): Date {
  if (!text) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) throw new UsageError(`--today wants YYYY-MM-DD, got "${text}"`);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function plan(opts: PlanOptions, git: Git = realGit(opts.root)): Plan {
  const root = opts.root;
  const warnings: Issue[] = [];
  const errors: Issue[] = [];
  const reasons: string[] = [];

  // Version file.
  const all = readVersions(root);
  const versions = opts.file ? { [opts.file]: all[opts.file] } : all;
  const present = VERSION_FILES.filter((f) => versions[f] !== undefined);
  let versionFile: VersionFile | null = present.length === 1 ? present[0] : null;
  if (present.length === 2) {
    if (versions.VERSION === versions["package.json"]) {
      warnings.push({ code: "both-files", message: "VERSION and package.json both hold the version; ask which one to use, then pass --file" });
    } else {
      errors.push({ code: "versions-differ", message: `VERSION says ${versions.VERSION}, package.json says ${versions["package.json"]}` });
    }
  }
  const currentText = versionFile ? versions[versionFile]! : present.length === 2 ? versions.VERSION! : null;
  const current = currentText === null ? null : parseVersion(currentText);
  if (currentText !== null && !current) {
    errors.push({ code: "invalid-version", message: `"${currentText}" is not a SemVer version` });
  }

  // Scheme: from the version, else from --scheme, never switched.
  const inferred = inferScheme(current);
  let scheme: Scheme | null = inferred ?? opts.scheme ?? null;
  if (inferred && opts.scheme && opts.scheme !== inferred) {
    errors.push({ code: "scheme-switch", message: `the version ${currentText} is ${inferred}; switching to ${opts.scheme} is refused` });
  }

  // Tags and state.
  const tags = listTags(git);
  const lastTag = lastTagOf(tags);
  const state = detectState(current, tags);
  if (state === "behind") {
    errors.push({ code: "version-behind-tag", message: `the version ${currentText} is not above the last tag ${lastTag}, and is not tagged` });
  }

  // Commits since the last tag, up to --at or HEAD.
  const tip = opts.at ?? "HEAD";
  const range = lastTag ? `${lastTag}..${tip}` : tip;
  const commits = listCommits(git, range);
  const fromCommits = levelFromCommits(commits);
  const level = fromCommits.level;
  reasons.push(...fromCommits.reasons);

  // Proposal, or validation of --version.
  let proposed: Version | null = null;
  const today = parseToday(opts.today);
  if (opts.version !== undefined) {
    const v = parseVersion(opts.version);
    if (!v) {
      errors.push({ code: "invalid-version", message: `"${opts.version}" is not a SemVer version` });
    } else {
      const vs = inferScheme(v);
      if (scheme && vs && vs !== scheme) {
        errors.push({ code: "scheme-switch", message: `${opts.version} is ${vs}, but the project is ${scheme}; switching is refused` });
      }
      scheme ??= vs;
      proposed = v;
      reasons.unshift(`override: ${formatVersion(v)} given with --version`);
    }
  } else if (state === "half-done") {
    reasons.unshift(`half-done: ${currentText} is in the file but has no tag; tag v${currentText}`);
  } else if (!scheme) {
    warnings.push({ code: "scheme-unset", message: "no scheme yet; ask semver or calver (permanent), then pass --scheme" });
  } else if (scheme === "calver") {
    proposed = nextCalver(current, today, opts.pre);
    reasons.unshift(`calver: ${formatVersion(proposed)} for ${today.getFullYear()}-${today.getMonth() + 1}`);
  } else {
    proposed = nextSemver(current, level, opts.pre);
    if (!current || inferScheme(current) === null) reasons.unshift("first release: 0.1.0");
    else if (current.pre) reasons.unshift(`pre-release: ${currentText} continues on its own core`);
    else if (current.major === 0 && level === "major") reasons.unshift("below 1.0.0: a breaking change bumps minor");
  }

  if (proposed && current && compareVersions(proposed, current) <= 0) {
    errors.push({ code: "not-greater", message: `${formatVersion(proposed)} is not above the current ${currentText}` });
  }
  if (opts.version === undefined && proposed && level === "none" && state !== "no-version") {
    warnings.push({ code: "nothing-releasable", message: "no feat, fix, perf or breaking commits since the last tag; offer the patch anyway" });
  }

  // --at: has the level since the last tag outgrown the bump in the file?
  if (opts.at && lastTag && current && scheme === "semver") {
    const expected = nextSemver(parseVersion(lastTag), level);
    if (level !== "none" && compareVersions({ ...current, pre: null }, expected) < 0) {
      warnings.push({
        code: "commits-after-cut",
        message: `commits up to ${opts.at} call for ${level} (${formatVersion(expected)}), above the ${currentText} in the file`,
      });
    }
  }

  return {
    root,
    versionFile,
    versions,
    current: currentText,
    scheme,
    bumpp: detectBumpp(root),
    changelogithub: detectChangelogithub(root),
    lastTag,
    state,
    range,
    commits,
    level,
    proposed: proposed ? formatVersion(proposed) : null,
    reasons,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------- write

/** Write `VERSION`. Refused for a package.json project; that path uses `bun pm version`. */
export function writeVersion(root: string, version: string): string {
  const v = parseVersion(version);
  if (!v || version.startsWith("v")) throw new UsageError(`"${version}" is not a bare SemVer version (no "v")`);
  const versions = readVersions(root);
  if (versions.VERSION === undefined && versions["package.json"] !== undefined) {
    throw new UsageError("this project keeps its version in package.json; use `bun pm version <v> --no-git-tag-version`");
  }
  const path = join(root, "VERSION");
  writeFileSync(path, `${formatVersion(v)}\n`);
  return path;
}

// ---------------------------------------------------------------- CLI

export class UsageError extends Error {}

const USAGE = `usage:
  release.ts plan [--root <dir>] [--version <v>] [--pre <id>] [--at <sha>]
                  [--today YYYY-MM-DD] [--scheme semver|calver]
                  [--file VERSION|package.json]
  release.ts write <version> [--root <dir>]`;

function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Record<string, string> } {
  const [cmd = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const val = rest[i + 1];
      if (val === undefined || val.startsWith("--")) throw new UsageError(`${a} needs a value`);
      flags[a.slice(2)] = val;
      i++;
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

const PLAN_FLAGS = new Set(["root", "version", "pre", "at", "today", "scheme", "file"]);

export function main(argv: string[]): number {
  try {
    const { cmd, positional, flags } = parseArgs(argv);
    const root = resolve(flags.root ?? ".");
    if (cmd === "plan") {
      for (const k of Object.keys(flags)) if (!PLAN_FLAGS.has(k)) throw new UsageError(`unknown flag --${k}`);
      if (flags.scheme && flags.scheme !== "semver" && flags.scheme !== "calver") {
        throw new UsageError("--scheme wants semver or calver");
      }
      if (flags.file && flags.file !== "VERSION" && flags.file !== "package.json") {
        throw new UsageError("--file wants VERSION or package.json");
      }
      const result = plan({
        root,
        version: flags.version,
        pre: flags.pre,
        at: flags.at,
        today: flags.today,
        scheme: flags.scheme as Scheme | undefined,
        file: flags.file as VersionFile | undefined,
      });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    if (cmd === "write") {
      if (positional.length !== 1) throw new UsageError("write wants exactly one version");
      console.log(`wrote ${writeVersion(root, positional[0])}`);
      return 0;
    }
    throw new UsageError(cmd ? `unknown command "${cmd}"` : "no command");
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`release.ts: ${e.message}\n${USAGE}`);
      return 2;
    }
    throw e;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
