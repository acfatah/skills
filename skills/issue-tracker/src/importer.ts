import { existsSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Backend } from "./backend.ts";
import { CliError, UsageError, ValidationError } from "./errors.ts";
import { type DbName, formatId } from "./ids.ts";
import { DATE_RE } from "./model.ts";
import { type Dump, loadStmts, seqStmts } from "./rows.ts";
import { STATUSES } from "./schema.ts";
import type { Row, Store } from "./store/types.ts";

export const V1_FOLDERS = ["triage", "open", "in-progress", "blocked", "closed", "security"] as const;

// --- Parsing the v1 Markdown files. ---

// The v1 frontmatter shape only: `key: value` scalars and `[a, b]` lists.
export function parseFrontmatter(text: string): { fields: Record<string, string | string[] | null>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) throw new ValidationError("no frontmatter");
  const fields: Record<string, string | string[] | null> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (/^\[.*\]$/.test(value)) {
      fields[kv[1]!] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    value = value.replace(/^["'](.*)["']$/, "$1");
    fields[kv[1]!] = value === "" || value === "~" || value === "null" ? null : value;
  }
  return { fields, body: text.slice(m[0].length) };
}

interface Section {
  start: number;
  end: number;
}

function findSection(lines: string[], heading: string): Section | null {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end]!)) end++;
  return { start, end };
}

function cut(lines: string[], s: Section): string[] {
  const out = [...lines.slice(0, s.start), ...lines.slice(s.end)];
  // Drop the blank lines the cut leaves behind.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").split("\n");
}

const NOTE_RE = /^- (\d{4}-\d{2}-\d{2}): (.*)$/;

// Splits the body: drops the hand-kept `## Sub-issues` mirror, and moves
// `## Notes` into rows when every item is a dated note. Indented lines
// continue the note above them.
export function splitBody(body: string): { body: string; notes: { date: string; text: string }[] } {
  let lines = body.split(/\r?\n/);
  const sub = findSection(lines, "## Sub-issues");
  if (sub) lines = cut(lines, sub);
  const notes: { date: string; text: string }[] = [];
  const sec = findSection(lines, "## Notes");
  if (sec) {
    const items = lines.slice(sec.start + 1, sec.end);
    let clean = true;
    for (const line of items) {
      const m = NOTE_RE.exec(line);
      if (m) notes.push({ date: m[1]!, text: m[2]!.trim() });
      else if (/^\s{2,}\S/.test(line) && notes.length) notes[notes.length - 1]!.text += `\n${line.trim()}`;
      else if (line.trim()) clean = false;
    }
    if (clean && notes.length) lines = cut(lines, sec);
    else notes.length = 0;
  }
  return { body: `${lines.join("\n").trim()}\n`.replace(/^\n$/, ""), notes };
}

export interface V1Milestone {
  name: string;
  goal: string | null;
  due: string | null;
  state: "open" | "closed";
  github: string | null;
}

export function parseMilestones(text: string): V1Milestone[] {
  const out: V1Milestone[] = [];
  let cur: V1Milestone | null = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      cur = { name: h[1]!.trim(), goal: null, due: null, state: "open", github: null };
      out.push(cur);
      continue;
    }
    const f = /^- \*\*(Goal|Due|State|GitHub):\*\*\s*(.*)$/.exec(line);
    if (!cur || !f) continue;
    const value = f[2]!.trim();
    const real = value && !/^<.*>$/.test(value) ? value : null;
    if (f[1] === "Goal") cur.goal = real;
    if (f[1] === "Due") cur.due = real;
    if (f[1] === "GitHub") cur.github = real;
    if (f[1] === "State") cur.state = value === "closed" ? "closed" : "open";
  }
  return out;
}

export interface V1Issue {
  file: string;
  folder: string;
  db: DbName;
  row: Row;
  labels: string[];
  notes: { date: string; text: string }[];
}

export interface V1Tree {
  path: string;
  issues: V1Issue[];
  milestones: V1Milestone[];
  counts: Record<string, number>;
  problems: string[];
  warnings: string[];
}

const str = (v: string | string[] | null | undefined): string | null => (typeof v === "string" ? v : null);

