import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, cpSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Config, configPath, readConfig, writeConfig } from "../src/config.ts";
import { AuthError, Offline } from "../src/errors.ts";
import { Outbox, replay } from "../src/outbox.ts";
import { normalizeRemote } from "../src/project.ts";
import { LATEST_VERSION, getVersion, migrate } from "../src/schema.ts";
import { LocalStore } from "../src/store/local.ts";
import { TursoStore } from "../src/store/turso.ts";
import { FakeHrana } from "./fake-hrana.ts";
import { gitRepo, runAsync, sh, tempDir } from "./helpers.ts";

const fakes: FakeHrana[] = [];
afterAll(() => fakes.forEach((f) => f.stop()));
function fake(): FakeHrana {
  const f = new FakeHrana().start();
  fakes.push(f);
  return f;
}

describe("project key", () => {
  test.each([
    ["git@github.com:acfatah/skills.git", "github.com/acfatah/skills"],
    ["https://github.com/acfatah/skills", "github.com/acfatah/skills"],
    ["https://GitHub.com/acfatah/skills.git/", "github.com/acfatah/skills"],
    ["ssh://git@github.com:22/acfatah/skills.git", "github.com/acfatah/skills"],
    ["https://user:pw@gitlab.example.com/Group/Sub/repo.git", "gitlab.example.com/Group/Sub/repo"],
    ["github.com:a/b", "github.com/a/b"],
  ])("%s → %s", (url, key) => {
    expect(normalizeRemote(url)).toBe(key);
  });
});

describe("user config", () => {
  test("XDG path, written 0600, warns when others can read it", () => {
    const home = tempDir();
    process.env.XDG_CONFIG_HOME = home;
    try {
      expect(configPath()).toBe(join(home, "issue-tracker", "config.json"));
      const config: Config = { projects: { "github.com/a/b": { backend: "local" } }, dirs: { "/x": "slug" } };
      writeConfig(config);
      expect(statSync(configPath()).mode & 0o777).toBe(0o600);
      const warnings: string[] = [];
      expect(readConfig((w) => warnings.push(w))).toEqual(config);
      expect(warnings).toEqual([]);
      chmodSync(configPath(), 0o644);
      readConfig((w) => warnings.push(w));
      expect(warnings[0]).toContain("chmod 600");
    } finally {
      delete process.env.XDG_CONFIG_HOME;
    }
  });
});

