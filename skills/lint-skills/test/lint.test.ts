import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseFrontmatter, run, stripFences } from "../scripts/lint.ts";

const made: string[] = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

function tempDir(prefix = "ls-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const README_BODY = `## What it is\n\n## What it is not\n\n## When not to use\n\n## Install\n\n## Usage\n`;

function addSkill(root: string, name: string, opts: { body?: string; description?: string } = {}): void {
  const description = opts.description ?? `Do ${name} things.`;
  write(root, `skills/${name}/SKILL.md`, `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name} v1.0.0\n\n${opts.body ?? ""}\n`);
  write(root, `skills/${name}/README.md`, `# ${name}\n\n${README_BODY}`);
}

/** A clean repo: two skills that refer to each other, one workflow. */
function cleanRepo(): string {
  const root = tempDir();
  addSkill(root, "alpha", { body: "Load the `beta` skill first, then run `/beta`.\n" });
  addSkill(root, "beta", { description: "Beta. Depends on the alpha skill." });
  write(root, "workflows/flow/flow.js", `const VERSION = "1.0.0";\n`);
  write(root, "workflows/flow/README.md", `# flow\n\n${README_BODY.replace("## Usage", "## Run")}`);
  write(
    root,
    "README.md",
    "# Repo\n\n## Skills\n\n| Skill |\n|---|\n| [alpha](skills/alpha) |\n| [beta](skills/beta) |\n\n## Workflows\n\n| [flow](workflows/flow) |\n",
  );
  return root;
}

function lint(root: string, args: string[] = [], env: Record<string, string> = {}) {
  return run(["--root", root, ...args], root, { ...process.env, ...env });
}

function codes(stdout: string): string[] {
  return [...stdout.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]);
}

describe("parsing", () => {
  test("frontmatter reads quoted single-line values", () => {
    const fm = parseFrontmatter(`---\nname: "x"\ndescription: 'Does x.'\n---\n`);
    expect(fm.ok).toBe(true);
    expect(fm.fields.name).toEqual({ value: "x", line: 2 });
    expect(fm.fields.description.value).toBe("Does x.");
  });

  test("unclosed frontmatter is not ok", () => {
    expect(parseFrontmatter("---\nname: x\n").ok).toBe(false);
    expect(parseFrontmatter("# x\n").ok).toBe(false);
  });

  test("stripFences blanks fenced lines and keeps line numbers", () => {
    const lines = stripFences("a\n```bash\n/foo\n```\nb\n~~~\n`x` skill\n~~~\n");
    expect(lines).toEqual(["a", "", "", "", "b", "", "", "", ""]);
  });

  test("a line of inline code with backticks is not a fence", () => {
    expect(stripFences("  ```` `` `x` skill `` ````\nb\n")).toEqual(["  ```` `` `x` skill `` ````", "b", ""]);
  });
});

describe("clean repo", () => {
  test("exits 0 with no findings", () => {
    const r = lint(cleanRepo());
    expect(r.stdout).toBe("0 errors, 0 warnings\n");
    expect(r.code).toBe(0);
  });
});

describe("usage", () => {
  test("no skills/ folder exits 2", () => {
    const r = lint(tempDir());
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("not a skills repo");
  });

  test("unknown argument exits 2", () => {
    expect(run(["--nope"]).code).toBe(2);
  });
});

