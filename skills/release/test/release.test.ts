import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Commit,
  compareVersions,
  detectState,
  formatVersion,
  inferScheme,
  lastTagOf,
  levelFromCommits,
  nextCalver,
  nextSemver,
  parseCommit,
  parseVersion,
  plan,
  writeVersion,
} from "../scripts/release.ts";

const v = (s: string) => parseVersion(s)!;
const f = formatVersion;
const c = (subject: string, body = ""): Commit => parseCommit("abcdef1234567890", subject, body);

// ---------------------------------------------------------------- unit

describe("parseVersion and compareVersions", () => {
  test("parses plain, v-prefixed and pre-release versions", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, pre: null });
    expect(parseVersion("v2026.11.0")).toEqual({ major: 2026, minor: 11, patch: 0, pre: null });
    expect(parseVersion("1.0.0-rc.1")?.pre).toBe("rc.1");
  });

  test("rejects non-SemVer text", () => {
    for (const s of ["1.2", "01.2.3", "2026.03.1", "x1.2.3", ""]) expect(parseVersion(s)).toBeNull();
  });

  test("orders by SemVer precedence", () => {
    const sorted = ["1.0.0", "1.0.0-rc.1", "1.0.0-alpha", "1.0.0-rc.10", "0.9.9", "1.0.0-rc.2"]
      .map(v)
      .sort(compareVersions)
      .map(f);
    expect(sorted).toEqual(["0.9.9", "1.0.0-alpha", "1.0.0-rc.1", "1.0.0-rc.2", "1.0.0-rc.10", "1.0.0"]);
  });

  test("lastTagOf sorts by version, not as text", () => {
    expect(lastTagOf(["v2026.2.0", "v2026.10.0", "v2026.9.3"])).toBe("v2026.10.0");
    expect(lastTagOf(["v1.0.0-rc.1", "v1.0.0", "other"])).toBe("v1.0.0");
    expect(lastTagOf(["release-1"])).toBeNull();
  });
});

describe("inferScheme", () => {
  test("year-like major with a month-like minor is CalVer", () => {
    expect(inferScheme(v("2026.11.0"))).toBe("calver");
    expect(inferScheme(v("2000.1.5"))).toBe("calver");
    expect(inferScheme(v("2999.12.0"))).toBe("calver");
  });

  test("edges fall back to SemVer", () => {
    expect(inferScheme(v("2026.13.0"))).toBe("semver");
    expect(inferScheme(v("2026.0.0"))).toBe("semver");
    expect(inferScheme(v("1999.1.0"))).toBe("semver");
    expect(inferScheme(v("3000.1.0"))).toBe("semver");
    expect(inferScheme(v("1.2.3"))).toBe("semver");
  });

  test("0.0.0 and no version have no scheme", () => {
    expect(inferScheme(v("0.0.0"))).toBeNull();
    expect(inferScheme(null)).toBeNull();
  });
});

describe("levelFromCommits", () => {
  test("feat is minor, fix and perf are patch, others none", () => {
    expect(levelFromCommits([c("fix: a"), c("feat(ui): b")]).level).toBe("minor");
    expect(levelFromCommits([c("perf: a"), c("docs: b")]).level).toBe("patch");
    expect(levelFromCommits([c("docs: a"), c("chore: b"), c("Merge stuff")]).level).toBe("none");
  });

  test("! and BREAKING CHANGE are major", () => {
    expect(levelFromCommits([c("feat!: drop node 18")]).level).toBe("major");
    expect(levelFromCommits([c("refactor(api)!: rename")]).level).toBe("major");
    expect(levelFromCommits([c("fix: x", "text\n\nBREAKING CHANGE: gone")]).level).toBe("major");
    expect(levelFromCommits([c("fix: x", "BREAKING-CHANGE: gone")]).level).toBe("major");
  });

  test("one reason per releasable commit", () => {
    const r = levelFromCommits([c("feat: add x"), c("docs: y")]);
    expect(r.reasons).toEqual(["minor: abcdef1 feat: add x (feat)"]);
  });
});

describe("nextSemver", () => {
  test("bumps by level", () => {
    expect(f(nextSemver(v("1.2.3"), "major"))).toBe("2.0.0");
    expect(f(nextSemver(v("1.2.3"), "minor"))).toBe("1.3.0");
    expect(f(nextSemver(v("1.2.3"), "patch"))).toBe("1.2.4");
    expect(f(nextSemver(v("1.2.3"), "none"))).toBe("1.2.4");
  });

  test("below 1.0.0 a break bumps minor", () => {
    expect(f(nextSemver(v("0.4.2"), "major"))).toBe("0.5.0");
    expect(f(nextSemver(v("0.4.2"), "patch"))).toBe("0.4.3");
  });

  test("first release is 0.1.0", () => {
    expect(f(nextSemver(null, "major"))).toBe("0.1.0");
    expect(f(nextSemver(v("0.0.0"), "patch"))).toBe("0.1.0");
  });

  test("pre-release ids", () => {
    expect(f(nextSemver(v("1.2.3"), "minor", "rc"))).toBe("1.3.0-rc.0");
    expect(f(nextSemver(v("1.3.0-rc.0"), "minor", "rc"))).toBe("1.3.0-rc.1");
    expect(f(nextSemver(v("1.3.0-beta.2"), "patch", "rc"))).toBe("1.3.0-rc.0");
    expect(f(nextSemver(v("1.3.0-rc.4"), "major"))).toBe("1.3.0");
  });
});

