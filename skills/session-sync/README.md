# session-sync

An [agent skill](https://skills.sh) that keeps several Claude Code sessions
on one branch or PR in sync, such as forks of one parent. Each session's
context goes stale as soon as another one changes the repo, so the skill
syncs through files instead: git for code, the plan for intent, and a
shared sessions file for who is doing what. A single session resuming after
a break gets only a recap, checked against the repo.

## What it is

- **Recaps from the repo, not the transcript.** On "outline progress" or
  "catch up", it checks `git status`, recent commits, the upstream, the
  plan and the tests first. The recap has a fixed shape: Goal, Done, In
  progress, Drift, Waiting on me, Next step.
- **Stays light for one session:** no questions and no files, unless you
  stop with no plan to resume from; then it offers a one-row handoff file.
- **Keeps a sessions file** at `<main>/.claude/sessions/<topic>.md` in the
  main checkout, git-ignored through `info/exclude`. It holds the topic
  branch, a row per session (branch, worktree, owned paths, status, last
  sync), shared Decisions, a Merge log and Handoffs.
- **One writer per row.** Each session edits only its own row and appends
  to the shared sections. The rule is written into the file, so a session
  without the skill loaded still sees it.
- **Puts forks on sub-branches,** `<topic-branch>--<role>`, each in its own
  worktree at `<main>/.claude/worktrees/<topic>--<role>`.
- **Asks the integration strategy once per topic,** at the first fork:
  **Merge** (default, `--no-ff`), **Rebase** or **Squash**.
- **Syncs before acting:** re-reads the sessions file and plan, fetches,
  lists new commits on the topic branch and sibling sub-branches, flags
  those that touch its owned paths, and reports Drift.
- **Merges back on request,** per the recorded strategy, and logs it.
  Others pick it up at their next sync.

## What it is not

- **Not shared memory.** It never syncs sessions through memory, which
  loads only at session start.
- **Not a plan manager.** Plans, stamps and outcomes stay with
  [`plans-and-roadmaps`](../plans-and-roadmaps); this skill adds only a
  `> Sessions:` line to a plan.
- **Not a committer or pusher.** Commits follow
  [`auto-commit`](../auto-commit) and pushes [`auto-pr`](../auto-pr).
  Merging a fork back is always asked.
- **Not a conflict resolver.** On a merge conflict it stops and asks, and
  never resolves another session's owned paths.
- **Not automatic.** A session syncs when it resumes, after a gap, or when
  you say "sync"; nothing notifies it of another session's change.

## When not to use

- **A single quick task with no break** → just ask; there is nothing to
  sync.
- **Plan bookkeeping** (stamps, phases, moving a plan) → use
  `plans-and-roadmaps`.
- **Cleaning up worktrees and branches after the merge** → use
  [`post-merge-cleanup`](../post-merge-cleanup).

**Negative example:** "Rename this variable" does not need it; one session,
no break, nothing another session could have changed.

## Install

```bash
bunx skills add acfatah/skills -s session-sync -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/session-sync" ~/.claude/skills/session-sync
```

## Usage

### How it loads

- **By description match.** Forking a session, a second session on the
  same branch or PR, resuming after a break, merging a fork back, or
  "sync", "catch up", "what changed", "outline progress", "merge the fork
  back".
- **Reliably, with a `CLAUDE.md` pointer:**

  ```markdown
  ## Parallel sessions

  When forking a session, starting a second session on the same branch
  or PR, or resuming after a break, load the `session-sync` skill.
  ```

- **By name, always.** `/session-sync …` or "use the session-sync skill".
- **What Claude asks back:** nothing for a single-session recap. At a
  fork: sub-branch or shared branch, the integration strategy (first fork
  only) and the owned paths, in one prompt. Before merging back: who
  merges. On a conflict, an ownership clash, or a dirty topic checkout:
  how to proceed.

### Example prompts

- **Resume:** "Outline progress and next steps." / "Catch up: what changed
  since yesterday?"
- **Fork:** "Fork this session to work on tests." Run it in the forked
  session.
- **Sync:** "Sync with the other sessions."
- **Merge back:** "Merge the api fork back."
- **Hand off:** "I'm stopping for today." Claude writes your Handoffs
  entry, or offers a one-row file when there is no plan.
- **By name:** "/session-sync finish the topic, the PR is merged."

### Walkthrough

1. **Parent** works on `feat/login` in its worktree.
2. **Fork** the session and say "work on tests". The fork asks where to
   work, the strategy and its owned paths, creates `feat/login--tests` at
   `.claude/worktrees/login--tests`, and writes the sessions file with
   both rows.
3. **Both** commit in their own worktrees. Each syncs before acting and
   updates only its own row.
4. **Merge back:** "merge the tests fork back". The fork syncs, merges into
   `feat/login` with `--no-ff`, and appends to the Merge log.
5. **Parent** sees the merge at its next sync. When the PR merges, the
   sessions file moves to `completed/`, and `post-merge-cleanup` removes the
   worktrees.

Gotchas:

- **The merge runs in another session's checkout.** Merging into the topic
  branch happens where it is checked out, often the parent's worktree.
  Claude stops if that checkout has uncommitted changes.
- **Rebase rewrites the fork's commits.** Claude refuses it on a pushed
  sub-branch unless you confirm.
- **Concurrent edits to the sessions file.** Each session re-reads the file
  right before editing its own line; two edits in the same instant can
  still race.
- **Forks start stale.** A fork inherits its parent's beliefs; it syncs
  first, before acting.
- **Shared branch means taking turns.** Git refuses two worktrees on one
  branch, so parallel work needs sub-branches.

The full rules are in [`SKILL.md`](SKILL.md).