describe("skill checks", () => {
  test("name-mismatch", () => {
    const root = cleanRepo();
    write(root, "skills/alpha/SKILL.md", "---\nname: alfa\ndescription: x\n---\n\n# A v1.0.0\n");
    const r = lint(root);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("skills/alpha/SKILL.md:2  [name-mismatch]");
  });

  test("name-rules", () => {
    const root = cleanRepo();
    addSkill(root, "claude-helper");
    write(root, "README.md", `## Skills\n\n[a](skills/alpha) [b](skills/beta) [c](skills/claude-helper)\n\n## Workflows\n\n[f](workflows/flow)\n`);
    const r = lint(root);
    expect(r.stdout).toContain("skills/claude-helper/SKILL.md:2  [name-rules]");
    expect(codes(r.stdout)).toEqual(["name-rules"]);
  });

  test("frontmatter", () => {
    const root = cleanRepo();
    write(root, "skills/alpha/SKILL.md", "# Alpha v1.0.0\n");
    write(root, "skills/beta/SKILL.md", "---\nname: beta\n---\n\n# Beta v1.0.0\n");
    const r = lint(root);
    expect(r.stdout).toContain("skills/alpha/SKILL.md:1  [frontmatter]  no frontmatter");
    expect(r.stdout).toContain("skills/beta/SKILL.md:1  [frontmatter]  frontmatter has no description");
  });

  test("skill-readme", () => {
    const root = cleanRepo();
    rmSync(join(root, "skills/beta/README.md"));
    expect(lint(root).stdout).toContain("[skill-readme]  no README.md in skills/beta");
  });

  test("skill-version", () => {
    const root = cleanRepo();
    write(root, "skills/beta/SKILL.md", "---\nname: beta\ndescription: x\n---\n\n# Beta\n");
    expect(lint(root).stdout).toContain("skills/beta/SKILL.md:6  [skill-version]");
  });

  test("skill-row", () => {
    const root = cleanRepo();
    write(root, "README.md", "## Skills\n\n[alpha](skills/alpha)\n\n## Workflows\n\n[flow](workflows/flow)\n");
    expect(lint(root).stdout).toContain("README.md:1  [skill-row]  Skills table has no row linking skills/beta");
  });
});

describe("workflow checks", () => {
  test("workflow-files", () => {
    const root = cleanRepo();
    rmSync(join(root, "workflows/flow/flow.js"));
    expect(lint(root).stdout).toContain("workflows/flow  [workflow-files]  no flow.js");
  });

  test("workflow-version", () => {
    const root = cleanRepo();
    write(root, "workflows/flow/flow.js", "export default 1;\n");
    expect(lint(root).stdout).toContain("workflows/flow/flow.js:1  [workflow-version]");
  });

  test("workflow-row", () => {
    const root = cleanRepo();
    write(root, "README.md", "## Skills\n\n[a](skills/alpha) [b](skills/beta)\n\n## Workflows\n\nnone\n");
    expect(lint(root).stdout).toContain("[workflow-row]  Workflows table has no row linking workflows/flow");
  });
});

