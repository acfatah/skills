---
name: plans-and-roadmaps
description: "Rules for plan documents and roadmaps: where plan files live, whether a plan runs in a worktree, which session a plan is written in, progress stamps, state directories, phased plans, multi-session roadmaps. Load before writing, executing, stamping, or moving a plan: the plan-mode file, any .md under .claude/plans/, or a PLAN*.md / TODO.md being executed."
---

# Plans and Roadmaps v1.10.0

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
- **Worktree plans live in the main checkout.** When the plan runs in a
  linked worktree, `<target>` is the main checkout, not the worktree. See
  Worktrees.
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

## Worktrees

Claude uses `EnterWorktree` on its own only when asked, so it never offers
isolation. Ask instead, so the user decides whether a plan runs in a linked
worktree or in the current checkout.

**When to ask:**

- **At plan approval,** before calling ExitPlanMode, so the answer goes
  into the plan.
- **Before executing a plan** that has no `> Worktree:` line yet.
- **While planning a roadmap.** Ask once; every phase uses the answer (see
  Roadmap plans).

**Skip the question,** and write no line, when:

- **Already in a linked worktree:** `git rev-parse --absolute-git-dir`
  differs from `git rev-parse --path-format=absolute --git-common-dir`.
- **Not in a git repo.**
- **Nothing tracked changes:** the plan edits only ignored files or files
  outside the repo. A plan that adds new tracked files still asks.
- **One file:** the plan edits exactly one file.

**The question.** Ask in the same AskUserQuestion call as the `auto-commit`
run-mode question, never as a second prompt. Offer:

- **No worktree** (default): run in the current checkout. Always first.
- **Worktree from HEAD:** a new branch at `.claude/worktrees/<topic>`,
  based on the current local HEAD.
- **Worktree from origin/<base>:** the same path, based on the detected
  remote base branch, e.g. "Worktree from origin/main".

Show the real base, branch and path in each option. The branch is
`worktree-<topic>` when the option uses the built-in tool, else
`<type>/<topic>` (e.g. `feat/<topic>`); see Built-in or git below.

**Option order follows `worktree.baseRef`.** It is the setting that picks
the base of the built-in `EnterWorktree name=`: `fresh` (the default)
branches from `origin/<default-branch>`, `head` from local HEAD. Read it
from the main checkout; the first file that sets it wins, and none means
`fresh`:

```bash
for f in .claude/settings.local.json .claude/settings.json ~/.claude/settings.json; do
  v=$(jq -r '.worktree.baseRef // empty' "$f" 2>/dev/null)
  [ -n "$v" ] && { echo "$v"; break; }
done
```

- **`fresh`:** Worktree from origin/<base> comes before Worktree from HEAD.
- **`head`:** Worktree from HEAD comes first.
- **Only this key.** This is the one setting the skill reads from settings
  files.
- **No `jq`:** the loop prints nothing, which reads as `fresh`. Read the
  three files instead.

**Base detection.** Prefer the repo's default branch, without fetching
(plan mode cannot write refs). First match wins:

```bash
b=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
if [ -z "$b" ] && gh auth status >/dev/null 2>&1; then
  b=$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null)
fi
if [ -n "$b" ] && git rev-parse --verify --quiet "refs/remotes/origin/$b" >/dev/null; then
  echo "default $b"
else
  for b in dev development main master; do
    git rev-parse --verify --quiet "refs/remotes/origin/$b" >/dev/null && { echo "fallback $b"; break; }
  done
fi
```

- **`default`** means the base is the default branch; **`fallback`** means
  the default branch is unknown, so the base may not be it.
- **Missing `origin/HEAD`** falls through to `gh`, then the loop. Outside
  plan mode, `git remote set-head origin -a` sets it.
- **Hide the option** when nothing matches or there is no `origin`
  remote, and say so in one line, e.g. "Worktree from origin is hidden:
  no origin/HEAD, and no origin/dev, development, main or master ref."

**Built-in or git.** Use the built-in `EnterWorktree name=<topic>` when
the chosen base is what `worktree.baseRef` gives it:

- **`fresh`** and Worktree from origin/<base>, with a `default` base.
- **`head`** and Worktree from HEAD.

Every other case uses `git worktree add`, such as a `fallback` base, or
an origin base under `head`. Use git for a matching case too when the repo
or the user requires `<type>/<topic>` branch names, for example in
`CLAUDE.md` or a branch-name check in CI.

- **What the built-in does:** `name=<topic>` creates the branch
  `worktree-<topic>` at `.claude/worktrees/<topic>`, with no upstream. A
  `/` in the name becomes `+` in both, so use a plain `<topic>`.
- **Why prefer it:** a worktree created with `name=` gets the exit-time
  keep-or-remove prompt, `ExitWorktree action=remove`, and the
  `WorktreeCreate`/`WorktreeRemove` hooks. One entered with `path=` gets
  none of these.

