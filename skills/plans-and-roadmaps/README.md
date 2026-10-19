# plans-and-roadmaps

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to handle plan documents: where plan files live, how finished steps
are stamped, which directory marks a plan's state, and how big work is
split into phased plans and multi-session roadmaps.

## What it is

- **Leaves the plan-mode file** where plan mode puts it and symlinks it
  into the target repo under a meaningful name, never over an existing
  file. Links work the same wherever `plansDirectory` puts the file.
- **Stamps finished steps** with a real timestamp from `date`.
- **Marks state by directory:** `completed/`, `paused/`, `superseded/`,
  `archived/`. A plan leaving the top level becomes a real copy, so
  Claude Code's cleanup of `~/.claude/plans/` cannot break it.
- **Freezes an idle linked plan** into a real file before that cleanup,
  and says so plainly when a link is already broken.
- **Ends every plan, or every phase,** with a suggested commit message.
- **Honours a plan's Auto-commit run mode** (see
  [`auto-commit`](../auto-commit)) by committing each phase instead of
  waiting. This needs the `auto-commit` skill installed; without it, the
  plan runs in Pause and Claude says why.
- **Honours the Auto-PR run mode** too (see [`auto-pr`](../auto-pr)):
  Auto-commit, then push and open or update a draft PR at a clean
  finish. Without `auto-pr`, the line runs as Auto-commit, or as Pause
  when `auto-commit` is missing too.
- **Offers a worktree at plan approval,** in the same prompt as the
  run-mode question. No worktree is the default. A worktree branches from
  the current HEAD as `<type>/<topic>` under `.claude/worktrees/`, and can
  carry uncommitted changes over by copy or move. The choice is written
  into the plan, so it survives a context clear.
- **Writes a short stop instruction** into every phased plan and roadmap,
  so the rules hold even if approval clears the context.
- **Carries context between sessions** through a roadmap file.

## What it is not

- **Not an issue tracker.** It governs plan documents only: the plan-mode
  file, `.claude/plans/`, `PLAN*.md`, `TODO.md`. Bugs and ideas found
  along the way belong in [`issue-tracker`](../issue-tracker).
- **Not a committer.** It writes a suggested commit message; it commits
  only when you ask or the plan's run mode is Auto-commit, whose
  safeguards live in `auto-commit`.
- **Not a self-starter.** It never plans or starts the next phase; you
  start every session and every plan mode.
- **Not a way to share plans.** Plans are git-ignored local files and are
  never committed unless you ask; a reviewer, CI, or fresh clone sees
  nothing.

## When not to use

- **A quick change with no plan** → just ask. The skill only acts on plan
  documents.
- **Logging a side issue** → use `issue-tracker`.
- **Committing every phase without stopping** → turn on `auto-commit`;
  this skill only honours its run-mode line.
- **Sharing a plan with reviewers** → put it in the PR description or a
  tracked doc.

**Negative example:** "Fix the typo in the README" will not load it; there
is no plan to manage.

## Install

```bash
bunx skills add acfatah/skills -s plans-and-roadmaps -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/plans-and-roadmaps" ~/.claude/skills/plans-and-roadmaps
```

## Usage

### How it loads

- **As a side effect of planning.** Claude loads it before writing,
  executing, stamping, or moving a plan; you rarely name it.
- **Reliably, with a `CLAUDE.md` pointer.** Its two rules hold even when
  the skill does not load:

  ```markdown
  ## Plan documents

  Before writing, executing, stamping, or moving any plan (plan-mode
  file, `.claude/plans/*.md`, `PLAN*.md`, `TODO.md`), load the
  `plans-and-roadmaps` skill. Two rules hold even without it: keep the
  plan-mode file in `~/.claude/plans/`, and commit plans only when
  asked.

  ## Worktrees

  Before a plan is approved or executed, the `plans-and-roadmaps` skill
  asks whether to run it in a worktree. Without a plan, when the user asks
  for two or more distinct changes in a git repo, load that skill and ask
  the same question, in the same prompt as the auto-commit run-mode
  question. Two rules hold even without it: No worktree is the default,
  and never exit or remove a worktree unless asked.
  ```

- **By name, always.** `/plans-and-roadmaps …` or "use the
  plans-and-roadmaps skill".
- **The plan carries its own stop line,** so approval that clears the
  context still stops at each phase.
- **What Claude asks back:** at plan approval, whether to run the plan in
  a worktree, and, with a dirty tree, whether to leave, copy or move the
  uncommitted changes; when a link name or `roadmap.md` is taken;
  before moving a tracked plan; when an earlier phase was left
  uncommitted (commit it, or combine the phases); before migrating legacy
  `PLAN_IN_PROGRESS-*` names.

### Example prompts

- **Plan:** "Make this a phased plan, one commit per phase." Ask in plan
  mode.
- **Roadmap:** "Make a roadmap for moving to Postgres." / "Plan phase 2
  of .claude/plans/postgres/roadmap.md."
- **Run:** "Implement the plan." Claude stamps each step as it finishes.
- **Worktree:** pick "Worktree from HEAD" at approval. Claude creates
  `feat/<topic>` under `.claude/worktrees/` and works there.
- **Shelve:** "Pause this plan: waiting on the API key." / "Drop the
  cache plan, it's obsolete." It moves to `paused/` or `archived/` only
  when you ask; a linked plan becomes a real copy.
- **Resume:** "Resume the paused cache plan."
- **Finish:** "/plans-and-roadmaps move the finished plan to completed."
  Claude moves it only when every step is stamped.

### Walkthrough

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

- **A worktree starts from local HEAD,** not `origin/main`, and ignores
  `worktree.baseRef`.
- **Plan files stay in the main checkout,** under `.claude/plans/` there,
  so removing the worktree cannot delete them. Writing them from inside
  the worktree may ask for permission.
- **Auto-PR is hidden on a new worktree branch:** it has no upstream yet.
  Run `git push -u origin <branch>` first.
- **Leaving and removing the worktree is yours.** Claude stays in it and
  never removes it unless asked; after the merge, use
  [`post-merge-cleanup`](../post-merge-cleanup).

The full rules are in [`SKILL.md`](SKILL.md).
