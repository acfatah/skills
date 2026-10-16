---
name: plans-and-roadmaps
description: "Rules for plan documents and roadmaps: where plan files live, progress stamps, state directories, phased plans, multi-session roadmaps. Load before writing, executing, stamping, or moving a plan: the plan-mode file, any .md under .claude/plans/, or a PLAN*.md / TODO.md being executed."
---

# Plans and Roadmaps v1.4.0

These rules apply to the plan-mode plan file, any `.md` under a
`.claude/plans/` directory, and any `PLAN*.md` or `TODO.md` you are executing
against. Do not commit them unless asked.

## Plan file location

Never move or rename the plan-mode plan file. It stays at the path plan
mode gives you, by default `~/.claude/plans/<slug>.md`; move it and a later
turn reports that no plan exists and offers to write a new one. Below,
`~/.claude/plans/<slug>.md` stands for that path, wherever it is. Once a
plan is approved, symlink it into the repository, worktree, or sub-repo
that the plan targets, under a name that means something (a roadmap is
copied instead; see Roadmap plans). Never overwrite what is already there:

    mkdir -p <target>/.claude/plans
    link=<target>/.claude/plans/<topic>.md
    if test -e "$link" || test -L "$link"; then
      echo "taken: $link"
    else
      ln -s ~/.claude/plans/<slug>.md "$link"
    fi

- Choose the target by which files the plan edits. A plan spanning several
  repos, or touching only workspace-level tooling, belongs at the workspace
  root instead.
- **Link wherever the plan-mode file lives.** A `plansDirectory` setting
  can put it inside the repo; link it the same way, with its absolute path.
  Never move or rename it while active.
- **Plan-mode directory is the state root.** If the plan-mode file sits
  directly in `<target>/.claude/plans/` or one of its state directories,
  its slug files mix with the plans and never get cleaned up. Tell the
  user once and suggest a separate directory, such as
  `"plansDirectory": ".claude/plan-mode"`, or removing the setting. If they
  keep it, still link: slug-named files there are plan-mode files, and only
  topic-named entries count as plans.
- `<topic>` is the plan's subject in snake_case. The generated `<slug>` may
  start with words from the prompt, but it is not a topic name; choose
  `<topic>` yourself and do not transliterate the slug.
- **On `taken`:** if the name is already a link to this same plan-mode
  file, the step is done. Otherwise ask the user; with their OK, use the
  date suffix from Plan states (`<topic>-2026-09-30.md`). Do not add `-f`
  to `ln`: it would replace a real file and lose it.
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
- **In-repo plan-mode directory.** When the plan-mode file is inside the
  target repo but outside `.claude/plans/`, check its directory too. If
  `git ls-files` shows it tracked, leave it alone. If it is untracked and
  `git check-ignore -q` fails, ask before adding it to `info/exclude`.
- Nothing travels with the branch. A reviewer, CI, or a fresh clone sees
  nothing. Moving a plan out of the top level replaces its link with a
  real copy (see Plan states below); that copy is a record, not the plan.
  An idle link is also frozen into a real file in place, before cleanup
  (see Check the link first).
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

A plan that is a real file just moves, unless it is the plan-mode file
itself (see Plan file location):

    mkdir -p <dir>/paused && mv <dir>/<topic>.md <dir>/paused/

- **Untracked plans only.** State moves apply to untracked plans. For a
  tracked plan, ask before moving it.
- **Keep the filename.** Use `git mv` if the file is tracked, so history
  follows it; else plain `mv`. Plans are usually untracked, and `git mv`
  fails on untracked files.
- **Leaving the top level makes a real file.** Claude Code deletes files in
  `~/.claude/plans/` once they are older than `cleanupPeriodDays` (default
  30), so a link in any state directory would soon dangle. A
  `plansDirectory` inside the repo is not cleaned up, but copy anyway, so
  the record never depends on a file the user may prune. On every move
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
  more. A frozen plan (see Check the link first) is already a real file
  at the top level, so it simply continues. To re-plan it in plan mode
  instead, first move the old copy to `superseded/` with a state line
  naming the new plan, then link the new plan-mode file as Plan file
  location describes.