**Dirty tree.** Only when `git status --short` is not empty and the user
may pick a worktree, add a question to the same call: what happens to the
uncommitted changes. Untracked files count; ignored files do not.

- **Leave behind** (default): the worktree starts clean.
- **Copy:** the changes stay in the main checkout and also appear in the
  worktree:

      git stash push -u
      git -C <wt> stash apply
      git stash pop

  Stashes are shared between worktrees, so the last `pop` restores the
  main checkout.
- **Move:** the changes leave the main checkout:

      git stash push -u
      git -C <wt> stash pop

- **Carried edits are the user's.** In the worktree, `auto-commit`'s
  dirty-tree check reports them like any other uncommitted change.
- **Remote base:** the changes were made against HEAD, so `stash apply`
  or `pop` in a worktree from origin/<base> may conflict. On conflict,
  stop and report. For Move, nothing is lost: `pop` keeps the stash in
  the list when it conflicts.

**Recording.** Write the answer as a line under the title, below the stop
line and the run-mode line. Write `none` too, so execution does not ask
again:

    > Worktree: feat/<topic> from <sha> at <main>/.claude/worktrees/<topic>; carry: copy. Create it if missing, then EnterWorktree with path. See the plans-and-roadmaps skill.
    > Worktree: feat/<topic> from origin/dev at <main>/.claude/worktrees/<topic>; carry: leave. Create it if missing, then EnterWorktree with path. See the plans-and-roadmaps skill.
    > Worktree: built-in worktree-<topic> from origin/main at <main>/.claude/worktrees/<topic>; carry: leave. EnterWorktree name=<topic>, or path= if it exists. See the plans-and-roadmaps skill.
    > Worktree: none.

`<sha>` is the HEAD at approval, `<main>` the absolute main-checkout path,
and `carry` is `leave`, `copy` or `move`. A remote base is recorded as its
ref, not a SHA, because the SHA is only known after the fetch. A built-in
line under `head` reads `from <sha>`, like the first example.

**Creating and entering.** After approval, before the first edit:

1. Git-ignore `.claude/worktrees/`: unless `git check-ignore -q
   .claude/worktrees/` succeeds, append it to
   `git rev-parse --git-path info/exclude`, as for `.claude/plans/`.
2. **Built-in line:** call `EnterWorktree name=<topic>`. No fetch and no
   `git worktree add`; the tool picks the base itself.

   - **Check the base** right after entering: for `from origin/<base>`,
     `git merge-base --is-ancestor origin/<base> HEAD`; for `from <sha>`,
     `git rev-parse HEAD` must equal `<sha>`. On a mismatch (the setting
     or HEAD changed since approval), stop and ask.
   - **The tool refuses** when the session is already in a worktree, or
     was launched outside the repo. Fall back to the git commands below,
     with the recorded branch name `worktree-<topic>`, then
     `EnterWorktree path=`. Say so in the final report: this worktree
     gets no exit prompt.

3. **Git line:** create the worktree with git:

       git worktree add -b <type>/<topic> <main>/.claude/worktrees/<topic> <sha>

   For a remote base, fetch it first and never track it:

       git fetch origin <base>
       git worktree add --no-track -b <type>/<topic> <main>/.claude/worktrees/<topic> origin/<base>

   - **`--no-track` is required.** With the default
     `branch.autoSetupMerge`, a remote-tracking start point becomes the
     new branch's upstream, so a later `git push` or Auto-PR would target
     `dev` or `main`.
   - **Fetch fails** (offline, auth): stop and ask. Offer to use the
     existing `origin/<base>` ref as is, or to switch to Worktree from
     HEAD.

   Then carry the changes as recorded, and call `EnterWorktree` with
   `path=<main>/.claude/worktrees/<topic>`.

4. **Carry on a built-in line:** run `git stash push -u` before the
   `EnterWorktree name=` call. After it, the session is in the worktree:
   run `git stash apply` there, then `git -C <main> stash pop` for Copy;
   just `git stash pop` there for Move.

A fresh session, such as after a context clear, follows the line: if the
path exists, enter it with `path=`, for a built-in line too; if not,
create it first. Carry changes only when creating it.

- **Only this session's `name=` worktree** gets the exit prompt and
  `ExitWorktree action=remove`. Re-entered with `path=`, a built-in
  worktree behaves like a git one.

**Plan files stay in the main checkout.** The link, `completed/` copies and
roadmap directories go to `<main>/.claude/plans/`, so removing the worktree
cannot delete them. Find `<main>` from inside the worktree with:

```bash
if [ "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" ]; then
  git worktree list --porcelain | sed -n '1s/^worktree //p'
else
  git rev-parse --show-toplevel
fi
```

Writes outside the worktree may ask for permission; that is expected.

**Finishing.** Stay in the worktree. The final report names its path and
branch, and points to the `post-merge-cleanup` skill for after the merge.
Never call `ExitWorktree` or remove the worktree unless asked.