describe("nextCalver", () => {
  const nov = new Date(2026, 10, 7);
  test("same month adds one to MICRO", () => {
    expect(f(nextCalver(v("2026.11.0"), nov))).toBe("2026.11.1");
    expect(f(nextCalver(v("2026.11.9"), nov))).toBe("2026.11.10");
  });

  test("a new month resets MICRO, with no padding", () => {
    expect(f(nextCalver(v("2026.10.3"), nov))).toBe("2026.11.0");
    expect(f(nextCalver(v("2026.12.1"), new Date(2027, 0, 2)))).toBe("2027.1.0");
    expect(f(nextCalver(null, new Date(2026, 2, 1)))).toBe("2026.3.0");
  });

  test("pre-release ids", () => {
    expect(f(nextCalver(v("2026.11.0"), nov, "rc"))).toBe("2026.11.1-rc.0");
    expect(f(nextCalver(v("2026.11.1-rc.0"), nov, "rc"))).toBe("2026.11.1-rc.1");
    expect(f(nextCalver(v("2026.11.1-rc.1"), nov))).toBe("2026.11.1");
  });
});

describe("detectState", () => {
  test("each state", () => {
    expect(detectState(null, ["v1.0.0"])).toBe("no-version");
    expect(detectState(v("1.0.0"), [])).toBe("untagged");
    expect(detectState(v("1.0.0"), ["v0.9.0", "v1.0.0"])).toBe("fresh");
    expect(detectState(v("1.1.0"), ["v1.0.0"])).toBe("half-done");
    expect(detectState(v("0.9.0"), ["v1.0.0"])).toBe("behind");
  });
});

// ---------------------------------------------------------------- integration

const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

function sh(cwd: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.com",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
}

/** A temp repo with the given files committed as "chore: init". */
function repo(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "release-test-"));
  tmpRoots.push(dir);
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "config", "commit.gpgsign", "false");
  sh(dir, "config", "tag.gpgsign", "false");
  for (const [name, text] of Object.entries(files)) put(dir, name, text);
  commit(dir, "chore: init");
  return dir;
}

function put(dir: string, name: string, text: string): void {
  mkdirSync(join(dir, name, ".."), { recursive: true });
  writeFileSync(join(dir, name), text);
}

function commit(dir: string, msg: string): string {
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "--allow-empty", "-m", msg);
  return sh(dir, "rev-parse", "HEAD");
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const TODAY = "2026-11-07";

