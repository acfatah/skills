---
name: session-sync
description: "Keep several Claude sessions on one branch or PR in sync, and recap from the repo, not the transcript, after a break: forks on sub-branches, a shared sessions file, and a sync step before acting. Load when forking a session, starting a second session on the same branch or PR, resuming after a break, merging a fork back, or when the user says \"sync\", \"catch up\", \"what changed\", \"outline progress\", or \"merge the fork back\"."
---

# Session Sync v1.1.1

A session's context is private and goes stale as soon as another session,
or the user, changes the repo. Do not sync memories, which load only at
session start; sync through files.
Git is the source of truth for code, the plan for intent, and a sessions
file for who is doing what right now. Every session reads before it acts,
not only writes after it acts.

## Scope and terms

- **Session:** one Claude Code conversation, named by its role, such as
  `login-api`.
- **Fork:** a session started from another one's context. It inherits the
  parent's beliefs, which are stale until it syncs.
- **Topic branch:** the PR branch, the integration point, such as
  `feat/login`.
- **Sub-branch:** a fork's own branch off the topic branch, named
  `<topic-branch>--<role>`, such as `feat/login--api`.
- **`<topic>`:** the subject in snake_case. Use the plan's `<topic>` when
  a plan exists, else the topic branch's last segment.

The skill applies in two cases:

- **One session resuming** after a break: see Single session. Most loads
  end there.
- **Two or more sessions** sharing a branch or PR, at the same time: the
  rest of this file.

## Single session (resume)

Recap triggers such as "outline progress" or "catch up" load this skill in
every repo, so this path stays light: **no questions, no files**.

1. **Check for a sessions file.** If `<main>/.claude/sessions/` holds a
   file whose `## Topic branch` names the current branch, this is not a
   single session; run the Sync step instead.
2. **Sync lightly:**

   ```bash
   git status --short
   git log --oneline -10
   git fetch --quiet && git log --oneline HEAD..@{u}
   ```

   Skip the fetch line when the branch has no upstream. Re-read the plan,
   if any, and re-run the tests for what the session touched. Say which
   checks were not run.
3. **Recap** in this shape, from the checked state, not from memory:
   - **Goal:** what we are working toward, in one line.
   - **Done:** finished items, verified against the current state.
   - **In progress:** partial or uncommitted work, with paths.
   - **Drift:** anything that changed since the session last looked, or
     that no longer matches what it believed.
   - **Waiting on me:** decisions or open questions for the user.
   - **Next step:** the single thing to do first.

**Lazy handoff.** When the user stops for a while and there is no plan to
resume from, offer once to write a one-row sessions file as the handoff
(see End-of-session handoff). Write it only if they agree.

## Sessions file

One file per topic, in the **main checkout**, so every worktree uses one
absolute path and removing a worktree cannot delete it:

    <main>/.claude/sessions/<topic>.md

Find `<main>` with `git worktree list --porcelain`: the path on its first
`worktree` line is the main checkout, from any worktree and from the main
checkout itself.

**Writing it from a worktree.** A worktree-isolated session cannot write
to `<main>`: Claude Code's guard refuses Edit, Write and `git -C <main>`
there, without a permission prompt. Make a round trip instead:
`ExitWorktree action=keep`, write the file from the main checkout, then
`EnterWorktree path=<wt>` back.

- **Group the writes,** such as your row and a Decisions line, into one
  trip.
- **Allowed, though `ExitWorktree` is otherwise asked-only:** the session
  returns at once, and the worktree stays.
- **Fallback:** if the exit fails or a write is still refused, skip it
  and report the exact change, for the user to make with `!` or from a
  main-checkout session.
- **Re-entry fails:** stop and ask. The session is now in the main
  checkout, so going on would put the fork's edits there.
- **No shell workarounds,** such as `sed -i`, `cat >>` or `mv` on `<main>`
  paths.
