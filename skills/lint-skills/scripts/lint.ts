#!/usr/bin/env bun
// lint-skills: lint a skills repo's names, cross-references and layout.
// Run with Bun directly; no build step and no dependencies.
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export type Severity = "error" | "warn";

export interface Finding {
  file: string;
  line: number; // 0 when the finding has no line, such as a symlink
  code: string;
  severity: Severity;
  message: string;
}

export interface Skill {
  folder: string;
  skillMd: string; // repo-relative path
  hasFrontmatter: boolean;
  name?: string;
  nameLine: number;
  description?: string;
  descLine: number;
}

export interface Repo {
  root: string;
  skills: Skill[];
  workflows: string[];
}

// Claude Code commands and bundled skills, which no repo folder defines.
export const BUILT_INS = [
  "branch", "claude-api", "clear", "code-review", "compact", "config",
  "context", "cost", "debug", "doctor", "exit", "fast", "fork", "help",
  "hooks", "init", "login", "logout", "loop", "mcp", "memory", "model",
  "permissions", "plugin", "resume", "review", "schedule", "security-review",
  "simplify", "skill-doctor", "skills", "status", "workflows",
];

// Third-party skills this repo refers to but does not ship.
export const EXTERNAL_SKILLS = ["agent-browser"];

// Hyphenated words that read like a name before "skill" but are not one.
const NOT_NAMES = new Set([
  "built-in", "third-party", "opt-in", "read-only", "one-off", "multi-agent",
  "per-skill", "per-project",
]);

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const VERSION_RE = /\sv\d+\.\d+\.\d+\s*$/;

export const README_SECTIONS = ["What it is", "What it is not", "When not to use", "Install"];

// ---------------------------------------------------------------- parsing

export interface Frontmatter {
  ok: boolean;
  fields: Record<string, { value: string; line: number }>;
}

/** Read `key: value` lines between the opening and closing `---`. */
export function parseFrontmatter(text: string): Frontmatter {
  const lines = text.split("\n");
  const fields: Frontmatter["fields"] = {};
  if (lines[0]?.trim() !== "---") return { ok: false, fields };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") return { ok: true, fields };
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    fields[m[1]] = { value, line: i + 1 };
  }
  return { ok: false, fields: {} };
}

