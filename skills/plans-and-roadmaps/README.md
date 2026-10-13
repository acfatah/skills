# plans-and-roadmaps

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to handle plan documents: where plan files live, how finished steps
are stamped, which directory marks a plan's state, and how big work is
split into phased plans and multi-session roadmaps.

What it does:

- Leaves the plan-mode file where plan mode puts it and symlinks it into
  the target repo under a meaningful name, never over an existing file.
  Links work the same wherever `plansDirectory` puts the file.
- Stamps finished steps with a real timestamp from `date`.
- Marks state by directory: `completed/`, `paused/`, `superseded/`,
  `archived/`. A plan leaving the top level becomes a real copy, so
  Claude Code's cleanup of `~/.claude/plans/` cannot break it.
- Freezes an idle linked plan into a real file before that cleanup, and
  says so plainly when a link is already broken.
- Ends every plan, or every phase, with a suggested commit message.
- Writes a short stop instruction into every phased plan and roadmap, so
  the rules hold even if approval clears the context.
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
   "Make a roadmap for X." After approval Claude copies it into the repo
   and stops.
2. **Plan a phase.** In a fresh session, enter plan mode and ask:
   "Plan phase 2 of .claude/plans/<topic>/roadmap.md."
3. **Build it.** After approval Claude implements the phase, records its
   outcome in the roadmap, and stops with a commit message.
4. **Repeat** until every phase is stamped. The whole folder then moves
   to `completed/`.

Each roadmap gets one folder. The roadmap is a real file; a phase plan is
a link while it runs and a copy once done:

```
.claude/plans/<topic>/
├── roadmap.md               real file: goal, decisions, phases, outcomes
├── phase_1_<subject>.md     detailed plan for phase 1
└── phase_2_<subject>.md
```

Gotchas:

- **Only what's written down survives.** A fresh session sees the
  roadmap, not the old chat. Make sure decisions and outcomes land there.
- **Plan mode can't edit the roadmap.** Roadmap updates happen after you
  approve a phase plan, and go straight to `roadmap.md`.
- **Prefer plain approval for roadmaps.** With
  `showClearContextOnPlanAccept` on, plan approval can offer "Yes, clear
  context and …". That starts work from the plan alone, without this skill.
  The plan's own stop line usually covers it, but plain approval is safer.
- **Give `plansDirectory` its own folder.** Point it at something like
  `.claude/plan-mode`, not `.claude/plans/`, or plan-mode files mix with
  the plans. Claude Code never cleans a relocated folder; prune it by hand.
- **Plan-mode files expire.** Claude Code deletes files in
  `~/.claude/plans/` after about `cleanupPeriodDays` (default 30), and
  the docs don't say whether an edit resets the clock. Shelving a plan?
  Say "pause it" so it is copied into `paused/`, or raise
  `cleanupPeriodDays`.

The full rules are in [`SKILL.md`](SKILL.md).