- **Name collision:** if the destination already holds that name (common for
  a bare `PLAN.md`), append today's date: `PLAN-2026-09-30.md`.
- `TODO.md` never moves, whatever its state.
- Update any references to the old path in other documents.
- **Legacy names:** when you find an untracked
  `PLAN_IN_PROGRESS-<topic>.md` or `PLAN_COMPLETED-<topic>.md`, name it
  and propose migrating it: strip the prefix, and move a completed one
  into `completed/` (bare `PLAN_COMPLETED.md` becomes
  `completed/PLAN.md`). Migrate only after the user agrees. Leave tracked
  ones alone.

### Check the link first

Cleanup also reaches active plans: a linked plan, or a running roadmap
phase link, left idle for a month loses its plan-mode file. So whenever
you start work on, stamp, or resume a plan that is a link, check it
first:

- **Broken link** (`test -L` true, `test -e` false): the plan-mode file
  was cleaned up. Tell the user the plan text is gone, and that session
  transcripts age out under the same rule, so they cannot restore it.
  Leave the link, and do not write a new plan unless asked. Offer to
  re-plan it in plan mode, then replace the dangling link with the new
  one.
- **Old link or target:** freeze the plan in place into a real file, and
  tell the user once:

      link=<dir>/<topic>.md
      src=$(readlink -f "$link")
      if test -n "$(find "$link" "$src" -mtime +20)"; then
        cp "$src" "$link.tmp" && mv "$link.tmp" "$link"
      fi

  The docs do not say which timestamp cleanup uses. `find` without `-L`
  tests the link's own mtime, set at approval and never changed, since
  edits go through to the target; the target's mtime covers the last
  edit. Checking both covers either clock. `mv` replaces the link itself,
  not its target. Works with GNU and BSD `find`.
- **Add a state line** under the title of a frozen plan, with the time
  from `date`. Edit the frozen file directly from then on, as after
  Resume; never edit the old plan-mode file again.

      > Frozen 2026-10-13 14:02 before plan-mode cleanup. Copied from ~/.claude/plans/<slug>.md

- **Threshold:** 20 days leaves margin under the default
  `cleanupPeriodDays` of 30. If the user's setting is known to differ,
  freeze at two thirds of it. Do not parse settings files to find out.
- **Skip both checks** for a link whose target is inside the repo: an
  in-repo `plansDirectory` is never cleaned up.

## Commit message in plans

Every plan ends with a suggested commit message, either as a final
`## Commit message` section or inside the last step. Use a fenced block so it
can be copied verbatim.

- Draft it when writing the plan, from the intended changes.
- After execution, revise it to match what actually changed (check
  `git diff --stat`); a plan-time draft often drifts from the real diff.
- The message is a suggestion, not an instruction to commit. Never run
  `git commit` unless the user explicitly asks, or the plan's run-mode line
  says Auto-commit (see the `auto-commit` skill); plan approval, "proceed"
  and "go ahead" are not requests to commit.
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
- **Auto-commit run mode.** When the plan carries
  `> Run mode: Auto-commit` under its title, commit the phase with its
  message and continue to the next one, stopping only as the `auto-commit`
  skill says. The `> Phased plan:` stop line stays; the run-mode line sits
  under it and overrides only the waiting. If the `auto-commit` skill is
  not installed, treat the line as Pause: stop and wait as usual, and tell
  the user once why. Its safeguards live only in that skill.
- **Write the stop rule into the plan.** Approval can clear the context and
  start work from the plan alone, without this skill. So every phased plan
  carries this line under its title, with the real plan-mode path (a
  roadmap and its phase plans use their own lines; see Roadmap plans):

      > Phased plan: stop after each phase, show its commit message, and wait. Plan file: ~/.claude/plans/<slug>.md

  The line stays true for the plan's whole life; never remove it.
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
  which it is. In Auto-commit run mode, such changes are a hard gap: stop
  and ask the same way, and never commit them.
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

Keep one directory per roadmap:

    <target>/.claude/plans/<topic>/roadmap.md
    <target>/.claude/plans/<topic>/phase_2_<subject>.md