- **Auto-PR:** a new worktree branch has no upstream, from `git worktree
  add --no-track` and from the built-in alike, so `auto-pr` is offered on
  its no-upstream path and creates `origin/<branch>` at the first clean
  finish (see the `auto-pr` skill).
- **Removal:** a worktree entered with `path=` is never removed by
  `ExitWorktree` or the exit prompt. After the merge, `post-merge-cleanup`
  removes it, built-in or not.

## Parallel sessions

These rules assume one session per plan. Before executing a plan or
roadmap phase that carries a `> Sessions:` line under its title, or whose
branch has another active session, load the `session-sync` skill and
run its sync step first. It owns the sessions file, forks and merging
back; this skill still owns the plan.

## Plan where the tools load

Some tools load only in a session started in a given directory, and only
at startup. For example, a project `.mcp.json` loads only from the launch
directory. Nothing loads them mid-session, so a plan written elsewhere is
drafted without them, and its approval prompt appears in a session that
must not run it.

**When:** before entering plan mode, or as soon as it shows up. The
trigger is work that needs such a tool while this session does not have
it: it is missing from `/mcp`, or its `.mcp.json` sits in another
directory.

**Skip** when the work does not need the tool, or the current session
already has it.

**Hand off instead of planning:**

1. **Setup only.** Do only what the new session needs to start. If the
   directory does not exist yet, for example a new worktree, ask the
   worktree question now and create it as Worktrees describes. Nothing
   else.
2. **Write a brief** to `<main>/.claude/handoffs/<topic>.md`. It holds
   the goal, the decisions so far with their reasons, findings with
   paths, open questions, and what the new session must check with the
   tool. Git-ignore `.claude/handoffs/` via `info/exclude`, as for
   `.claude/plans/`.
3. **End the turn** with the launch command and the first prompt. The
   command is one line, with absolute paths and `--add-dir` for every
   other directory the work edits. The prompt is: "Enter plan mode and
   plan from `<brief path>`."

- **Not a plan.** Never put the brief under `.claude/plans/`, or write it
  as an approvable plan. A fresh session could otherwise treat it as
  approved and start executing.
- **Already in plan mode** when this shows up: plan mode can only write
  the plan file, so write the brief there, under this stop line:

      > Handoff brief: do not execute here. After approval, copy it to <brief path> and give the launch command.

  Then call ExitPlanMode, and after approval do only that.
- **In the new session:** read the brief and confirm the tool is loaded.
  Then plan as usual, which asks the worktree and run-mode questions.
  Quote the brief in the plan's `## Context`. Once the plan is approved,
  delete the brief; the plan now holds its content.
- **Roadmaps:** record the launch directory under `## Decisions`, so
  every phase session starts there.
- **Do not claim** the tool is loaded in the current session.

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
  says Auto-commit or Auto-PR (see the `auto-commit` and `auto-pr`
  skills); plan approval, "proceed" and "go ahead" are not requests to
  commit.
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
- **Auto-PR run mode.** The line
  `> Run mode: Auto-PR (upstream: …)` runs as Auto-commit, then follows
  the `auto-pr` skill at a clean finish: push the branch and open or
  update a draft PR. If `auto-pr` is not installed, treat the line as
  Auto-commit when `auto-commit` is installed, else as Pause, and tell the
  user once why.
- **Write the stop rule into the plan.** Approval can clear the context and
  start work from the plan alone, without this skill. So every phased plan
  carries this line under its title, with the real plan-mode path (a
  roadmap and its phase plans use their own lines; see Roadmap plans):

      > Phased plan: stop after each phase, show its commit message, and wait. Plan file: ~/.claude/plans/<slug>.md

  The line stays true for the plan's whole life; never remove it. The
  run-mode line and the `> Worktree:` line (see Worktrees) follow it, in
  that order.
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
  which it is. In Auto-commit or Auto-PR run mode, such changes are a hard
  gap: stop and ask the same way, and never commit them.
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
- **One topic branch** for all phases, recorded under `## Decisions`,
  unless the roadmap says its phases merge on their own. Under Auto-PR the
  phases then share one draft PR.
- **The worktree answer,** recorded under `## Decisions` next to the topic
  branch: its branch, base (a SHA or `origin/<base>`) and path, or none
  (see Worktrees). Phase 1 creates it; later phases enter it.
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

   Below it, copy the run-mode line and a `> Worktree:` line built from the
   roadmap's Decisions, so a fresh session re-enters the same worktree. Do
   not ask the worktree question again.

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
   stop. In Auto-PR run mode, commit, write the outcome, push and open or
   update the PR (see the `auto-pr` skill), then stop. When that push
   created the upstream, drop `, to create` from the run-mode line in the
   phase plan and in the roadmap's Decisions. Never plan or start the next
   phase.

Phase plans stay in `<topic>/`, as real files, until the whole roadmap is
complete.
