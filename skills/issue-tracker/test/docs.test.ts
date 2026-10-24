import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, run, tempDir } from "./helpers.ts";

const skill = readFileSync(join(ROOT, "SKILL.md"), "utf8");

function section(md: string, heading: string): string {
  const start = md.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`no ${heading}`);
  const end = md.indexOf("\n## ", start + 1);
  return md.slice(start, end < 0 ? undefined : end);
}

test("no v1 storage terms outside the upgrade section", () => {
  const docs = [
    skill.replace(section(skill, "## Upgrading from v1"), ""),
    ...readdirSync(join(ROOT, "references")).map((f) => readFileSync(join(ROOT, "references", f), "utf8")),
  ].join("\n");
  // `## Sub-issues` in backticks is the v1 body mirror; the GitHub API
  // section of the same name stays.
  const terms = [/\b(triage|open|in-progress|blocked|closed|security)\/(?!\w)/g, /MILESTONES\.md/g, /`## Sub-issues`/g, /Next number/g, /\.claude\/issues\//g];
  expect(terms.flatMap((t) => docs.match(t) ?? [])).toEqual([]);
});

test("every verb in SKILL.md exists in --help, and the other way round", () => {
  const table = section(skill, "## Verbs").split("\n### ")[0]!;
  const documented = [...table.matchAll(/^\| `([a-z]+)`/gm)].map((m) => m[1]);
  const help = run(["--help"], tempDir()).stdout;
  const verbs = help.slice(help.indexOf("Verbs:\n"), help.indexOf("\n\n", help.indexOf("Verbs:\n")));
  const offered = [...verbs.matchAll(/^ {2}([a-z]+)\b/gm)].map((m) => m[1]);
  expect(new Set(documented)).toEqual(new Set(offered));
  for (const verb of documented) expect(help).toContain(`  ${verb}`);
});

test("the SKILL.md version matches the CLI version", () => {
  const version = /^# Issue Tracker v(\d+\.\d+\.\d+)$/m.exec(skill)?.[1];
  expect(run(["--version"], tempDir()).stdout.trim()).toBe(version!);
});