- `roadmap.md` is a **real file**, copied from its plan-mode file on
  approval. It never depends on `~/.claude/plans/` after that.
- `phase_N_<subject>.md` is a **link** to its plan-mode file while the
  phase runs, per Plan file location, and a real copy once the phase
  finishes.
- Plan states apply to the whole `<topic>/` directory, not single files:
  `mv .claude/plans/<topic> .claude/plans/completed/`. Finished phases are
  already copies, so nothing is left to copy. If a phase link remains
  (the roadmap is paused or dropped mid-phase), replace it with a copy
  first, as Plan states describes. Add the state line to `roadmap.md`
  only.

**The roadmap is the only memory a fresh session gets.** The chat is gone,
so the roadmap must hold:

- Under the title, the line that makes approval safe without this skill
  (see Phased plans), with the real paths:

      > Roadmap: after approval, copy ~/.claude/plans/<slug>.md to <target>/.claude/plans/<topic>/roadmap.md and stop. Do not start Phase 1.

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
- `roadmap.md` is a real file; edit it directly.

**Writing the roadmap.** After it is approved, copy the plan-mode file
into `<topic>/roadmap.md`, never over an existing file or link:

    dir=<target>/.claude/plans/<topic>
    mkdir -p "$dir"
    if test -e "$dir/roadmap.md" || test -L "$dir/roadmap.md"; then
      echo "taken: $dir/roadmap.md"
    else
      cp ~/.claude/plans/<slug>.md "$dir/roadmap.md"
    fi

- On `taken`, ask the user what to do; never overwrite.
- In `roadmap.md`, replace the `> Roadmap: after approval …` line with
  `> Copied from ~/.claude/plans/<slug>.md`. Left in place, it would tell
  every later session to copy and stop again.
- Git-ignore `.claude/plans/` as Plan file location describes.
- From now on, edit `roadmap.md` directly. Re-entering plan mode in this
  session rewrites only the old plan-mode file, which nothing reads any
  more; never edit it, as Plan states describes.
- Stop. Do not start Phase 1 in the same session.

**Planning phase N** (user asks, in plan mode, in a fresh session):

1. Read `roadmap.md`: Decisions and every earlier outcome. Read an earlier
   phase plan only when an outcome points to it.
2. Run the baseline check from Phased plans before planning.
3. Write the phase plan: under the title, the line below with real paths;
   then a `## Context` section quoting the decisions and outcomes it depends
   on, then `### Step N.M` items, then `### Phase N commit message`.

       > Roadmap phase N of <target>/.claude/plans/<topic>/roadmap.md: after approval, link this plan as phase_N_<subject>.md, implement, write the Phase N outcome there, and stop. Plan file: ~/.claude/plans/<slug>.md

4. If the phase is too big for one commit, propose splitting it into
   `Phase 2a` and `Phase 2b` and plan only the first.
5. After approval, symlink it as `phase_N_<subject>.md`, link to it under
   the Phase N heading in `roadmap.md`, then implement. Plan mode can only
   write the plan file, so roadmap edits wait until after approval.

**Finishing phase N:**

1. Stamp each step in the phase plan (through its plan-mode file, while
   it is still a link), then the Phase N heading in `roadmap.md`.
2. Write `### Phase N outcome` in `roadmap.md`.
3. Replace the phase link with a real copy, in place. This is the freeze
   from Check the link first, without the age test:

       p=<target>/.claude/plans/<topic>/phase_N_<subject>.md
       src=$(readlink -f "$p")
       cp "$src" "$p.tmp" && mv "$p.tmp" "$p"

   `mv` replaces the link itself, not its target. Replace the
   `> Roadmap phase N …` line with `> Copied from ~/.claude/plans/<slug>.md`.
   Later edits, such as a revised commit message, go to the copy.
4. Stop, show the phase's commit message, and wait, per Phased plans. In
   Auto-commit run mode, commit the phase with its message first, then
   stop. Never plan or start the next phase.

Phase plans stay in `<topic>/`, as real files, until the whole roadmap is
complete.
