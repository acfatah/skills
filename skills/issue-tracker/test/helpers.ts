import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "bun:test";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

const made: string[] = [];
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

export function tempDir(prefix = "it-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

export function sh(cmd: string[], cwd: string): string {
  const proc = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, ...GIT_ENV },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

export function gitRepo(dir = tempDir()): string {
  mkdirSync(dir, { recursive: true });
  sh(["git", "init", "-q", "-b", "main"], dir);
  sh(["git", "commit", "-q", "--allow-empty", "-m", "init"], dir);
  return dir;
}

export const ROOT = join(import.meta.dir, "..");
export const BUNDLE = join(ROOT, "scripts", "issues.js");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Runs the committed bundle, as Claude does.
export function run(args: string[], cwd: string, opts: { stdin?: string; env?: Record<string, string> } = {}): RunResult {
  const proc = Bun.spawnSync(["bun", BUNDLE, ...args], {
    cwd,
    env: { ...process.env, ...GIT_ENV, ...opts.env },
    stdin: opts.stdin === undefined ? "ignore" : new TextEncoder().encode(opts.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

// Like run, but leaves the event loop free, so an in-process fake server
// can answer the CLI.
export async function runAsync(
  args: string[],
  cwd: string,
  opts: { stdin?: string; env?: Record<string, string> } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", BUNDLE, ...args], {
    cwd,
    env: { ...process.env, ...GIT_ENV, ...opts.env },
    stdin: opts.stdin === undefined ? "ignore" : new TextEncoder().encode(opts.stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}