- **In a background fork,** the round trip lands back in the guarded
  checkout. Hand the write to the parent instead, as the
  `plans-and-roadmaps` skill's Background forks section describes.

- **Git-ignore it.** Unless `git check-ignore -q .claude/sessions/`
  succeeds, append `.claude/sessions/` to
  `git rev-parse --git-path info/exclude`, not the tracked `.gitignore`.
- **Created lazily:** when a second session joins (see Starting a fork),
  or as a one-row handoff (see Single session). Never for a single session
  that is not stopping.
- **Point the plan at it.** When a plan exists, add one line under its
  title, below the other `>` lines:

      > Sessions: <main>/.claude/sessions/<topic>.md

  Re-read the plan first and insert only that line with one Edit; edit a
  linked plan through its plan-mode file, per `plans-and-roadmaps`. This
  is the only plan edit this skill makes.
- **A real file.** Edit it directly.

Template, with times from `date '+%Y-%m-%d %H:%M'`:

```markdown
---
created: 2026-10-22 14:50
updated: 2026-10-22 14:50
---

# Sessions: login

> Sessions file: edit only your own row and your own Handoffs entry; append to Decisions and Merge log; never rewrite another session's entries. Sync before acting. See the session-sync skill.

## Topic branch

- **Branch:** feat/login, checked out at /abs/repo/.claude/worktrees/login
- **Integration:** merge
- **Plan:** /abs/repo/.claude/plans/login.md

## Sessions

| Session | Branch | Worktree | Owns | Status | Last sync |
|---|---|---|---|---|---|
| login-main | feat/login | /abs/repo/.claude/worktrees/login | src/ | active | 2026-10-22 14:50 |
| login-tests | feat/login--tests | /abs/repo/.claude/worktrees/login--tests | tests/ | active | 2026-10-22 14:52 |

## Decisions

- 2026-10-22 14:52 (login-tests): fixtures live in tests/fixtures/.

## Merge log

- 2026-10-22 16:10 (login-tests): feat/login--tests into feat/login, merge, 3f2a9c1

## Handoffs

### login-tests

- Half-done: ...
- Next step: ...
- Verify: `bun test tests/`
```

- **Frontmatter:** set both times on creation; refresh `updated` on every
  edit; never change `created`.
- **Status values:** `active`, `paused`, `blocked: <on what>`, `done`.
- **Owns:** paths this session may edit, agreed with the user. Shared
  files, such as a lockfile, belong to one session or to none.
- **Decisions:** shared across sessions, one line each with time and
  session. When a roadmap exists, link to its `## Decisions` instead of
  copying them; add here only what concerns the sessions themselves.
- **Plan:** the plan's path, or `none`.

### One writer per row

- **A session edits only its own row** and its own `### <session>` entry
  under Handoffs.
- **It appends** to Decisions and Merge log, and never rewrites or deletes
  another session's lines.
- **The session that creates the file** may add a row for each session
  already active, such as the parent. From then on, each row belongs to its
  session.
- **Re-read the file right before each edit,** and change only your own
  line, so a concurrent edit by another session is not overwritten. Two
  edits in the same instant can still race.
- **The stop line carries the rule.** It sits under the title, so a
  session without this skill loaded still follows it. Never remove it.

## Starting a fork

When a session is forked to work on the same branch or PR, or a second
session starts on it:

1. **Sync first** (see Sync step), so the fork starts from the repo, not
   from inherited beliefs.
