---
name: plans-and-roadmaps
description: Rules for plan documents and roadmaps: where plan files live, progress stamps, state directories, phased plans, multi-session roadmaps. Load before writing, executing, stamping, or moving a plan: the plan-mode file, any .md under .claude/plans/, or a PLAN*.md / TODO.md being executed.
---

# Plans and Roadmaps v1.0.0

These rules apply to the plan-mode plan file, any `.md` under a
`.claude/plans/` directory, and any `PLAN*.md` or `TODO.md` you are executing
against. Do not commit them unless asked.

## Plan file location

Never move or copy the plan-mode plan file. It stays at
`~/.claude/plans/<slug>.md`, which is the only path Claude Code knows; move
it and a later turn reports that no plan exists and offers to write a new
one. Instead, once a plan is approved, symlink it into the repository,
worktree, or sub-repo that the plan targets, under a name that means
something:

    mkdir -p <target>/.claude/plans
    ln -sfn ~/.claude/plans/<slug>.md \
      <target>/.claude/plans/<topic>.md

- Choose the target by which files the plan edits. A plan spanning several
  repos, or touching only workspace-level tooling, belongs at the workspace
  root instead.
- `<topic>` is the plan's subject in snake_case. The generated `<slug>` is
  random words (`atomic-toasting-oasis`) and carries no meaning, so do not
  transliterate it.
- `ln -sfn`, not `ln -sf`. Without `-n`, a rerun against an existing link
  that resolves to a directory nests a second link inside it.
- The link target must be absolute; the unquoted `~` form expands to one. A
  relative target breaks as soon as the link moves into a state directory
  (see Plan states below).
- The link is read-only by construction. Read, `cat`, and `grep` follow it,
  but Write and Edit refuse with `Refusing to write through symlink`. Always
  edit `~/.claude/plans/<slug>.md` and let the link show the change. Do not
  try to defeat this with a hard link: the first write replaces the inode
  and the two paths silently diverge.
- Git-ignore `.claude/plans/` by default; the symlinks inside are local
  pointers and never belong in a commit. Unless `git check-ignore -q
  <target>/.claude/plans/` already succeeds, append `.claude/plans/` to
  `git rev-parse --git-path info/exclude`, not the tracked `.gitignore`, so
  `git add -A` cannot sweep it into a commit. Use that command rather than a
  literal `.git/info/exclude` path: in a linked worktree `.git` is a file,
  and `info/exclude` is shared with the main checkout. Track it only when
  asked. Skip the `info/exclude` step when the target is not inside a git
  repo.
- Nothing travels with the branch. A reviewer, CI, or a fresh clone sees
  nothing. Moving a plan out of the top level replaces its link with a
  real copy (see Plan states below); that copy is a record, not the plan.
- A project `CLAUDE.md` may pin the exact destination directory. Where one
  does, it wins over this section.

## Progress marking

A plan's name never encodes its state; the directory it sits in does. An
active plan sits at the top level of its directory, so starting a plan moves
and renames nothing.

When a step is finished *and verified*, edit the plan document and append a
completion stamp to that step's heading:

    ## ✅ Step 3. Wire up the loader (2026-07-28 09:47)

- Get the timestamp by running `date '+%Y-%m-%d %H:%M'`. Never write a time
  from memory — you have no clock, only today's date.
- Stamp on completion, not on start. Do not add ⏳ / 🚧 / in-progress markers;
  an unstamped heading already means "not done".
- One `date` call can stamp several steps finished in the same batch.
- For checklist items, use `- [x] ✅ Item (2026-07-28 09:47)`, matching the
  heading format.
- Never back-date a step you did not just finish. If a step was already done
  before this session, leave it alone.

## Plan states

State directories are siblings of the plan, inside the directory it
currently sits in: `.claude/plans/completed/`, `docs/completed/`, or
`./completed/` for a plan at the repository root.

| Directory | Meaning | When to move |
|---|---|---|
| top level | active | default; move back here on resume |
| `completed/` | every step stamped and verified | after the last completion stamp |
| `paused/` | started, deliberately on hold | when the user shelves it for now |
| `superseded/` | replaced by a newer plan | when the replacement is written |
| `archived/` | abandoned or obsolete, not replaced | when the user drops it |

