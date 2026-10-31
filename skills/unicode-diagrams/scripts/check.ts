#!/usr/bin/env bun
// unicode-diagrams check: flag unsafe glyphs, wide lines and broken box edges.
// Run with Bun directly; no build step and no dependencies.
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

export type Severity = "error" | "warn";
export type Tier = "ascii" | "tier1" | "tier2";
export type Connects = "up" | "down" | "both";

export const TIERS: Tier[] = ["ascii", "tier1", "tier2"];

export interface Finding {
  file: string;
  line: number;
  code: string;
  severity: Severity;
  message: string;
}

export interface Glyph {
  glyph: string;
  cp: string;
  name: string;
  connects?: Connects;
  tier1?: string; // replacement in Tier 1, for a Tier 2 glyph
  ascii?: string; // replacement in ASCII
}

export interface DenyEntry {
  glyph: string;
  cp: string;
  name: string;
  use: Partial<Record<Tier, string>>;
}

export interface GlyphData {
  tiers: {
    ascii: { range: { from: string; to: string }; connects: Record<string, Connects> };
    tier1: { glyphs: Glyph[] };
    tier2: { glyphs: Glyph[] };
  };
  deny: DenyEntry[];
}

export interface Known {
  tier: Tier;
  glyph?: Glyph;
  connects?: Connects;
}

export interface Table {
  known: Map<string, Known>;
  deny: Map<string, DenyEntry>;
}

export const GLYPHS_PATH = join(import.meta.dir, "..", "references", "glyphs.json");

// Vertical lines whose neighbors above and below are checked.
export const VERTICALS = new Set(["│", "┃", "║", "┆", "┇", "┊", "┋"]);

// ---------------------------------------------------------------- glyphs

export function loadGlyphs(path = GLYPHS_PATH): GlyphData {
  return JSON.parse(readFileSync(path, "utf8")) as GlyphData;
}

const codePoint = (cp: string): number => parseInt(cp.replace(/^U\+/, ""), 16);

/** Map every allowed character to its tier, and every denied one to its entry. */
export function buildTable(data: GlyphData): Table {
  const known = new Map<string, Known>();
  const { from, to } = data.tiers.ascii.range;
  for (let c = codePoint(from); c <= codePoint(to); c++) {
    const ch = String.fromCodePoint(c);
    known.set(ch, { tier: "ascii", connects: data.tiers.ascii.connects[ch] });
  }
  for (const tier of ["tier1", "tier2"] as const) {
    for (const g of data.tiers[tier].glyphs) known.set(g.glyph, { tier, glyph: g, connects: g.connects });
  }
  const deny = new Map(data.deny.map((d) => [d.glyph, d]));
  return { known, deny };
}

const rank = (t: Tier): number => TIERS.indexOf(t);

