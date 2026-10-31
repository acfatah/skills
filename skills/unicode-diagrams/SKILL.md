---
name: unicode-diagrams
description: One design system for text diagrams - glyph tiers (ASCII, Tier 1, Tier 2) picked from the output target and terminal, fixed meanings for line styles and status glyphs, templates, and a bundled Bun checker for unsafe glyphs, lines over 80 columns and broken box edges. Load before drawing a diagram, flowchart, sequence diagram, tree, state machine, timeline or text bar chart in chat, or in a markdown document when the user asks for one there.
allowed-tools: Bash(bun ${CLAUDE_SKILL_DIR}/scripts/check.ts *)
---

# Unicode Diagrams v1.0.0

Draw every text diagram with the same small set of glyphs and the same
meanings, then check it with the bundled script before sending it. The
glyph tiers live in [`references/glyphs.json`](references/glyphs.json), the
single source for this file and the checker; templates live in
[`references/patterns.md`](references/patterns.md).

## Scope

- **Chat replies** by default.
- **Markdown documents** only when the user asks for a text diagram there.
- **Mermaid** stays the default for documents that GitHub renders, such as
  READMEs, plans and docs in a repo. Draw text there only when asked.
- **Always in a fenced code block,** with the `text` info string. Outside
  one, Markdown renderers and proportional fonts break the alignment.
- **At most 80 columns,** measured in display cells, not characters.
- **No diagram** when a short list says the same thing, or a table
  compares three or more items better. When it needs color, interaction
  or more than 80 columns, offer an HTML artifact instead.

## Pick the tier

Each tier allows its own glyphs plus every lower tier's.

| Tier | Adds | Safe where |
|---|---|---|
| ASCII | printable ASCII only | everywhere |
| Tier 1 | light, heavy and double lines, basic arrows, blocks, shapes | any UTF-8 terminal |
| Tier 2 | rounded corners, dashed lines, `✓ ✗` | modern terminals |

**1. The output target sets the ceiling:**

| Target | Tier |
|---|---|
| Chat reply | Tier 2, if the environment allows it |
| PR or issue body | Tier 1, in a fenced block |
| Markdown document, when asked | Tier 1, in a fenced block |
| Commit message, log line, code comment | ASCII |

A repo whose existing diagrams are ASCII only keeps ASCII.

**2. The environment can lower it,** for chat. Run these once per session,
as plain commands, and reuse the answer:

```bash
locale charmap
echo $TERM
env | grep -E '^(TERM_PROGRAM|WT_SESSION|KITTY_WINDOW_ID)='
```

- **ASCII** when the charmap is not `UTF-8`, or `TERM` is `linux`,
  `vt100` or `dumb`.
- **Tier 2** only when a modern terminal shows: `WT_SESSION` is set
  (Windows Terminal), `TERM_PROGRAM` is `iTerm.app`, `WezTerm` or
  `ghostty`, `KITTY_WINDOW_ID` is set, or `TERM` is `xterm-kitty` or
  `xterm-ghostty`.
- **Tier 1** otherwise, tmux and SSH sessions included.

**3. The user's word wins.** "ASCII only", or a report that a diagram looks
broken, misaligned or full of boxes, means ASCII for the rest of the
session. Font coverage and the terminal's Ambiguous-width setting cannot be
detected, so this report is the only signal for them. "Use Unicode" or
"rounded corners are fine" raises the tier the same way.

## Line styles carry meaning

| Style | Glyphs | Meaning |
|---|---|---|
| Light | `─ │ ┌ ┐ └ ┘` | normal component or flow |
| Heavy | `━ ┃ ┏ ┓ ┗ ┛` | emphasis, critical path |
| Double | `═ ║ ╔ ╗ ╚ ╝` | boundary: system, trust zone |
| Dashed | `┄ ┆ ┅ ┇` | optional, async, planned |
| Rounded | `╭ ╮ ╰ ╯` | process or actor |
| Square | `┌ ┐ └ ┘` | data |

- **Use one style per meaning,** and do not mix styles for decoration.
- **Below Tier 2,** dashed and rounded are not available: use light lines
  and put the meaning in a label, such as `(async)`.
- **In ASCII,** every line is `- | +`, and every meaning goes in a label.

## Node and status glyphs