describe("reference checks", () => {
  test("unknown `name` skill, also across a line break", () => {
    const root = cleanRepo();
    addSkill(root, "alpha", { body: "Use the `betta` skill.\nOr the `gamma`\nskill.\n" });
    const r = lint(root);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("skills/alpha/SKILL.md:8  [unknown-skill]  `betta` skill");
    expect(r.stdout).toContain("skills/alpha/SKILL.md:9  [unknown-skill]  `gamma` skill");
  });

  test("unknown hyphenated name in a description", () => {
    const root = cleanRepo();
    addSkill(root, "beta", { description: "Depends on the alpha-one skill, a built-in skill and this skill." });
    const r = lint(root);
    expect(r.stdout).toContain('skills/beta/SKILL.md:3  [unknown-skill]  "alpha-one skill"');
    expect(codes(r.stdout)).toEqual(["unknown-skill"]);
  });

  test("broken-link into skills/", () => {
    const root = cleanRepo();
    write(root, "skills/beta/README.md", `# beta\n\nSee [gone](../gone) and [ok](../alpha).\n\n${README_BODY}`);
    const r = lint(root);
    expect(r.stdout).toContain("skills/beta/README.md:3  [broken-link]  link target ../gone does not exist");
    expect(codes(r.stdout)).toEqual(["broken-link"]);
  });

  test("unknown-command is a warning", () => {
    const root = cleanRepo();
    addSkill(root, "alpha", { body: "Run /alpah, then /doctor, /flow and `/beta`." });
    const r = lint(root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("skills/alpha/SKILL.md:8  [unknown-command]  /alpah");
    expect(codes(r.stdout)).toEqual(["unknown-command"]);
  });

  test("never matched: fences, placeholders, plugin forms, paths, inline-code links", () => {
    const root = cleanRepo();
    const body = [
      "```",
      "Use the `nope` skill and /nope.",
      "```",
      "Name it `/<skill-name>` or the `<name>` skill, or the `plugin:skill` skill.",
      "Paths: /mnt/c, /dev/null, `/abs/repo`, ~/.claude and /etc.d stay quiet.",
      "Badges look like `[![alt](src)](href)`.",
      "Quoted patterns: `` `nope` skill `` and `` /nope ``.",
      "  ```` `` `nope` skill `` ````",
      "After that line, the `nope` skill is checked again.",
    ].join("\n");
    addSkill(root, "alpha", { body });
    expect(codes(lint(root).stdout)).toEqual(["unknown-skill"]);
    expect(lint(root).stdout).toContain("skills/alpha/SKILL.md:16  [unknown-skill]  `nope` skill");
  });
});

describe("readme-sections", () => {
  test("missing and out-of-order sections warn", () => {
    const root = cleanRepo();
    write(root, "skills/beta/README.md", "# beta\n\n## Install\n\n## What it is\n\n## What it is not\n\n## When not to use\n");
    const r = lint(root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('skills/beta/README.md:3  [readme-sections]  "## Install" comes before "## When not to use"');
    expect(r.stdout).toContain('skills/beta/README.md:1  [readme-sections]  no "## Usage" section');
  });

  test("other sections may sit between", () => {
    const root = cleanRepo();
    write(root, "skills/beta/README.md", `# beta\n\n${README_BODY.replace("## Install", "## Install\n\n## Configuration")}\n## License\n`);
    expect(lint(root).stdout).toBe("0 errors, 0 warnings\n");
  });
});

describe("--home", () => {
  function home(root: string): string {
    const h = tempDir("ls-home-");
    symlinkSync(join(root, "skills/alpha"), join(h, "alpha"));
    symlinkSync(join(root, "skills/gone"), join(h, "gone"));
    mkdirSync(join(h, ".trash"));
    mkdirSync(join(h, "synced"));
    mkdirSync(join(h, "other-skill"));
    return h;
  }

  test("is off by default", () => {
    expect(lint(cleanRepo()).stdout).not.toContain("symlink");
  });

  test("broken links error, unlinked skills warn, home names count as known", () => {
    const root = cleanRepo();
    addSkill(root, "alpha", { body: "Use the `other-skill` skill." });
    const h = home(root);
    const r = lint(root, ["--home"], { LINT_SKILLS_HOME: h });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain(`${h}/gone  [broken-symlink]  link does not resolve`);
    expect(r.stdout).toContain(`${h}/beta  [unlinked-skill]  skills/beta is not installed`);
    expect(codes(r.stdout)).toEqual(["broken-symlink", "unlinked-skill"]);
    expect(lint(root).stdout).toContain("[unknown-skill]  `other-skill` skill");
  });
});

describe("output", () => {
  test("errors come first, then warnings, then the summary", () => {
    const root = cleanRepo();
    addSkill(root, "alpha", { body: "Run /zzz and use the `zzz` skill." });
    const lines = lint(root).stdout.trim().split("\n");
    expect(lines).toEqual([
      "skills/alpha/SKILL.md:8  [unknown-skill]  `zzz` skill is not a known skill",
      "skills/alpha/SKILL.md:8  [unknown-command]  /zzz is not a known skill or built-in command",
      "1 error, 1 warning",
    ]);
  });
});

describe("this repo", () => {
  test("has no errors", () => {
    const r = run(["--root", join(import.meta.dir, "..", "..", "..")]);
    expect(r.stdout).toMatch(/^0 errors, \d+ warnings?\n$/m);
    expect(r.code).toBe(0);
  });
});
