import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLE, ROOT, tempDir } from "./helpers.ts";

test("scripts/issues.js is built from the current src/", () => {
  const out = join(tempDir(), "issues.js");
  const proc = Bun.spawnSync(
    ["bun", "build", "src/cli.ts", "--target=bun", "--outfile", out],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  expect(proc.exitCode).toBe(0);
  const fresh = readFileSync(out, "utf8");
  const committed = readFileSync(BUNDLE, "utf8");
  if (fresh !== committed) {
    throw new Error("scripts/issues.js is stale. Run `bun run build` and commit it.");
  }
});

test("the bundle runs on its own", () => {
  const proc = Bun.spawnSync(["bun", BUNDLE, "--version"], { cwd: tempDir(), stdout: "pipe" });
  expect(proc.exitCode).toBe(0);
  expect(proc.stdout.toString().trim()).toMatch(/^\d+\.\d+\.\d+$/);
});
