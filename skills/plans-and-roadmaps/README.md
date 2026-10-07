# plans-and-roadmaps

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to handle plan documents: where plan files live, how finished steps
are stamped, which directory marks a plan's state, and how big work is
split into phased plans and multi-session roadmaps.

What it does:

- Keeps the plan-mode file in `~/.claude/plans/` and symlinks it into the
  target repo under a meaningful name.
- Stamps finished steps with a real timestamp from `date`.
- Marks state by directory: `completed/`, `paused/`, `superseded/`,
  `archived/`.
- Ends every plan, or every phase, with a suggested commit message.
- Carries context between sessions through a roadmap file.

## Install

```bash
bunx skills add acfatah/skills -s plans-and-roadmaps -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/plans-and-roadmaps" ~/.claude/skills/plans-and-roadmaps
```

## Roadmap workflow

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

The full rules are in [`SKILL.md`](SKILL.md).