A plan that is a real file just moves:

    mkdir -p <dir>/paused && mv <dir>/<topic>.md <dir>/paused/

- **Untracked plans only.** State moves apply to untracked plans. For a
  tracked plan, ask before moving it.
- **Keep the filename.** Use `git mv` if the file is tracked, so history
  follows it; else plain `mv`. Plans are usually untracked, and `git mv`
  fails on untracked files.
- **Leaving the top level makes a real file.** Claude Code deletes files in
  `~/.claude/plans/` once they are older than `cleanupPeriodDays` (default
  30), so a link in any state directory would soon dangle. On every move
  out of the top level, replace a link with a real copy of its target,
  then remove the link:

      mkdir -p <dir>/<state>
      src=$(readlink -f <dir>/<topic>.md)
      cp "$src" <dir>/<state>/<topic>.md && rm <dir>/<topic>.md

- **After copying, never edit the old plan-mode file.** The copy is the
  plan now. Edits to `~/.claude/plans/<slug>.md` show up nowhere and are
  lost at cleanup.
- **Completed means stamped.** Move to `completed/` only after the last step
  has its completion stamp; a plan with any unstamped heading is not done.
- **The user decides** `paused/`, `superseded/` and `archived/`. Move there
  only when asked.
- **Add a state line** under the title on every move out of the top level,
  with the time from `date`. Write it into the copy, after copying. When
  the plan was a link, end the line with its source path; omit that part
  for a plan that was already a real file:

      > Completed 2026-09-30 14:02. Copied from ~/.claude/plans/<slug>.md
      > Paused 2026-09-30 14:02: waiting on the API key. Copied from ~/.claude/plans/<slug>.md

  For `paused/`, `superseded/` and `archived/`, give the reason. For
  `superseded/`, name the replacement's path, and link back from the new
  plan.
- **Resume** a plan by moving its copy back to the top level as a real
  file, and edit it directly from then on; it has no plan-mode file any
  more. To re-plan it in plan mode instead, first move the old copy to
  `superseded/` with a state line naming the new plan, then link the new
  plan-mode file as Plan file location describes.
- **Name collision:** if the destination already holds that name (common for
  a bare `PLAN.md`), append today's date: `PLAN-2026-09-30.md`.
- `TODO.md` never moves, whatever its state.
- Update any references to the old path in other documents.
- **Legacy names:** an untracked `PLAN_IN_PROGRESS-<topic>.md` or
  `PLAN_COMPLETED-<topic>.md` is migrated when found: strip the prefix, and
  move a completed one into `completed/` (bare `PLAN_COMPLETED.md` becomes
  `completed/PLAN.md`). Leave tracked ones alone.

## Commit message in plans

Every plan ends with a suggested commit message, either as a final
`## Commit message` section or inside the last step. Use a fenced block so it
can be copied verbatim.

- Draft it when writing the plan, from the intended changes.
- After execution, revise it to match what actually changed (check
  `git diff --stat`); a plan-time draft often drifts from the real diff.
- The message is a suggestion, not an instruction to commit. See Writing
  Commit in the global `CLAUDE.md`.
- Skip the commit message when the plan's changes land outside any git
  repo.

## Phased plans

A plan with phases gets one commit per phase:

    ## Phase 1. Extract loader interface
    ### ✅ Step 1.1 Add Loader type (2026-09-26 10:02)
    ### Step 1.2 Route callers through it
    ### Phase 1 commit message

- Headings: `## Phase N`, with `### Step N.M` under it. Stamp each step on
  completion. Stamp the phase heading only when all its steps are stamped.
- Each phase ends with its own `### Phase N commit message`. That replaces
  the single message at the end of the plan.
- Stop at every phase boundary. Show the phase's commit message and wait.
  Do not start the next phase until the user says so.
- Move the plan to `completed/` only when every phase is stamped.

Handle these cases:

- **Earlier phase left uncommitted.** When the plan starts, record the
  output of `git status --short` in the plan as its baseline. Before starting
  a phase, run it again. If it shows changes beyond the baseline, the
  previous phase was not committed. Stop and ask the user to either commit it
  now, or continue and combine the two phases. To combine, merge the
  messages into the later phase's section, with a body that lists both
  phases, and mark the earlier section `(merged into Phase N)`. The extra
  changes may instead be the user's unrelated edits, so ask; never assume
  which it is.
- **Phase too small for its own commit.** Mark the heading
  `(no separate commit)` when writing the plan, and omit its message
  section. The next phase's message covers both, and its body names each
  one. Do not stop at that phase's boundary.
- **Squash merge.** Only when the user asks, or the repository squash-merges
  its PRs, add a final `## Squash commit message` built from the phase
  messages. Otherwise leave it out.
- **Plan changes mid-way.** Never renumber phases or steps, because stamps
  and conversation refer to the numbers. Insert a new phase as `Phase 2a`.
  Keep a dropped phase and strike it through:
  `## ~~Phase 3. ...~~ (dropped: <reason>)`.

## Roadmap plans

A roadmap is a phased plan whose phases each get their own plan-mode
session. Use this when the user asks for a roadmap. The user starts every
session and every plan mode; never plan or start the next phase on your
own.

Keep one directory per roadmap. Each file is a symlink to its own
plan-mode file, per Plan file location:

    <target>/.claude/plans/<topic>/roadmap.md
    <target>/.claude/plans/<topic>/phase_2_<subject>.md

- A fresh session gets a new `<slug>`, so a phase plan never overwrites
  the roadmap.
- Plan states apply to the whole `<topic>/` directory, not single files:
  `mv .claude/plans/<topic> .claude/plans/completed/`. On completion, then
  replace every link inside it with a copy of its target, as Plan states
  describes, recording each source path in its copy.

**The roadmap is the only memory a fresh session gets.** The chat is gone,
so the roadmap must hold:

- `## Goal` and `## Decisions`: each choice, its reason, and the options
  rejected. Write these while planning the roadmap, not afterwards.
- The `git status --short` baseline from Phased plans.
- One `## Phase N. <title>` per phase, one commit each, with scope and
  done-criteria. No `Step N.M` items yet; the phase plan writes those.
- Under each finished phase, `### Phase N outcome`: what actually changed
  (`git diff --stat`), deviations from the plan, surprises, and any new
  decisions. Later phases rely on this instead of the old chat.

**Frontmatter.** Every `roadmap.md` opens with YAML frontmatter:

    ---
    created: 2026-10-06 09:47
    updated: 2026-10-06 09:47
    ---

- Set both when the roadmap is first written. Get the time from
  `date '+%Y-%m-%d %H:%M'`, never from memory.
- Refresh `updated` on every edit to the roadmap: completion stamps,
  outcomes, links to phase plans, and state notes. One `date` call
  covers a batch of edits.
- Never change `created`.
- Edit the plan-mode file, not the symlink, per Plan file location.

**Writing the roadmap.** After it is approved, symlink it as
`roadmap.md` and stop. Do not start Phase 1 in the same session.

**Planning phase N** (user asks, in plan mode, in a fresh session):

1. Read `roadmap.md`: Decisions and every earlier outcome. Read an earlier
   phase plan only when an outcome points to it.
2. Run the baseline check from Phased plans before planning.
3. Write the phase plan: a `## Context` section quoting the decisions and
   outcomes it depends on, then `### Step N.M` items, then
   `### Phase N commit message`.
4. If the phase is too big for one commit, propose splitting it into
   `Phase 2a` and `Phase 2b` and plan only the first.
5. After approval, symlink it as `phase_N_<subject>.md`, link it from the
   roadmap's Phase N heading, then implement. Plan mode can only write
   the plan file, so roadmap edits wait until after approval.

**Finishing phase N:**

- Stamp each step in the phase plan, then the Phase N heading in the
  roadmap.
- Write `### Phase N outcome` in the roadmap before stopping.
- Stop, show the phase's commit message, and wait, per Phased plans.
- Phase plans stay in `<topic>/` until the whole roadmap is complete.