2. **Ask, in one AskUserQuestion call:**
   - **Where to work.** Offer, in this order:
     - **Sub-branch** (default when another session is active): a new
       `<topic-branch>--<role>` in its own worktree. Parallel and isolated;
       costs a merge step, and conflicts surface at merge time.
     - **Shared branch:** commit straight to the topic branch in the same
       checkout. No merging, but the sessions must take turns.
   - **Integration strategy,** only at the first fork of a topic, when the
     sessions file does not record one yet. Offer, in this order:
     - **Merge** (default): `git merge --no-ff` into the topic branch.
       Never rewrites history, so it is safe on pushed sub-branches. Costs
       merge commits.
     - **Rebase:** rebase the sub-branch onto the topic branch, then
       fast-forward. Linear history; rewrites the fork's commits.
     - **Squash:** `git merge --squash`, one commit per fork. Cleanest
       history; loses the fork's individual commits.
   - **Owned paths** for this session, with a suggestion based on its role.
3. **Create the worktree** for a sub-branch. Git-ignore
   `.claude/worktrees/` via `info/exclude` as above, then:

       git worktree add -b <topic-branch>--<role> <main>/.claude/worktrees/<topic>--<role> <topic-branch>

   Call `EnterWorktree` with that path. Git refuses two worktrees on one
   branch, which is why parallel forks need sub-branches.

   - **Git, not `name=`.** The base is the topic branch, which the
     built-in `EnterWorktree name=` cannot take; it starts from
     `worktree.baseRef`.
   - **Keep the path under `.claude/worktrees/`.** From inside another
     worktree, `EnterWorktree path=` only switches to worktrees under
     `.claude/worktrees/` of the same repo.
   - **The worktree you leave stops being writable** for this session.
     Re-enter it with `EnterWorktree path=` to write there again.
   - **`ExitWorktree` never removes it,** because it was entered with
     `path=`. After the merge, `post-merge-cleanup` does.
4. **Write the sessions file.** Create it from the template if missing,
   with the integration strategy under `## Topic branch` and the parent's
   row. Add this session's row. Add the `> Sessions:` line to the plan.
   From the new worktree, this needs a round trip (see Writing it from a
   worktree).
5. **Suggest a session name** matching the role, such as `login-tests`, so
   the user can find it in `/resume`.

## Sync step (read)

Run before acting after any gap, at the start of a resumed session, when
another session reports a merge, or when the user says "sync". Nothing
notifies a session of another one's change; it learns only by syncing.

1. **Re-read** the sessions file and the plan, if any.
2. **Fetch and list** what this branch does not have yet, each line as
   its own command:

   ```bash
   git fetch --quiet
   git log --oneline HEAD..<topic-branch>
   git for-each-ref --format='%(refname:short)' 'refs/heads/<topic-branch>--*'
   ```

   Then run `git log --oneline HEAD..<sub-branch>` once for each branch
   the last command lists. No loop: a worktree-isolated session refuses
   compound shell forms, such as `| while read`.

   Skip the fetch when there is no remote. Also check
   `HEAD..origin/<topic-branch>` when the topic branch is pushed.
3. **Flag commits touching owned paths:** add `-- <owned paths>` to the
   `git log` lines above. Each hit is a possible conflict; name it.
4. **Report Drift:** beliefs in this session's context that no longer
   hold, such as a file another session changed or a decision appended
   since the last sync. Read new Decisions and Merge log lines.
5. **Pick up others' work** only when the user agrees, or the Merge log
   shows a merge this session needs: `git merge <topic-branch>` into the
   sub-branch (Merge or Squash strategy), or `git rebase <topic-branch>`
   (Rebase strategy, unpushed sub-branch only).
6. **Update your row:** status and `Last sync` from `date`; refresh
   `updated`.

## Write step

After each chunk of work:

- **Commit** per the `auto-commit` rules when its run mode is on;
  otherwise suggest a commit message and wait.
- **Update your row:** status, and Owns if the user changed it.
- **Append decisions** that other sessions need to know.
- **Stamps and outcomes** stay in the plan, per `plans-and-roadmaps`.

## Merging back

When a sub-branch's piece is done:

1. **Ask who merges.** The user decides; default is the fork session.
   Ask in the same call for the strategy check below when it applies.
2. **Sync first,** and pick up the topic branch's new commits, so
   conflicts surface in the sub-branch.