describe("plan on temp repos", () => {
  test("no-version asks for the scheme, then proposes per scheme", () => {
    const dir = repo({ "a.txt": "a" });
    const p = plan({ root: dir, today: TODAY });
    expect(p.state).toBe("no-version");
    expect(p.versionFile).toBeNull();
    expect(p.proposed).toBeNull();
    expect(codes(p.warnings)).toContain("scheme-unset");
    expect(plan({ root: dir, today: TODAY, scheme: "semver" }).proposed).toBe("0.1.0");
    expect(plan({ root: dir, today: TODAY, scheme: "calver" }).proposed).toBe("2026.11.0");
  });

  test("untagged: a version but no tags", () => {
    const dir = repo({ VERSION: "0.3.0\n" });
    commit(dir, "feat: x");
    const p = plan({ root: dir, today: TODAY });
    expect(p.state).toBe("untagged");
    expect(p.versionFile).toBe("VERSION");
    expect(p.scheme).toBe("semver");
    expect(p.proposed).toBe("0.4.0");
  });

  test("fresh: proposes from commits since the last tag", () => {
    const dir = repo({ VERSION: "1.2.3\n" });
    sh(dir, "tag", "v1.2.3");
    commit(dir, "feat: x");
    commit(dir, "fix: y");
    const p = plan({ root: dir, today: TODAY });
    expect(p.state).toBe("fresh");
    expect(p.lastTag).toBe("v1.2.3");
    expect(p.commits.map((x) => x.type)).toEqual(["fix", "feat"]);
    expect(p.level).toBe("minor");
    expect(p.proposed).toBe("1.3.0");
    expect(p.errors).toEqual([]);
  });

  test("fresh with only docs: nothing-releasable, still offers a patch", () => {
    const dir = repo({ VERSION: "1.2.3\n" });
    sh(dir, "tag", "v1.2.3");
    commit(dir, "docs: x");
    const p = plan({ root: dir, today: TODAY });
    expect(p.level).toBe("none");
    expect(p.proposed).toBe("1.2.4");
    expect(codes(p.warnings)).toContain("nothing-releasable");
  });

  test("CalVer project in the same month", () => {
    const dir = repo({ VERSION: "2026.11.0\n" });
    sh(dir, "tag", "v2026.11.0");
    commit(dir, "fix: y");
    const p = plan({ root: dir, today: TODAY });
    expect(p.scheme).toBe("calver");
    expect(p.proposed).toBe("2026.11.1");
  });

  test("--version validates overrides: scheme-switch and not-greater", () => {
    const dir = repo({ VERSION: "1.2.3\n" });
    sh(dir, "tag", "v1.2.3");
    expect(codes(plan({ root: dir, version: "2026.11.0" }).errors)).toContain("scheme-switch");
    expect(codes(plan({ root: dir, version: "1.2.3" }).errors)).toContain("not-greater");
    expect(codes(plan({ root: dir, version: "1.2" }).errors)).toContain("invalid-version");
    const ok = plan({ root: dir, version: "2.0.0" });
    expect(ok.errors).toEqual([]);
    expect(ok.proposed).toBe("2.0.0");
  });

  test("--scheme cannot switch a known scheme", () => {
    const dir = repo({ VERSION: "2026.10.0\n" });
    expect(codes(plan({ root: dir, scheme: "semver" }).errors)).toContain("scheme-switch");
  });

  test("both-files, and versions-differ", () => {
    const same = repo({ VERSION: "1.0.0\n", "package.json": '{"version":"1.0.0"}' });
    const p = plan({ root: same, today: TODAY });
    expect(p.versionFile).toBeNull();
    expect(codes(p.warnings)).toContain("both-files");
    expect(plan({ root: same, file: "package.json" }).versionFile).toBe("package.json");

    const differ = repo({ VERSION: "1.0.0\n", "package.json": '{"version":"1.1.0"}' });
    expect(codes(plan({ root: differ }).errors)).toContain("versions-differ");
  });

  test("bumpp detection: config file or devDependency", () => {
    expect(plan({ root: repo({ "bump.config.ts": "export default {}" }) }).bumpp).toBe("bump.config.ts");
    const dev = repo({ "package.json": '{"version":"1.0.0","devDependencies":{"bumpp":"^12"}}' });
    expect(plan({ root: dev }).bumpp).toBe("package.json devDependencies.bumpp");
    expect(plan({ root: repo({ VERSION: "1.0.0\n" }) }).bumpp).toBeNull();
  });

  test("changelogithub workflow detection", () => {
    const dir = repo({ ".github/workflows/release.yml": "steps:\n  - run: npx changelogithub\n" });
    expect(plan({ root: dir }).changelogithub).toBe(".github/workflows/release.yml");
  });

  test("half-done, and commits-after-cut with --at", () => {
    const dir = repo({ VERSION: "1.2.3\n" });
    sh(dir, "tag", "v1.2.3");
    commit(dir, "fix: y");
    put(dir, "VERSION", "1.2.4\n");
    const cut = commit(dir, "chore(release): v1.2.4");
    const p = plan({ root: dir, today: TODAY });
    expect(p.state).toBe("half-done");
    expect(p.proposed).toBeNull();

    expect(codes(plan({ root: dir, at: cut }).warnings)).not.toContain("commits-after-cut");
    const after = commit(dir, "feat: merged after the cut");
    const late = plan({ root: dir, at: after });
    expect(late.state).toBe("half-done");
    expect(codes(late.warnings)).toContain("commits-after-cut");
  });

  test("behind: version below the last tag", () => {
    const dir = repo({ VERSION: "1.0.0\n" });
    sh(dir, "tag", "v1.1.0");
    const p = plan({ root: dir });
    expect(p.state).toBe("behind");
    expect(codes(p.errors)).toContain("version-behind-tag");
  });

  test("plan writes nothing", () => {
    const dir = repo({ VERSION: "1.0.0\n" });
    plan({ root: dir, today: TODAY });
    expect(sh(dir, "status", "--short")).toBe("");
  });
});

describe("writeVersion", () => {
  test("writes VERSION, creating it when missing", () => {
    const dir = repo({ "a.txt": "a" });
    writeVersion(dir, "0.1.0");
    expect(readFileSync(join(dir, "VERSION"), "utf8")).toBe("0.1.0\n");
  });

  test("refuses a package.json project and bad versions", () => {
    const pj = repo({ "package.json": '{"version":"1.0.0"}' });
    expect(() => writeVersion(pj, "1.1.0")).toThrow(/bun pm version/);
    const dir = repo({ VERSION: "1.0.0\n" });
    expect(() => writeVersion(dir, "v1.1.0")).toThrow();
    expect(() => writeVersion(dir, "1.1")).toThrow();
  });
});