export function cpOf(ch: string): string {
  return `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** The best replacement allowed at `tier`, or undefined. */
export function suggest(table: Table, ch: string, tier: Tier): string | undefined {
  const d = table.deny.get(ch);
  if (d) {
    for (const t of [...TIERS].reverse()) {
      if (rank(t) <= rank(tier) && d.use[t] !== undefined) return d.use[t];
    }
    return undefined;
  }
  const g = table.known.get(ch)?.glyph;
  if (!g) return undefined;
  if (tier === "tier1" && g.tier1) return g.tier1;
  return g.ascii;
}

function useText(s: string | undefined): string {
  if (s === undefined) return "";
  if (s === "") return "; remove it";
  if (s === "spaces") return "; use spaces";
  return `; use ${s}`;
}

/** Why `ch` is not allowed at `tier`, or null when it is. */
export function glyphProblem(table: Table, ch: string, tier: Tier): string | null {
  const k = table.known.get(ch);
  if (k && rank(k.tier) <= rank(tier)) return null;
  const hint = useText(suggest(table, ch, tier));
  const d = table.deny.get(ch);
  if (d) return `${d.cp} ${d.name} is not allowed${hint}`;
  if (k) return `${cpOf(ch)} ${k.glyph?.name ?? ch} is ${k.tier}, above --tier ${tier}${hint}`;
  return `${cpOf(ch)} ${JSON.stringify(ch)} is not in any tier`;
}

// ---------------------------------------------------------------- blocks

export interface Block {
  start: number; // 1-based line number of the first line
  lines: string[];
}

/** Fenced code blocks of a markdown file, with their line numbers. */
export function extractBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let fence: string | null = null;
  let current: Block | null = null;
  text.split("\n").forEach((line, i) => {
    // A backtick fence's info string has no backticks.
    const m = /^\s*(`{3,}(?!.*`)|~{3,})/.exec(line);
    if (fence && current) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) {
        blocks.push(current);
        fence = null;
        current = null;
      } else {
        current.lines.push(line);
      }
    } else if (m) {
      fence = m[1];
      current = { start: i + 2, lines: [] };
    }
  });
  if (current) blocks.push(current);
  return blocks;
}

/** The whole input as one diagram, without a trailing empty line. */
export function wholeBlock(text: string): Block {
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return { start: 1, lines };
}

/** A line as display cells: a wide character takes two, a zero-width one none. */
export function cells(line: string): string[] {
  const out: string[] = [];
  for (const ch of line) {
    const w = ch === "\t" ? 1 : Bun.stringWidth(ch);
    if (w === 0) continue;
    out.push(ch);
    for (let i = 1; i < w; i++) out.push("");
  }
  return out;
}

// ---------------------------------------------------------------- checks

const err = (file: string, line: number, code: string, message: string): Finding => ({
  file, line, code, severity: "error", message,
});
const warn = (file: string, line: number, code: string, message: string): Finding => ({
  file, line, code, severity: "warn", message,
});

export function checkGlyphs(file: string, block: Block, tier: Tier, table: Table): Finding[] {
  const out: Finding[] = [];
  block.lines.forEach((line, i) => {
    const seen = new Set<string>();
    for (const ch of line) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      const problem = glyphProblem(table, ch, tier);
      if (problem) out.push(err(file, block.start + i, "glyph", problem));
    }
  });
  return out;
}

export function checkWidth(file: string, block: Block, width: number): Finding[] {
  const out: Finding[] = [];
  block.lines.forEach((line, i) => {
    const w = cells(line).length;
    if (w > width) out.push(err(file, block.start + i, "width", `line is ${w} columns, over --width ${width}`));
  });
  return out;
}

const reaches = (k: Known | undefined, dir: "up" | "down"): boolean =>
  k?.connects === "both" || k?.connects === dir;

export function checkAlign(file: string, block: Block, table: Table): Finding[] {
  const out: Finding[] = [];
  const rows = block.lines.map(cells);
  rows.forEach((row, r) => {
    row.forEach((ch, c) => {
      if (!VERTICALS.has(ch)) return;
      const above = table.known.get(rows[r - 1]?.[c] ?? " ");
      const below = table.known.get(rows[r + 1]?.[c] ?? " ");
      if (reaches(above, "down") || reaches(below, "up")) return;
      out.push(
        warn(file, block.start + r, "align", `${ch} at column ${c + 1} connects to nothing above or below`),
      );
    });
  });
  return out;
}

export interface CheckOptions {
  file: string;
  tier: Tier;
  width: number;
  markdown: boolean;
  table?: Table;
}

export function check(text: string, opts: CheckOptions): Finding[] {
  const table = opts.table ?? buildTable(loadGlyphs());
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks = opts.markdown ? extractBlocks(normalized) : [wholeBlock(normalized)];
  const findings = blocks.flatMap((b) => [
    ...checkGlyphs(opts.file, b, opts.tier, table),
    ...checkWidth(opts.file, b, opts.width),
    ...checkAlign(opts.file, b, table),
  ]);
  return findings.sort(
    (a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) || a.line - b.line,
  );
}

export function format(f: Finding): string {
  return `${f.file}:${f.line}  [${f.code}]  ${f.message}`;
}

// -------------------------------------------------------------------- run

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const USAGE = "usage: bun check.ts [--tier ascii|tier1|tier2] [--width N] <file | ->";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const usage = (message: string): RunResult => ({ code: 2, stdout: "", stderr: `${message}\n${USAGE}\n` });

export function run(argv: string[], readStdin: () => string = () => readFileSync(0, "utf8")): RunResult {
  let tier: Tier = "tier2";
  let width = 80;
  let path: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") return { code: 0, stdout: `${USAGE}\n`, stderr: "" };
    if (a === "--tier") {
      const v = argv[++i];
      if (!TIERS.includes(v as Tier)) return usage(`--tier must be ascii, tier1 or tier2, not ${v ?? "nothing"}`);
      tier = v as Tier;
    } else if (a === "--width") {
      const v = Number(argv[++i]);
      if (!Number.isInteger(v) || v < 1) return usage("--width must be a positive whole number");
      width = v;
    } else if (a.startsWith("-") && a !== "-") {
      return usage(`unknown argument: ${a}`);
    } else if (path !== undefined) {
      return usage("give one file, or - for stdin");
    } else {
      path = a;
    }
  }
  if (path === undefined) return usage("no input: give a file, or - for stdin");

  let text: string;
  try {
    text = path === "-" ? readStdin() : readFileSync(path, "utf8");
  } catch (e) {
    return usage(`cannot read ${path}: ${(e as Error).message}`);
  }
  const markdown = path !== "-" && [".md", ".markdown"].includes(extname(path).toLowerCase());
  const findings = check(text, { file: path === "-" ? "stdin" : path, tier, width, markdown });
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