3. **Find the topic checkout:**
   `git worktree list --porcelain` shows where the topic branch is
   checked out. If it is nowhere, ask where to merge.
4. **Go to the topic checkout.** A worktree-isolated session cannot run
   `git -C <topic-checkout>`; the guard refuses it. So move the session:

   - **It is `<main>`:** `ExitWorktree action=keep`.
   - **It is a worktree** under `.claude/worktrees/`:
     `EnterWorktree path=<topic-checkout>`.
   - **Check it is clean:** `git status --short` there must be empty; if
     not, go back, then stop and ask, since another session may be
     mid-edit there.
   - **Back afterwards:** `EnterWorktree path=<fork-worktree>`. This round
     trip is allowed, though `ExitWorktree` is otherwise asked-only.
   - **Fallback:** if the move fails, stop and give the user the commands
     below, to run with `!` or from the topic checkout's session. If the
     way back fails, stop and ask before any further edit.

5. **Integrate** per the recorded strategy, from the topic checkout:

   | Strategy | Commands |
   |---|---|
   | Merge | `git merge --no-ff <sub-branch>` |
   | Rebase | `git rebase <topic-branch>` in the sub-branch, before step 4; then `git merge --ff-only <sub-branch>` |
   | Squash | `git merge --squash <sub-branch>`, then commit with a message that summarizes the fork's commits |

   - **Rebase on a pushed sub-branch:** refuse unless the user confirms.
     Check with `git ls-remote --exit-code --heads origin <sub-branch>`;
     exit 0 means it is pushed.
6. **Append to Merge log:** time, session, sub-branch into topic branch,
   strategy, and the resulting short SHA. Set your row to `done`, or back
   to `active` for more work. When the topic checkout is `<main>`, write
   this before going back, so one trip covers it.
7. **Others pick it up** at their next sync; never merge into another
   session's sub-branch.

**On conflict, stop and ask.** Never resolve a conflict in another
session's owned paths. Offer `git merge --abort` to undo the attempt.

## End-of-session handoff

When the user stops for the day, or before a context clear, write your
`### <session>` entry under Handoffs:

- **Half-done:** uncommitted or partial work, with paths.
- **Next step:** the exact first action.
- **Verify:** commands that show the state, such as tests.

Set your row's status, such as `paused`. Skip the entry when a roadmap's
Phase outcome already says the same.

## Ownership conflicts

When this session needs a path another row owns, stop and ask:

- **Reassign:** append a Decisions line, such as "tests/api/ moves from
  login-api to login-tests". Add the path to your own row; the other
  session drops it from its row at its next sync.
- **Pause:** one of the sessions sets its own row to `paused` until the
  other is done.

## Finishing

When the topic branch is merged, or the user ends the topic:

1. **Confirm** that every session is done; ask about any row still
   `active`.
2. **Mark rows `done`.** At this point, with the user's OK, the finishing
   session may mark every row.
3. **Move the file:**

       mkdir -p <main>/.claude/sessions/completed
       mv <main>/.claude/sessions/<topic>.md <main>/.claude/sessions/completed/

   Add a state line under the title, with the time from `date`:
   `> Completed 2026-10-22 18:30.` From a worktree, do this step in a
   round trip (see Writing it from a worktree).
4. **Point to `post-merge-cleanup`** for the worktrees and sub-branches.
   Never remove a worktree, or call `ExitWorktree`, unless asked, apart
   from the round trips in Writing it from a worktree and Merging back.

## Relation to other skills

- **`plans-and-roadmaps`:** owns plans, stamps, outcomes, plan states and
  the worktree question for a plan. `session-sync` edits a plan only to
  add the `> Sessions:` line.
- **`auto-commit` and `auto-pr`:** own commits, pushes and PRs. Merging
  back is always asked, whatever the run mode.
- **`post-merge-cleanup`:** owns removing worktrees and branches after the
  merge.