| Meaning | Glyph | ASCII |
|---|---|---|
| Active node | `●` | `*` |
| Inactive node | `○` | `o` |
| Decision | `◆` | `<>` |
| Data store | `■` | `#` |
| Done | `✓` | `[x]` |
| Failed | `✗` | `[!]` |
| In progress | `◐` | `[~]` |
| Pending | `·` | `[ ]` |

- **Arrows:** `→ ← ↑ ↓` for flow, `⇒` for "implies" or a derived step,
  `▶ ◀ ▲ ▼` as arrowheads on a drawn line. ASCII: `> < ^ v`.
- **Bars:** `█` for a full cell and `▏▎▍▌▋▊▉` for eighths. ASCII: `#`,
  rounded to whole cells.
- **`✓ ✗` are Tier 2.** In Tier 1, write the word or use the ASCII form.

## Junction cheat sheet

```text
light    ┌ ┬ ┐    heavy    ┏ ┳ ┓    double   ╔ ╦ ╗
         ├ ┼ ┤             ┣ ╋ ┫             ╠ ╬ ╣
         └ ┴ ┘             ┗ ┻ ┛             ╚ ╩ ╝

a light line leaves the box at   bottom   top   left   right
  light box                        ┬       ┴     ┤      ├
  heavy box                        ┯       ┷     ┨      ┠
  double box                       ╤       ╧     ╢      ╟

a light line crosses             a horizontal   a vertical
  a heavy line                         ┿             ╂
  a double line                        ╪             ╫
```

- **Where a line meets a box edge, use a junction,** never a gap: a light
  line leaving the bottom of a light box starts at `┬`, of a heavy box at
  `┯`, of a double box at `╤`.
- **Every glyph is in `glyphs.json`,** with its code point and name. Read
  it when you need a corner or junction that is not listed here.

## Check before sending

1. **Write the diagram** to a file in the scratchpad, such as
   `<scratchpad>/diagram.txt`: the diagram alone, without the fence.
2. **Run the checker** with the tier you picked:

   ```bash
   bun ${CLAUDE_SKILL_DIR}/scripts/check.ts --tier tier2 <scratchpad>/diagram.txt
   ```

3. **Fix every error,** rerun until it exits 0, then paste the file's
   content into the reply.
4. **Reread every warning.** `[align]` is a heuristic: a vertical line
   that connects to nothing above or below. Fix it unless it is meant.

- **`${CLAUDE_SKILL_DIR}`** is this skill's folder; Claude Code fills it in
  when it loads this file. If it shows up unfilled, use the "Base directory
  for this skill" path. Write the path out in full; never put it in a shell
  variable, or the `allowed-tools` grant does not match.
- **Options:** `--tier ascii|tier1|tier2` (default `tier2`), `--width N`
  (default 80), and `-` to read stdin. A `.md` file is checked one fenced
  block at a time; any other file is one diagram.
- **Codes:** `[glyph]` a character above the tier, with a replacement when
  there is one; `[width]` a line over `--width` columns; `[align]` the
  warning above.
- **Exit codes:** 0 clean (warnings allowed), 1 errors, 2 usage error.
- **No Bun:** draw at Tier 1 or lower, count columns by hand, and say in
  one line that the diagram is unchecked. Offer the install command from
  <https://bun.sh>.

## Gotchas

- **Ambiguous width.** Most box-drawing and shape glyphs are East Asian
  Ambiguous width. In CJK locales, or a terminal set to draw them wide,
  they take two columns and every box breaks. Switch to ASCII when the user
  reports it.
- **Font fallback.** A font that lacks `╭` or `┄` borrows it from another
  font, sometimes at a different width. That is why rounded and dashed
  glyphs are Tier 2.
- **tmux hides the outer terminal.** `TERM` becomes `tmux-256color` or
  `screen`, and `TERM_PROGRAM` may say `tmux`. Stay at Tier 1 unless
  `WT_SESSION` or another marker leaked through.
- **GitHub misaligns box art outside code blocks.** Its proportional font
  and Markdown parsing shift every line; always fence it.
- **Emoji look close but are wide.** `✅ ❌ ⭐ ⚠ ✔ ✖ ☑` render as two-column
  emoji in many terminals, and U+FE0F turns `▶` or `⚠` into one. The
  checker rejects them and names the replacement.
- **The checker sees text, not pixels.** A clean run means the glyphs and
  widths are safe, not that the terminal draws them aligned. A user report
  still wins.
