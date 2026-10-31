import { describe, expect, test } from "bun:test";
import {
  type Tier,
  buildTable,
  cells,
  check,
  extractBlocks,
  loadGlyphs,
  run,
} from "../scripts/check.ts";

const data = loadGlyphs();
const table = buildTable(data);

const findings = (text: string, tier: Tier = "tier2", markdown = false) =>
  check(text, { file: "t", tier, width: 80, markdown, table });
const codes = (text: string, tier: Tier = "tier2") => findings(text, tier).map((f) => f.code);

const SAMPLE = `╔═ Trust boundary ═══════════════════════════╗
║  ╭────────╮      ┏━━━━━━━━┓      ┌──────┐  ║
║  │ Client │ ───▶ ┃  API   ┃ ───▶ │  DB  │  ║
║  ╰────────╯      ┗━━━━━━━━┛      └──────┘  ║
║                       ┆                    ║
║                       ┆ async              ║
║                       ▼                    ║
║                  ┌────────┐                ║
║                  │ Queue  │                ║
║                  └────────┘                ║
╚════════════════════════════════════════════╝
`;

const tierGlyphs = (tier: "tier1" | "tier2") => data.tiers[tier].glyphs.map((g) => g.glyph).join("");

describe("tiers", () => {
  test("ascii accepts printable ASCII and rejects Tier 1", () => {
    expect(codes("+--+ | > < ^ v * o #")).toEqual([]);
    expect(codes("+--+", "ascii")).toEqual([]);
    expect(codes("─", "ascii")).toEqual(["glyph"]);
  });
  test("tier1 accepts its glyphs and rejects Tier 2", () => {
    expect(findings(tierGlyphs("tier1"), "tier1").filter((f) => f.code === "glyph")).toEqual([]);
    const f = findings("╭", "tier1");
    expect(f).toHaveLength(1);
    expect(f[0].message).toBe("U+256D BOX DRAWINGS LIGHT ARC DOWN AND RIGHT is tier2, above --tier tier1; use ┌");
  });
  test("tier2 accepts its glyphs and rejects anything outside the tiers", () => {
    expect(findings(tierGlyphs("tier2")).filter((f) => f.code === "glyph")).toEqual([]);
    expect(codes("é")).toEqual(["glyph"]);
  });
  test("a lower tier suggests its own replacement", () => {
    expect(findings("✓", "ascii")[0].message).toBe("U+2713 CHECK MARK is tier2, above --tier ascii; use [x]");
  });
});

describe("deny list", () => {
  test("an emoji fails with its suggested replacement", () => {
    const f = findings("done ✅");
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe("glyph");
    expect(f[0].message).toBe("U+2705 WHITE HEAVY CHECK MARK is not allowed; use ✓");
  });
  test("the suggestion follows the tier", () => {
    expect(findings("✅", "ascii")[0].message).toEndWith("; use [x]");
  });
  test("the emoji variation selector is removed", () => {
    expect(findings("▶️")[0].message).toBe("U+FE0F VARIATION SELECTOR-16 is not allowed; remove it");
  });
  test("a tab asks for spaces", () => {
    expect(findings("a\tb")[0].message).toEndWith("; use spaces");
  });
});

describe("width", () => {
  test("80 box-drawing glyphs pass, 81 fail", () => {
    expect(codes("─".repeat(80))).toEqual([]);
    const f = findings("─".repeat(81));
    expect(f.map((x) => x.code)).toEqual(["width"]);
    expect(f[0].message).toBe("line is 81 columns, over --width 80");
  });
  test("a wide emoji counts as two columns", () => {
    expect(cells("✅")).toHaveLength(2);
    expect(codes(`${"-".repeat(79)}✅`)).toEqual(["glyph", "width"]);
  });
});

describe("align", () => {
  test("the brainstorm sample passes clean", () => {
    expect(findings(SAMPLE)).toEqual([]);
  });
  test("a right edge one column off is a warning", () => {
    const box = "┌────┐\n│ ab  │\n│ cd │\n└────┘\n";
    const f = findings(box);
    expect(f.map((x) => [x.line, x.code, x.severity])).toEqual([[2, "align", "warn"]]);
    expect(f[0].message).toBe("│ at column 7 connects to nothing above or below");
  });
  test("an edge pulled in under a horizontal line is a warning", () => {
    expect(codes("┌────┐\n│ ab│\n└────┘")).toEqual(["align"]);
  });
  test("a tree passes", () => {
    expect(findings("root\n├── a\n│   └── b\n└── c\n")).toEqual([]);
  });
});