/** Blank out fenced code blocks, keeping line numbers. */
export function stripFences(text: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    // A backtick fence's info string has no backticks, so ```` `x` ```` is code.
    const m = /^\s*(`{3,}(?!.*`)|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      out.push("");
    } else if (m) {
      fence = m[1];
      out.push("");
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Blank out ``double-backtick`` code spans, which quote patterns literally. */
export function blankQuotedCode(line: string): string {
  return line.replace(/(`{2,})(?!`).*?\1/g, (s) => " ".repeat(s.length));
}

function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function read(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function subdirs(path: string): string[] {
  if (!isDir(path)) return [];
  return readdirSync(path)
    .filter((n) => !n.startsWith(".") && isDir(join(path, n)))
    .sort();
}

// -------------------------------------------------------------- discovery

export function discover(root: string): Repo {
  const skills: Skill[] = [];
  for (const folder of subdirs(join(root, "skills"))) {
    const skillMd = join("skills", folder, "SKILL.md");
    if (!existsSync(join(root, skillMd))) continue;
    const fm = parseFrontmatter(read(join(root, skillMd)));
    skills.push({
      folder,
      skillMd,
      hasFrontmatter: fm.ok,
      name: fm.fields.name?.value,
      nameLine: fm.fields.name?.line ?? 1,
      description: fm.fields.description?.value,
      descLine: fm.fields.description?.line ?? 1,
    });
  }
  const workflows = subdirs(join(root, "workflows"));
  return { root, skills, workflows };
}

/** Markdown files whose references are checked. */
export function scannedFiles(repo: Repo): string[] {
  const files: string[] = [];
  const add = (p: string) => existsSync(join(repo.root, p)) && files.push(p);
  for (const folder of subdirs(join(repo.root, "skills"))) {
    add(join("skills", folder, "SKILL.md"));
    add(join("skills", folder, "README.md"));
    files.push(...markdownUnder(repo.root, join("skills", folder, "references")));
  }
  for (const w of repo.workflows) add(join("workflows", w, "README.md"));
  add(join("claude", "CLAUDE.md"));
  add("README.md");
  add("CLAUDE.md");
  return files;
}

function markdownUnder(root: string, dir: string): string[] {
  if (!isDir(join(root, dir))) return [];
  const out: string[] = [];
  for (const n of readdirSync(join(root, dir)).sort()) {
    const p = join(dir, n);
    if (isDir(join(root, p))) out.push(...markdownUnder(root, p));
    else if (n.endsWith(".md")) out.push(p);
  }
  return out;
}

export function knownNames(repo: Repo, home: string[] = []): Set<string> {
  const names = new Set<string>([...BUILT_INS, ...EXTERNAL_SKILLS, ...home]);
  for (const s of repo.skills) {
    names.add(s.folder);
    if (s.name) names.add(s.name);
  }
  return names;
}

// ----------------------------------------------------------------- checks

const err = (file: string, line: number, code: string, message: string): Finding => ({
  file, line, code, severity: "error", message,
});
const warn = (file: string, line: number, code: string, message: string): Finding => ({
  file, line, code, severity: "warn", message,
});

/** Lines of the root README section under `## <title>`, with line numbers. */
function readmeSection(root: string, title: string): { start: number; body: string } | null {
  const path = join(root, "README.md");
  if (!existsSync(path)) return null;
  const lines = read(path).split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { start: start + 1, body: lines.slice(start, end).join("\n") };
}

function linksTo(body: string, path: string): boolean {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\]\\((\\./)?${esc}/?\\)`).test(body);
}

export function checkSkills(repo: Repo): Finding[] {
  const out: Finding[] = [];
  const table = readmeSection(repo.root, "Skills");
  for (const s of repo.skills) {
    if (!s.hasFrontmatter) {
      out.push(err(s.skillMd, 1, "frontmatter", "no frontmatter between --- lines"));
    } else {
      if (!s.name) out.push(err(s.skillMd, 1, "frontmatter", "frontmatter has no name"));
      if (!s.description) out.push(err(s.skillMd, 1, "frontmatter", "frontmatter has no description"));
    }
    if (s.name && s.name !== s.folder) {
      out.push(err(s.skillMd, s.nameLine, "name-mismatch", `name "${s.name}" does not match folder "${s.folder}"`));
    }
    const name = s.name ?? s.folder;
    const problems: string[] = [];
    if (!/^[a-z0-9-]+$/.test(name)) problems.push("uses characters other than a-z, 0-9 and -");
    if (name.length > 64) problems.push("is longer than 64 characters");
    if (/claude|anthropic/.test(name)) problems.push('contains "claude" or "anthropic"');
    for (const p of problems) out.push(err(s.skillMd, s.nameLine, "name-rules", `name "${name}" ${p}`));

    if (!existsSync(join(repo.root, "skills", s.folder, "README.md"))) {
      out.push(err(s.skillMd, 1, "skill-readme", `no README.md in skills/${s.folder}`));
    }

    const lines = stripFences(read(join(repo.root, s.skillMd)));
    const h1 = lines.findIndex((l) => /^# /.test(l));
    if (h1 < 0) out.push(err(s.skillMd, 1, "skill-version", "no H1 title"));
    else if (!VERSION_RE.test(lines[h1])) {
      out.push(err(s.skillMd, h1 + 1, "skill-version", "H1 does not end in vX.Y.Z"));
    }

    if (!table) {
      out.push(err("README.md", 1, "skill-row", `no "## Skills" section to list ${s.folder}`));
    } else if (!linksTo(table.body, `skills/${s.folder}`)) {
      out.push(err("README.md", table.start, "skill-row", `Skills table has no row linking skills/${s.folder}`));
    }
  }
  return out;
}

export function checkWorkflows(repo: Repo): Finding[] {
  const out: Finding[] = [];
  const table = readmeSection(repo.root, "Workflows");
  for (const w of repo.workflows) {
    const js = join("workflows", w, `${w}.js`);
    if (!existsSync(join(repo.root, js))) {
      out.push(err(join("workflows", w), 0, "workflow-files", `no ${w}.js`));
    } else if (!/\bconst\s+VERSION\s*=/.test(read(join(repo.root, js)))) {
      out.push(err(js, 1, "workflow-version", "no VERSION constant"));
    }
    if (!existsSync(join(repo.root, "workflows", w, "README.md"))) {
      out.push(err(join("workflows", w), 0, "workflow-files", "no README.md"));
    }
    if (!table) {
      out.push(err("README.md", 1, "workflow-row", `no "## Workflows" section to list ${w}`));
    } else if (!linksTo(table.body, `workflows/${w}`)) {
      out.push(err("README.md", table.start, "workflow-row", `Workflows table has no row linking workflows/${w}`));
    }
  }
  return out;
}

export function checkReferences(repo: Repo, known: Set<string>): Finding[] {
  const out: Finding[] = [];
  const commands = new Set([...known, ...repo.workflows]);
  for (const file of scannedFiles(repo)) {
    const lines = stripFences(read(join(repo.root, file))).map(blankQuotedCode);
    const text = lines.join("\n");

    // `name` skill, also when the line breaks between the two.
    for (const m of text.matchAll(/`([^`\n]+)`\s+skill\b/g)) {
      const name = m[1];
      if (!NAME_RE.test(name) || known.has(name)) continue;
      out.push(err(file, lineAt(text, m.index!), "unknown-skill", `\`${name}\` skill is not a known skill`));
    }

    // Markdown links into skills/ or workflows/, outside inline code.
    const prose = text.replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length));
    for (const m of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || target.includes("://") || target.startsWith("/") || target.startsWith("mailto:")) continue;
      const rel = relative(repo.root, resolve(repo.root, dirname(file), target));
      if (!/^(skills|workflows)(\/|$)/.test(rel.split(sep).join("/"))) continue;
      if (!existsSync(join(repo.root, rel))) {
        out.push(err(file, lineAt(prose, m.index!), "broken-link", `link target ${m[1]} does not exist`));
      }
    }

    // /name at a line start or after a space, ( or backtick; not a path.
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/(?:^|[\s(`])\/([a-z][a-z0-9-]*)(?![a-z0-9_/:-]|\.\w)/g)) {
        if (commands.has(m[1])) continue;
        out.push(warn(file, i + 1, "unknown-command", `/${m[1]} is not a known skill or built-in command`));
      }
    });
  }

  // Hyphenated names in descriptions, such as "the auto-commit skill".
  for (const s of repo.skills) {
    if (!s.description) continue;
    for (const m of s.description.matchAll(/(?<![`\w-])([a-z0-9]+(?:-[a-z0-9]+)+)\s+skill\b/g)) {
      if (NOT_NAMES.has(m[1]) || known.has(m[1])) continue;
      out.push(err(s.skillMd, s.descLine, "unknown-skill", `"${m[1]} skill" in the description is not a known skill`));
    }
  }
  return out;
}