describe("Turso adapter against the fake", () => {
  test("types, integers, RETURNING, schema version in meta", async () => {
    const f = fake();
    const s = new TursoStore(f.url, f.token);
    await migrate(s);
    expect(await getVersion(s)).toBe(LATEST_VERSION);
    expect(f.db.query("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({ value: String(LATEST_VERSION) });
    const [row] = await s.query<Record<string, unknown>>("SELECT 1 AS i, 2.5 AS f, 'x' AS t, NULL AS n, x'0102' AS b");
    expect(row).toMatchObject({ i: 1, f: 2.5, t: "x", n: null });
    expect(typeof row!.i).toBe("number");
    const [made] = await s.query<{ id: number }>(
      "INSERT INTO issues (title, status, created, updated) VALUES ('a', 'triage', '2026-01-01', '2026-01-01') RETURNING id",
    );
    expect(made).toEqual({ id: 1 });
    await s.close();
  });

  test("a failing statement rolls the whole batch back", async () => {
    const f = fake();
    const s = new TursoStore(f.url, f.token);
    await migrate(s);
    const insert = { sql: "INSERT INTO milestones (name) VALUES (?)", args: ["a"] };
    await expect(s.batch([insert, insert])).rejects.toThrow(/UNIQUE/);
    expect(await s.query("SELECT * FROM milestones")).toEqual([]);
  });

  test("401 is an AuthError, a refused port or 503 is Offline", async () => {
    const f = fake();
    await expect(new TursoStore(f.url, "wrong").query("SELECT 1")).rejects.toBeInstanceOf(AuthError);
    f.mode = "unavailable";
    await expect(new TursoStore(f.url, f.token).query("SELECT 1")).rejects.toBeInstanceOf(Offline);
    f.stop();
    await expect(new TursoStore(f.url, f.token).query("SELECT 1")).rejects.toBeInstanceOf(Offline);
  });
});

// A repo with an origin, a config pointing it at fake Turso databases, and
// a CLI runner with the token in the environment.
function project(opts: { security?: boolean } = {}) {
  const repo = gitRepo();
  sh(["git", "remote", "add", "origin", "git@github.com:acfatah/demo.git"], repo);
  const home = tempDir();
  const issues = fake();
  const security = opts.security ? fake() : null;
  const env = {
    XDG_CONFIG_HOME: home,
    DEMO_ISSUES_TOKEN: issues.token,
    DEMO_SECURITY_TOKEN: security?.token ?? "",
    ISSUE_TRACKER_TODAY: "2026-10-20",
    ISSUE_TRACKER_TIMEOUT_MS: "2000",
  };
  const $ = (...args: string[]) => runAsync(args, repo, { env });
  const enable = () =>
    $(
      "remote",
      "enable",
      "--issues-url",
      issues.url,
      "--token-env",
      "DEMO_ISSUES_TOKEN",
      ...(security ? ["--security-url", security.url, "--security-token-env", "DEMO_SECURITY_TOKEN"] : []),
    );
  return { repo, home, issues, security, env, $, enable };
}

async function ok(p: Promise<{ code: number; stdout: string; stderr: string }>) {
  const r = await p;
  if (r.code !== 0) throw new Error(`exit ${r.code}: ${r.stderr}${r.stdout}`);
  return r;
}

describe("Turso projects through the bundle", () => {
  test("remote enable on an empty remote copies local rows with their ids", async () => {
    const p = project({ security: true });
    await ok(p.$("new", "--title", "First", "--type", "bug"));
    await ok(p.$("new", "--title", "Second", "--type", "bug"));
    await ok(p.$("delete", "2"));
    await ok(p.$("new", "--title", "Finding", "--type", "security"));
    await ok(p.$("milestone", "add", "v1"));
    const r = await ok(p.enable());
    expect(r.stdout).toContain("github.com/acfatah/demo now syncs to Turso");
    expect(p.issues.db.query("SELECT id, title FROM issues").all()).toEqual([{ id: 1, title: "First" }]);
    expect(p.security!.db.query("SELECT id, title FROM issues").all()).toEqual([{ id: 1, title: "Finding" }]);
    const cfg = JSON.parse(readFileSync(join(p.home, "issue-tracker", "config.json"), "utf8"));
    expect(cfg.projects["github.com/acfatah/demo"]).toEqual({
      backend: "turso",
      issues: { url: p.issues.url, tokenEnv: "DEMO_ISSUES_TOKEN" },
      security: { url: p.security!.url, tokenEnv: "DEMO_SECURITY_TOKEN" },
    });
    // The deleted id 2 stays retired on Turso too.
    expect((await ok(p.$("new", "--title", "Third", "--type", "bug"))).stdout).toContain("0003");
    expect(p.issues.db.query("SELECT COUNT(*) AS n FROM issues").get()).toEqual({ n: 2 });
  });

  test("remote enable on a second machine pulls; refuses when both sides have rows", async () => {
    const p = project();
    await ok(p.$("new", "--title", "On machine A", "--type", "task"));
    await ok(p.enable());
    // Machine B: a fresh clone with the same origin and config.
    const b = gitRepo();
    sh(["git", "remote", "add", "origin", "https://github.com/acfatah/demo"], b);
    const cfgFile = join(p.home, "issue-tracker", "config.json");
    const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
    delete cfg.projects["github.com/acfatah/demo"];
    writeFileSync(cfgFile, JSON.stringify(cfg));
    const pulled = await ok(runAsync(["remote", "enable", "--issues-url", p.issues.url, "--token-env", "DEMO_ISSUES_TOKEN"], b, { env: p.env }));
    expect(pulled.stdout).toContain("issues: pulled from Turso.");
    expect((await ok(runAsync(["list"], b, { env: p.env }))).stdout).toContain("On machine A");
    // Machine C has its own local rows: refuse.
    const c = gitRepo();
    sh(["git", "remote", "add", "origin", "https://github.com/acfatah/demo"], c);
    await ok(runAsync(["new", "--title", "Local only"], c, { env: p.env }));
    const refused = await runAsync(["remote", "enable", "--issues-url", p.issues.url, "--token-env", "DEMO_ISSUES_TOKEN", "--slug", "x"], c, {
      env: p.env,
    });
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("already syncs");
  });

  test("both sides with rows: refused, export suggested", async () => {
    const p = project();
    await ok(p.$("new", "--title", "Local"));
    p.issues.db.run("PRAGMA foreign_keys = OFF");
    await migrate(new TursoStore(p.issues.url, p.issues.token));
    p.issues.db.run("INSERT INTO issues (title, status, created, updated) VALUES ('Remote', 'triage', '2026-01-01', '2026-01-01')");
    const r = await p.enable();
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("export --out");
    expect(existsSync(join(p.home, "issue-tracker", "config.json"))).toBe(false);
  });

  test("offline: new and note queue with P ids, other writes exit 2, reads say how stale", async () => {
    const p = project();
    expect((await ok(p.enable())).stdout).toContain("issues: both sides are empty; nothing to copy.");
    await ok(p.$("new", "--title", "Online", "--type", "bug"));
    p.issues.stop();
    const queued = await ok(p.$("new", "--title", "Offline one", "--type", "bug", "--label", "x"));
    expect(queued.stdout).toContain("Queued P1 (offline)");
    expect((await ok(p.$("note", "P1", "more detail"))).stdout).toContain("Noted on P1");
    expect((await ok(p.$("note", "1", "seen again"))).stdout).toContain("Noted on 0001");
    const move = await p.$("move", "1", "open");
    expect(move.code).toBe(2);
    expect(move.stderr).toContain("Only new issues and notes queue offline");
    expect(move.stderr).not.toMatch(/[.?!]\./);
    expect((await p.$("new", "--title", "child", "--parent", "P1")).code).toBe(1);
    const list = await ok(p.$("list"));
    expect(list.stdout).toContain("0001");
    expect(list.stdout).toMatch(/P1\s+queued/);
    expect(list.stderr).toMatch(/offline; issues as of \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    const shown = await ok(p.$("show", "P1"));
    expect(shown.stdout).toContain("- 2026-10-20: more detail");
    expect((await ok(p.$("show", "1"))).stdout).toContain("seen again");
    expect((await p.$("flush")).code).toBe(2);

    p.issues.start();
    const back = await ok(p.$("list"));
    expect(back.stderr).toContain("P1 → 0002");
    expect(back.stderr).not.toContain("offline");
    expect(readFileSync(join(p.repo, ".claude", "issues.outbox.jsonl"), "utf8")).toBe("");
    expect(p.issues.db.query("SELECT issue_id, text FROM notes ORDER BY id").all()).toEqual([
      { issue_id: 2, text: "more detail" },
      { issue_id: 1, text: "seen again" },
    ]);
    expect((await ok(p.$("show", "P1", "--json"))).stdout).toContain('"id": "0002"');
    expect((await ok(p.$("move", "2", "open"))).stdout).toContain("triage → open");
  });

  test("a 401 is reported, never queued", async () => {
    const p = project();
    await ok(p.enable());
    p.issues.mode = "unauthorized";
    const r = await p.$("new", "--title", "x");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("turso db tokens invalidate");
    expect(existsSync(join(p.repo, ".claude", "issues.outbox.jsonl"))).toBe(false);
  });

  test("security stays local unless it has its own database", async () => {
    const p = project();
    await ok(p.enable());
    await ok(p.$("new", "--title", "Finding", "--type", "security"));
    expect(p.issues.db.query("SELECT COUNT(*) AS n FROM issues").get()).toEqual({ n: 0 });
    const st = JSON.parse((await ok(p.$("remote", "status", "--json"))).stdout);
    expect(st).toMatchObject({ project: "github.com/acfatah/demo", backend: "turso", security: { backend: "local" } });
  });

  test("import --v1 writes into a Turso project", async () => {
    const p = project();
    await ok(p.enable());
    cpSync(join(import.meta.dir, "fixtures", "v1"), join(p.repo, ".claude", "issues"), { recursive: true });
    const r = await ok(p.$("import", "--v1"));
    expect(r.stdout).toContain("Counts match");
    expect(p.issues.db.query("SELECT id FROM issues ORDER BY id").all().map((x) => (x as { id: number }).id)).toEqual([1, 2, 3, 4, 5, 7]);
  });

  test("remote disable flushes, pulls a final copy, and goes local", async () => {
    const p = project();
    await ok(p.enable());
    await ok(p.$("new", "--title", "Kept", "--type", "bug"));
    p.issues.stop();
    await ok(p.$("new", "--title", "Queued"));
    expect((await p.$("remote", "disable")).code).toBe(2);
    p.issues.start();
    const r = await ok(p.$("remote", "disable"));
    expect(r.stdout).toContain("P1 → 0002");
    p.issues.stop();
    // Local now: works with Turso gone, and keeps counting.
    expect((await ok(p.$("new", "--title", "After"))).stdout).toContain("0003");
    expect((await ok(p.$("list"))).stdout).toContain("Queued");
  });
});

describe("outbox replay", () => {
  let dir: string;
  beforeEach(() => {
    dir = tempDir();
  });

  test("a crash after the server commit does not duplicate on replay", async () => {
    const f = fake();
    const remote = new TursoStore(f.url, f.token);
    await migrate(remote);
    const mirror = new LocalStore(join(dir, "issues.sqlite3"));
    await migrate(mirror);
    const outbox = new Outbox(join(dir, "issues.outbox.jsonl"));
    outbox.append({ kind: "new", client_id: "c-1", pid: 1, date: "2026-10-20", issue: { title: "Once", type: "bug", labels: ["a"] } });
    outbox.append({ kind: "note", client_id: "c-2", date: "2026-10-20", target: { pid: 1 }, text: "on P1" });
    await expect(
      replay(remote, "issues", outbox, mirror, {
        afterCommit: () => {
          throw new Error("crash");
        },
      }),
    ).rejects.toThrow();
    expect(outbox.read()).toHaveLength(2);
    expect(await replay(remote, "issues", outbox, mirror)).toEqual(["P1 → 0001", "Sent a queued note on 0001."]);
    expect(f.db.query("SELECT COUNT(*) AS n FROM issues").get()).toEqual({ n: 1 });
    expect(f.db.query("SELECT label FROM labels").all()).toEqual([{ label: "a" }]);
    expect(outbox.read()).toEqual([]);
    const raw = new Database(join(dir, "issues.sqlite3"));
    expect(raw.query("SELECT value FROM sync WHERE key = 'pid_map'").get()).toEqual({ value: '{"1":1}' });
    raw.close();
  });
});
