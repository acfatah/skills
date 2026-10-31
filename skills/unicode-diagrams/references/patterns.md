# Diagram patterns

One small template per diagram type, each with an ASCII twin. Copy the one
that fits, then change its labels and widths. Every block here passes
`scripts/check.ts` at the default `--tier tier2`; the Tier 1 templates also
pass `--tier tier1`.

- **Line styles keep their meaning** from `SKILL.md`: light is normal,
  heavy is emphasis, double is a boundary, dashed is optional or async,
  rounded is a process or actor, square is data.
- **ASCII twins keep the shape, not the styles.** ASCII has one line style,
  so put the meaning in a label, such as `(async)` or `[critical]`.
- **Widen a box** by adding the same number of `─` to its top and bottom
  edges as you add to its label line.

## Flowchart (Tier 2)

Rounded boxes are steps, `◆` is a decision, the square box is a data store.

```text
   ╭─────────╮
   │ Request │
   ╰────┬────╯
        │
        ▼
   ╭──────────╮
   │ Validate │
   ╰────┬─────╯
        │
        ▼
        ◆ valid? ── no ──▶ ✗ 400 Bad Request
        │
        │ yes
        ▼
   ┌─────────┐
   │ ■ Store │
   └─────────┘
```

```text
   +---------+
   | Request |
   +----+----+
        |
        v
   +----------+
   | Validate |
   +----+-----+
        |
        v
        <> valid? -- no --> [!] 400 Bad Request
        |
        | yes
        v
   +---------+
   | # Store |
   +---------+
```

## Sequence diagram (Tier 2)

Lifelines are light; the dashed message is async.

```text
 Client          API             DB
   │              │               │
   │── request ──▶│               │
   │              │── query ─────▶│
   │              │◀───── rows ───│
   │◀── 200 OK ───│               │
   │              │┄┄ audit ┄┄┄┄┄▶│
   │              │               │
```

```text
 Client          API             DB
   |              |               |
   |-- request -->|               |
   |              |-- query ----->|
   |              |<----- rows ---|
   |<-- 200 OK ---|               |
   |              |.. audit .....>|  (async)
   |              |               |
```

## Tree (Tier 1)

```text
skills/
├── unicode-diagrams/
│   ├── SKILL.md
│   ├── references/
│   │   ├── glyphs.json
│   │   └── patterns.md
│   └── scripts/
│       └── check.ts
└── lint-skills/
```

```text
skills/
+-- unicode-diagrams/
|   +-- SKILL.md
|   +-- references/
|   |   +-- glyphs.json
|   |   `-- patterns.md
|   `-- scripts/
|       `-- check.ts
`-- lint-skills/
```

## State machine (Tier 2)

States are rounded; `●` marks the current state.

```text
            start
              │
              ▼
        ╭───────────╮   fail    ╭──────────╮
        │ ○ Pending │ ────────▶ │ ✗ Failed │
        ╰─────┬─────╯           ╰────┬─────╯
              │ run                  │ retry
              ▼                      │
        ╭───────────╮                │
        │ ● Running │ ◀──────────────╯
        ╰─────┬─────╯
              │ ok
              ▼
        ╭───────────╮
        │ ✓ Done    │
        ╰───────────╯
```

```text
            start
              |
              v
        +-----------+   fail    +------------+
        | o Pending | --------> | [!] Failed |
        +-----+-----+           +-----+------+
              | run                   | retry
              v                       |
        +-----------+                 |
        | * Running | <---------------+
        +-----+-----+
              | ok
              v
        +-----------+
        | [x] Done  |
        +-----------+
```

## Horizontal bar chart (Tier 1)

One cell is one unit. Eighth blocks `▏▎▍▌▋▊▉` show the remainder in steps
of 1/8: `▏` is 0.125, `▌` is 0.5, `▉` is 0.875.

```text
Build time by step (seconds)

install  │████████████████▌ 16.5
compile  │██████████████████████▊ 22.8
test     │█████████▏ 9.1
lint     │███▍ 3.4
         └────┬────┬────┬────┬────┬
              5   10   15   20   25
```

ASCII has no partial cells, so round each bar to the nearest whole cell.

```text
Build time by step (seconds)

install  |################# 16.5
compile  |####################### 22.8
test     |######### 9.1
lint     |### 3.4
         +----+----+----+----+----+
              5   10   15   20   25
```

## Timeline (Tier 2)

`●` is a reached milestone, `○` a future one; the status glyph follows the
label.

```text
  Oct 01      Oct 08      Oct 15      Oct 22
──●───────────●───────────●───────────○────▶
  Plan ✓      Build ✓     Test ◐      Ship ·
```

```text
  Oct 01      Oct 08      Oct 15      Oct 22
--*-----------*-----------*-----------o---->
  Plan [x]    Build [x]   Test [~]    Ship [ ]
```

## Boundary box (Tier 2)

The double box is a trust zone, the heavy box the critical component, and
the dashed line an async hand-off.

```text
╔═ Trust boundary ═══════════════════════════╗
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
```

```text
+= Trust boundary ===========================+
|  +--------+      +========+      +------+  |
|  | Client | ---> |  API   | ---> |  DB  |  |
|  +--------+      +========+      +------+  |
|                       :                    |
|                       : async              |
|                       v                    |
|                  +--------+                |
|                  | Queue  |                |
|                  +--------+                |
+============================================+
```