export function checkReadmeSections(repo: Repo): Finding[] {
  const out: Finding[] = [];
  const readmes = [
    ...repo.skills.map((s) => ({ file: join("skills", s.folder, "README.md"), last: "Usage" })),
    ...repo.workflows.map((w) => ({ file: join("workflows", w, "README.md"), last: "Run" })),
  ];
  for (const { file, last } of readmes) {
    if (!existsSync(join(repo.root, file))) continue;
    const lines = stripFences(read(join(repo.root, file)));
    let prev: { title: string; line: number } | null = null;
    for (const title of [...README_SECTIONS, last]) {
      const idx = lines.findIndex((l) => l.trim() === `## ${title}`);
      if (idx < 0) {
        out.push(warn(file, 1, "readme-sections", `no "## ${title}" section`));
        continue;
      }
      if (prev && idx < prev.line) {
        out.push(warn(file, idx + 1, "readme-sections", `"## ${title}" comes before "## ${prev.title}"`));
      }
      prev = { title, line: idx };
    }
  }
  return out;
}

export interface HomeDir {
  path: string;
  display: string;
}

export function homeEntries(home: HomeDir): string[] {
  if (!isDir(home.path)) return [];
  return readdirSync(home.path).filter((n) => !n.startsWith("."));
}

export function checkHome(repo: Repo, home: HomeDir): Finding[] {
  const out: Finding[] = [];
  const entries = homeEntries(home);
  for (const n of entries) {
    const p = join(home.path, n);
    if (!lstatSync(p).isSymbolicLink()) continue;
    if (!existsSync(p)) out.push(err(join(home.display, n), 0, "broken-symlink", "link does not resolve"));
  }
  const have = new Set(entries);
  for (const s of repo.skills) {
    if (!have.has(s.folder)) {
      out.push(warn(join(home.display, s.folder), 0, "unlinked-skill", `skills/${s.folder} is not installed`));
    }
  }
  return out;
}

// -------------------------------------------------------------------- run

export interface Options {
  root: string;
  home?: HomeDir;
}

export function lint(opts: Options): Finding[] {
  const repo = discover(opts.root);
  const home = opts.home ? homeEntries(opts.home) : [];
  const findings = [
    ...checkSkills(repo),
    ...checkWorkflows(repo),
    ...checkReferences(repo, knownNames(repo, home)),
    ...checkReadmeSections(repo),
    ...(opts.home ? checkHome(repo, opts.home) : []),
  ];
  return findings.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line,
  );
}

export function format(f: Finding): string {
  const where = f.line > 0 ? `${f.file}:${f.line}` : f.file;
  return `${where}  [${f.code}]  ${f.message}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const USAGE = "usage: bun lint.ts [--home] [--root <path>]";

function gitTop(cwd: string): string | null {
  try {
    const p = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd, stdout: "pipe", stderr: "pipe" });
    return p.exitCode === 0 ? p.stdout.toString().trim() : null;
  } catch {
    return null;
  }
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(argv: string[], cwd = process.cwd(), env = process.env): RunResult {
  let root: string | undefined;
  let withHome = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--home") withHome = true;
    else if (a === "--root" && argv[i + 1]) root = resolve(cwd, argv[++i]);
    else if (a === "-h" || a === "--help") return { code: 0, stdout: `${USAGE}\n`, stderr: "" };
    else return { code: 2, stdout: "", stderr: `unknown argument: ${a}\n${USAGE}\n` };
  }
  root ??= gitTop(cwd) ?? cwd;
  if (!isDir(join(root, "skills"))) {
    return { code: 2, stdout: "", stderr: `not a skills repo: no skills/ folder in ${root}\n` };
  }

  const override = env.LINT_SKILLS_HOME;
  const home = withHome
    ? override
      ? { path: resolve(cwd, override), display: override }
      : { path: join(homedir(), ".claude", "skills"), display: "~/.claude/skills" }
    : undefined;

  const findings = lint({ root, home });
  const errors = findings.filter((f) => f.severity === "error").length;
  const lines = findings.map(format);
  lines.push(`${plural(errors, "error")}, ${plural(findings.length - errors, "warning")}`);
  return { code: errors > 0 ? 1 : 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exit(r.code);
}
