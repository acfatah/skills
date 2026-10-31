# unicode-diagrams

An [agent skill](https://skills.sh) that gives Claude Code one design system
for text diagrams in chat: a tiered set of Unicode glyphs from the Arrows,
Box Drawing, Block Elements and Geometric Shapes blocks, fixed meanings for
line styles and status glyphs, templates, and a bundled Bun checker that
catches unsafe glyphs, lines over 80 columns, and box edges that do not
connect.

## What it is

- **Picks a glyph tier** from the output target, the terminal and your
  word: ASCII, Tier 1 (light, heavy and double lines, arrows, blocks,
  shapes) or Tier 2 (adds rounded corners, dashed lines and `✓ ✗`).
- **Gives line styles fixed meanings:** light is normal, heavy is
  emphasis, double is a boundary, dashed is optional or async, rounded is a
  process or actor, square is data.
- **Gives nodes and statuses fixed glyphs,** each with an ASCII equivalent:
  `●` active, `◆` decision, `■` data store, `✓` done, `◐` in progress.
- **Ships templates** for a flowchart, sequence diagram, tree, state
  machine, bar chart, timeline and boundary box, each with an ASCII twin,
  in [`references/patterns.md`](references/patterns.md).
- **Checks every diagram before sending it** with `scripts/check.ts`:
  glyphs above the chosen tier, lines wider than 80 columns by display
  width, and vertical lines that connect to nothing.
- **Keeps the glyph list in one file,**
  [`references/glyphs.json`](references/glyphs.json), with each glyph's code
  point, name and replacements.

## What it is not

- **Not a renderer.** It does not draw images or turn Mermaid into text;
  Claude still draws the diagram.
- **Not a layout engine.** The checker reports problems; it never moves a
  line or fixes a box.
- **Not a pixel check.** A clean run means the glyphs and widths are safe,
  not that your terminal draws them aligned.
- **Not for every document.** It covers chat by default, and markdown
  documents only when you ask for a text diagram there.

## When not to use

- **A document GitHub renders,** such as a README or a plan in a repo →
  use Mermaid, which GitHub draws as a real diagram.
- **A diagram that needs color, interaction or more than 80 columns** →
  Claude offers an HTML artifact instead.
- **Three or more items compared on the same attributes** → a table
  compares them better.
- **A short list says the same thing** → Claude skips the diagram.

**Negative example:** "Add an architecture diagram to `docs/design.md`"
uses Mermaid, not this skill, unless you ask for a text diagram.

## Install

```bash
bunx skills add acfatah/skills -s unicode-diagrams -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/unicode-diagrams" ~/.claude/skills/unicode-diagrams
```

The skill pre-approves its checker through `allowed-tools`, so the check
runs without a permission prompt in the turn that loads it.

## Requirements

- **[Bun](https://bun.sh)** runs the checker. Without it, Claude draws at
  Tier 1 or lower, counts columns by hand, says the diagram is unchecked,
  and offers the install command.

## Usage

### How it loads

- **By description match.** Claude loads it before drawing a diagram,
  flowchart, sequence diagram, tree, state machine, timeline or text bar
  chart in chat, or in a markdown document when you ask for one there.
- **By name, always.** `/unicode-diagrams …` or "use the unicode-diagrams
  skill".
- **For every diagram, add a `CLAUDE.md` pointer.** A request that only
  needs a diagram as part of the answer may not match the description:

  ```markdown
  - **Diagrams** for flows, sequences, hierarchies, or state changes.
    Before drawing one, load the `unicode-diagrams` skill. Two rules
    hold even without it: draw it in a fenced code block at most 80
    columns wide, and never use emoji or other wide characters.
  ```

- **What Claude asks back:** nothing. It checks the locale and `TERM` once
  per session, and switches to ASCII when you say a diagram looks broken.

### Example prompts

- **Flows:** "Draw the request flow as a diagram." / "Show the login steps
  as a flowchart, with the failure branch."
- **Sequences and states:** "Draw a sequence diagram of the OAuth
  handshake." / "Sketch the job states as a state machine."
- **Structure:** "Show the `src/` layout as a tree."
- **Data:** "Draw a text bar chart of these build times." /
  "/unicode-diagrams timeline of the release milestones."
- **Fallback:** "That diagram looks broken, use ASCII only."

### Walkthrough

1. You ask for a diagram of the request flow.
2. Claude checks the locale and `TERM` and picks Tier 2 for chat in a
   modern terminal, or Tier 1 otherwise.
3. It starts from the matching template, and uses heavy lines for the
   critical path and a double box for the trust boundary.
4. It writes the diagram to the scratchpad and runs the checker:

   ```text
   $ bun <base>/scripts/check.ts --tier tier2 <scratchpad>/diagram.txt
   <scratchpad>/diagram.txt:3  [glyph]  U+2705 WHITE HEAVY CHECK MARK is not allowed; use ✓
   <scratchpad>/diagram.txt:5  [align]  │ at column 27 connects to nothing above or below
   1 error, 1 warning
   ```

5. It fixes each finding, reruns until the check exits 0, and sends the
   diagram in a fenced code block.

Gotchas:

- **Ambiguous width.** In CJK locales, or a terminal set to draw Ambiguous
  characters wide, box-drawing glyphs take two columns and every box
  breaks. Say so, and Claude switches to ASCII.
- **Font fallback.** A font without `╭` or `┄` may draw it at a different
  width; that is why rounded and dashed glyphs are Tier 2.
- **tmux hides the outer terminal,** so Claude stays at Tier 1 there unless
  a marker such as `WT_SESSION` leaks through.
- **GitHub misaligns box art outside code blocks;** diagrams are always
  fenced.
- **The checker sees text, not pixels.** Your report of a broken diagram
  still wins over a clean run.

The full rules are in [`SKILL.md`](SKILL.md),
[`references/patterns.md`](references/patterns.md) and
[`references/glyphs.json`](references/glyphs.json).