export function readV1(path: string): V1Tree {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new UsageError(`No v1 issues folder at ${path}.`);
  }
  const tree: V1Tree = { path, issues: [], milestones: [], counts: {}, problems: [], warnings: [] };
  for (const folder of V1_FOLDERS) {
    const dir = join(path, folder);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    tree.counts[folder] = files.length;
    for (const file of files) {
      const rel = `${folder}/${file}`;
      try {
        const { fields, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
        const idText = str(fields.id) ?? /^(\d+)-/.exec(file)?.[1] ?? null;
        if (!idText || !/^\d+$/.test(idText)) throw new ValidationError("no numeric id");
        const status = folder === "security" ? (str(fields.status) ?? "triage") : folder;
        if (!(STATUSES as readonly string[]).includes(status)) throw new ValidationError(`unknown status "${status}"`);
        const split = splitBody(body);
        const db: DbName = folder === "security" ? "security" : "issues";
        const today = str(fields.created) ?? "1970-01-01";
        const row: Row = {
          id: Number(idText),
          client_id: null,
          title: str(fields.title),
          type: db === "security" ? "security" : str(fields.type),
          status,
          priority: str(fields.priority),
          milestone: str(fields.milestone),
          parent: str(fields.parent) ? Number(str(fields.parent)) : null,
          github: str(fields.github),
          resolution: str(fields.resolution),
          created: today,
          updated: str(fields.updated) ?? today,
          closed: str(fields.closed),
          body: split.body,
        };
        if (!row.title) throw new ValidationError("no title");
        if (row.type === null && status !== "triage") throw new ValidationError(`no type while ${status}`);
        if (status === "closed" && !row.resolution) throw new ValidationError("closed without a resolution");
        if (status !== "closed" && row.resolution) {
          tree.warnings.push(`${rel}: resolution ${row.resolution} dropped, since it is ${status}`);
          row.resolution = null;
        }
        if (status === "closed" && !row.closed) row.closed = row.updated;
        if (status !== "closed") row.closed = null;
        for (const f of ["created", "updated", "closed"] as const) {
          if (row[f] !== null && !DATE_RE.test(String(row[f]))) throw new ValidationError(`${f} is not YYYY-MM-DD`);
        }
        if (db === "security" && row.milestone) {
          split.notes.push({ date: String(row.updated), text: `v1 milestone: ${row.milestone}` });
          tree.warnings.push(`${rel}: security issues take no milestone; kept as a note`);
          row.milestone = null;
        }
        const labels = Array.isArray(fields.labels) ? fields.labels : [];
        tree.issues.push({ file: rel, folder, db, row, labels, notes: split.notes });
      } catch (err) {
        tree.problems.push(`${rel}: ${(err as Error).message}`);
      }
    }
  }
  const ms = join(path, "MILESTONES.md");
  if (existsSync(ms)) tree.milestones = parseMilestones(readFileSync(ms, "utf8"));

  // Cross-file checks: duplicate ids, parents, unknown milestones.
  const seen = new Map<string, string>();
  for (const i of tree.issues) {
    const key = `${i.db}:${i.row.id}`;
    if (seen.has(key)) tree.problems.push(`${i.file}: id ${i.row.id} also used by ${seen.get(key)}`);
    seen.set(key, i.file);
  }
  for (const i of tree.issues) {
    const p = i.row.parent as number | null;
    if (p !== null && !seen.has(`${i.db}:${p}`)) {
      i.notes.push({ date: String(i.row.updated), text: `v1 parent: ${formatId(i.db, p)}` });
      tree.warnings.push(`${i.file}: parent ${p} not found in the same database; kept as a note`);
      i.row.parent = null;
    }
    const m = i.row.milestone as string | null;
    if (m && !tree.milestones.some((x) => x.name === m)) {
      tree.milestones.push({ name: m, goal: null, due: null, state: "open", github: null });
      tree.warnings.push(`${i.file}: milestone ${m} is not in MILESTONES.md; created it`);
    }
  }
  return tree;
}

export function toDumps(tree: V1Tree): Record<DbName, Dump> {
  const make = (db: DbName): Dump => {
    const issues = tree.issues.filter((i) => i.db === db);
    return {
      milestones: db === "issues" ? tree.milestones.map((m) => ({ ...m })) : [],
      issues: issues.map((i) => i.row),
      labels: issues.flatMap((i) => i.labels.map((label) => ({ issue_id: i.row.id, label }))),
      notes: issues.flatMap((i) => i.notes.map((n) => ({ id: null, client_id: null, issue_id: i.row.id, ...n }))),
      seq: [],
    };
  };
  return { issues: make("issues"), security: make("security") };
}

// --- Writing into the current project. ---

export async function conflicts(store: Store, d: Dump): Promise<string[]> {
  const out: string[] = [];
  const ids = new Set((await store.query<{ id: number }>("SELECT id FROM issues")).map((r) => r.id));
  for (const i of d.issues) if (ids.has(i.id as number)) out.push(`id ${i.id}`);
  const names = new Set((await store.query<{ name: string }>("SELECT name FROM milestones")).map((r) => r.name));
  for (const m of d.milestones) if (names.has(m.name as string)) out.push(`milestone ${m.name}`);
  return out;
}

// Writes each database in one transaction, after refusing any id or
// milestone that already exists there.
export async function writeDumps(b: Backend, dumps: Record<DbName, Dump>): Promise<void> {
  for (const db of ["issues", "security"] as DbName[]) {
    const d = dumps[db];
    if (d.issues.length + d.milestones.length === 0) continue;
    await b.run(
      db,
      async (s) => {
        const clash = await conflicts(s, d);
        if (clash.length) {
          throw new ValidationError(
            `The ${db} database already has ${clash.slice(0, 5).join(", ")}${clash.length > 5 ? ", …" : ""}. Import only into an empty project.`,
          );
        }
        await s.batch([...loadStmts(d), ...seqStmts(d)]);
      },
      { write: true },
    );
  }
}

export interface CountLine {
  folder: string;
  files: number;
  rows: number;
}

// Rows in the databases for each v1 folder, matched by id and status.
export async function countRows(b: Backend, tree: V1Tree): Promise<CountLine[]> {
  const rows: Record<DbName, Map<number, string>> = { issues: new Map(), security: new Map() };
  for (const db of ["issues", "security"] as DbName[]) {
    const found = await b.run(db, (s) => s.query<{ id: number; status: string }>("SELECT id, status FROM issues"));
    for (const r of found) rows[db].set(r.id, r.status);
  }
  return Object.entries(tree.counts).map(([folder, files]) => ({
    folder,
    files,
    rows: tree.issues.filter((i) => i.folder === folder && rows[i.db].get(i.row.id as number) === i.row.status)
      .length,
  }));
}

export function deleteV1(tree: V1Tree): void {
  for (const folder of V1_FOLDERS) rmSync(join(tree.path, folder), { recursive: true, force: true });
  rmSync(join(tree.path, "MILESTONES.md"), { force: true });
  try {
    rmdirSync(tree.path);
  } catch {
    // Not empty: other files stay, such as v2 files in a declared folder.
  }
}

export function assertClean(tree: V1Tree): void {
  if (tree.problems.length) {
    throw new CliError(
      `Fix these v1 files first; nothing was imported:\n${tree.problems.map((p) => `  ${p}`).join("\n")}`,
    );
  }
}