describe("markdown", () => {
  const md = [
    "# Title",
    "",
    "Prose with ✅ is not checked.",
    "",
    "```text",
    "┌──┐",
    "│✅│",
    "└──┘",
    "```",
    "",
    "~~~",
    "a ─ b",
    "~~~",
  ].join("\n");

  test("extracts each fenced block with its line numbers", () => {
    const blocks = extractBlocks(md);
    expect(blocks).toEqual([
      { start: 6, lines: ["┌──┐", "│✅│", "└──┘"] },
      { start: 12, lines: ["a ─ b"] },
    ]);
  });
  test("checks only inside fences, at file line numbers", () => {
    const f = check(md, { file: "doc.md", tier: "tier2", width: 80, markdown: true, table });
    expect(f.map((x) => `${x.line} ${x.code}`)).toEqual(["7 glyph"]);
  });
});

describe("run", () => {
  test("stdin with an emoji and an 81-column line exits 1", () => {
    const input = `ok ✅\n${"─".repeat(81)}\n`;
    const r = run(["-"], () => input);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("stdin:1  [glyph]  U+2705 WHITE HEAVY CHECK MARK is not allowed; use ✓");
    expect(r.stdout).toContain("stdin:2  [width]");
    expect(r.stdout).toEndWith("2 errors, 0 warnings\n");
  });
  test("a clean diagram exits 0", () => {
    const r = run(["-"], () => SAMPLE);
    expect(r).toEqual({ code: 0, stdout: "0 errors, 0 warnings\n", stderr: "" });
  });
  test("warnings alone exit 0, after errors in the output", () => {
    const r = run(["-"], () => "┌────┐\n│ ab  │ ✅\n│ cd │\n└────┘\n");
    expect(r.code).toBe(1);
    const lines = r.stdout.trim().split("\n");
    expect(lines[0]).toContain("[glyph]");
    expect(lines[1]).toContain("[align]");
    expect(run(["-"], () => "┌────┐\n│ ab  │\n└────┘\n").code).toBe(0);
  });
  test("--tier and --width apply", () => {
    expect(run(["--tier", "ascii", "-"], () => "─").code).toBe(1);
    expect(run(["--width", "3", "-"], () => "abcd").stdout).toContain("[width]");
  });
  test("usage errors exit 2", () => {
    expect(run([]).code).toBe(2);
    expect(run(["--tier", "tier3", "-"]).code).toBe(2);
    expect(run(["--width", "x", "-"]).code).toBe(2);
    expect(run(["--bogus"]).code).toBe(2);
    expect(run(["/no/such/file.md"]).code).toBe(2);
  });
  test("patterns.md is checker-clean", () => {
    const r = run([`${import.meta.dir}/../references/patterns.md`]);
    expect(r.stdout).toBe("0 errors, 0 warnings\n");
  });
});

describe("glyph data", () => {
  test("every allowed glyph is one column wide", () => {
    const wide = [...data.tiers.tier1.glyphs, ...data.tiers.tier2.glyphs].filter(
      (g) => Bun.stringWidth(g.glyph) !== 1,
    );
    expect(wide).toEqual([]);
  });
  test("every code point and replacement matches", () => {
    for (const g of [...data.tiers.tier1.glyphs, ...data.tiers.tier2.glyphs, ...data.deny]) {
      expect(`U+${g.glyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).toBe(g.cp);
    }
    for (const g of data.tiers.tier2.glyphs) {
      if (g.tier1) expect(table.known.get(g.tier1)?.tier).toBe("tier1");
    }
  });
  test("no glyph is in two tiers or both allowed and denied", () => {
    const t1 = new Set(tierGlyphs("tier1"));
    for (const ch of tierGlyphs("tier2")) expect(t1.has(ch)).toBe(false);
    for (const d of data.deny) expect(table.known.has(d.glyph)).toBe(false);
  });
});
