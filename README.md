# Skills

## Introduction

This repository contains my agent skills - modular capabilities that I use
to turn intentions into consistent, executable actions.

Unlike generic skill sets, these are opinionated and personalized. They
reflect my workflow preferences, design choices, and the way I approach 
problem‑solving.

## Skills

| Skill | Description |
|---|---|
| [windows-screenshots](skills/windows-screenshots) | Locate, list, and read Windows screenshots (Win+PrtScn, Snipping Tool) from WSL or native Windows shells. |

## Install

Pick interactively from the skills in this repository:

```bash
npx skills add acfatah/skills
```

Or install one directly, globally, for a specific agent:

```bash
npx skills add acfatah/skills -s windows-screenshots -a claude-code -g -y
```

List what is available without installing:

```bash
npx skills add acfatah/skills --list
```

Update installed skills:

```bash
npx skills update -g
```

## Layout

```
claude/
└── CLAUDE.md        global Claude Code instructions (see below)
skills/
└── <skill-name>/
    ├── SKILL.md     required - frontmatter `name` must match the folder 
    |                name
    └── README.md    human-facing docs (SKILL.md is the agent-facing 
                     contract)
```

## Versioning

Versioning here is deliberately the simplest thing that works: each
skill carries its own `vX.Y.Z` in the H1 title of its `SKILL.md` (e.g.
`# Windows Screenshots v1.0.0`), and bumping a version means editing
that one number. Nothing else to update.

Versions are per-skill and kept in exactly one place, so a single
repository tag never has to speak for all of them.

There is no CHANGELOG. The commit history is the change history - a
version bump rides in the same commit as the change that caused it, so
the log for a skill's folder reads as its release notes:

```bash
git log --oneline -- skills/windows-screenshots
```

## Claude Code instructions

[`claude/CLAUDE.md`](claude/CLAUDE.md) holds my global instructions for
Claude Code: response style, plan documents, phased plans, PR and commit
conventions. Claude Code loads it from `~/.claude/CLAUDE.md`, so link it
there:

```bash
ln -sfn "$PWD/claude/CLAUDE.md" ~/.claude/CLAUDE.md
```

This replaces any existing `~/.claude/CLAUDE.md`, so back that up first.

### Roadmap workflow

For work too big for one session: plan a roadmap once, then plan each
phase in its own fresh plan-mode session. The roadmap file carries the
context between sessions.

1. **Plan the roadmap.** Enter plan mode (Shift+Tab) and ask:
   "Make a roadmap for X." After approval Claude links it and stops.
2. **Plan a phase.** In a fresh session, enter plan mode and ask:
   "Plan phase 2 of .claude/plans/<topic>/roadmap.md."
3. **Build it.** After approval Claude implements the phase, records its
   outcome in the roadmap, and stops with a commit message.
4. **Repeat** until every phase is stamped. The whole folder then moves
   to `completed/`.

Each roadmap gets one folder of symlinks to the plan-mode files:

```
.claude/plans/<topic>/
├── roadmap.md               goal, decisions, phases, outcomes
├── phase_1_<subject>.md     detailed plan for phase 1
└── phase_2_<subject>.md
```

Gotchas:

- **Only what's written down survives.** A fresh session sees the
  roadmap, not the old chat. Make sure decisions and outcomes land there.
- **Plan mode can't edit the roadmap.** Roadmap updates happen after you
  approve a phase plan.

The full rules are in the "Roadmap plans" section of
[`claude/CLAUDE.md`](claude/CLAUDE.md).

## License

[MIT](LICENSE)
