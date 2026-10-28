# auto-pr

An [agent skill](https://skills.sh) that adds an **Auto-PR** run mode to
[`auto-commit`](../auto-commit). Auto-commit only commits locally, so after
a multi-phase run you still push the branch and open the PR by hand.
Auto-PR commits each change the same way, then pushes the branch to its
upstream and opens or updates a draft PR once the run finishes cleanly.

## What it is

- **Auto-commit plus one step.** Everything in `auto-commit` still applies:
  the question, the baseline, staging by path, checks, gaps and the report.
- **Offered only when safe:** on a non-default branch that tracks a
  non-default upstream, with `gh` signed in. A branch with no upstream
  qualifies too, when the name is free on `origin`; the first push then
  creates `origin/<branch>`. On both paths, the upstream's remote must be
  the repo `gh` resolves to, and the PR base must exist on `origin`.
  Otherwise the option is hidden and Claude says which check failed.
- **Records the upstream, base and summary file** in the plan's
  `> Run mode:` line, so a fresh session checks the same branch, targets
  the same base and updates the same `drafts/PR_SUMMARY-<task>.md`.
  Without a plan, Claude states all three in chat when you pick Auto-PR.
- **Pushes once, at a clean finish,** `HEAD` to its recorded upstream.
- **Draft PRs only.** Opens one with
  `gh pr create --draft --base <base>`, or updates the open PR's title and
  body, from the recorded summary file. The base is the default branch
  unless you or the plan name another. If the open PR is already ready
  for review, it asks before pushing, since the push notifies reviewers.
- **One PR per roadmap.** Each phase pushes and updates the same PR,
  unless the roadmap says its phases merge on their own.

## What it is not

- **Not a merge tool.** It never marks a PR ready, merges, requests
  reviewers, adds labels, or deletes the remote branch.
- **Not a force-pusher.** It never uses `--force`, `--force-with-lease` or
  `--no-verify`, and never pushes to any branch but the recorded upstream.
- **Not a push-only mode.** Every clean finish opens or updates a PR, or
  asks first. To push without a PR, use Auto-commit and push by hand.

## When not to use

- **You want to review the branch before anything goes public** → use
  Auto-commit, then push yourself.
- **You are on the default branch** → the option is hidden; create a
  topic branch first.
- **Pushes trigger expensive or risky CI, deploys or webhooks** → use
  Auto-commit; a draft PR still runs CI.
- **A single small task** → nothing to batch; Claude skips the question.

**Negative example:** "Open a PR for this branch" on finished work is a
plain PR request, not a run; Auto-PR applies only to a run Claude commits.

## Install

Install `auto-commit` and `pr-summary` too: Auto-PR builds on the
`auto-commit` commit loop, and loads `pr-summary` to write the summary
file.

```bash
bunx skills add acfatah/skills -s auto-commit -a claude-code -g -y
bunx skills add acfatah/skills -s pr-summary -a claude-code -g -y
bunx skills add acfatah/skills -s auto-pr -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/auto-pr" ~/.claude/skills/auto-pr
```

It also needs the [GitHub CLI](https://cli.github.com), signed in with
`gh auth login`.

## Usage

### How it loads

- **From the auto-commit question.** When you pick Auto-PR in "Pause,
  Auto-commit or Auto-PR?", Claude loads this skill.
- **From a plan.** A plan whose `> Run mode:` line says Auto-PR loads it.
- **By trigger phrase.** "auto-PR", "open a PR when done" and "push and
  open a PR".
- **By name, always.** `/auto-pr …` or "use the auto-pr skill".
- **What Claude asks back:** usually nothing extra. Choosing Auto-PR up
  front is the request to push and open the PR. If a precondition fails,
  Claude says which one instead of offering the option. One question can
  come at the finish, before the push: when the open PR is ready for
  review, or its title or body was edited on GitHub since the last
  summary.

### Example prompts

- **Choose up front:** "Implement both phases, then push and open a PR."
  Claude runs as Auto-commit and opens a draft PR at a clean finish.
- **Plan mode:** "Make this a three-phase plan." Pick Auto-PR in the
  run-mode question; the plan records the upstream, base and summary file
  in its run-mode line.
- **Roadmap phase:** "/auto-pr implement phase 2 of
  .claude/plans/<topic>/roadmap.md." It commits the phase, writes the
  outcome, pushes, updates the roadmap's PR, and stops.
- **Fresh worktree:** "Run the plan in a new worktree, auto-PR." The new
  branch has no upstream, so Claude offers
  `Auto-PR (creates origin/<branch> at finish)`, and the first push at a
  clean finish creates it.
- **Undo:** "Close the PR." Claude runs `gh pr close <n>`; the pushed
  commits stay on the remote.

### Walkthrough

1. **Prepare the branch.** Create a topic branch.
2. **Plan the work.** In plan mode, ask for a two-phase change.
3. **Choose the mode.** Before approval, pick Auto-PR. The plan gains
   `> Run mode: Auto-PR (upstream: origin/<branch>, to create; base: main; summary: drafts/PR_SUMMARY-<task>.md) …`
   under its title.
4. **Let it run.** Claude commits Phase 1 and Phase 2. At the clean
   finish it re-checks the upstream, writes the recorded summary file
   with `pr-summary`, pushes with `-u` to create `origin/<branch>`, drops
   `, to create` from the run-mode line, and opens a draft PR against
   `main`.
5. **Read the report.** It lists the commits, the PR URL, whether the PR
   was opened or updated, and that it created `origin/<branch>`.

Gotchas:

- **Needs `auto-commit` installed.** Auto-PR is offered from its question
  and uses its commit loop.
- **The first push creates `origin/<branch>`,** at the first clean
  finish, and undo does not delete it; that needs its own request.
- **A name already taken on `origin` hides the option** for a branch with
  no upstream.
- **A branch tracking the default branch** fails the upstream check.
  Claude offers to unset that upstream in the run-mode question, so the
  first push creates `origin/<branch>`; it never unsets it on its own.
  Worktree branches from `git worktree add --no-track` or the built-in
  `EnterWorktree name=` have no upstream to begin with.
- **Pushes trigger CI,** even for a draft PR.
- **A stopped run pushes nothing.** Its commits stay local, as in
  Auto-commit, and the report says why.
- **A changed upstream stops the run.** If `@{u}` no longer matches the
  run-mode line, Claude stops before pushing.
- **A ready PR asks before the push.** Pushing alone notifies its
  reviewers, so Claude asks: push and replace title and body, push and
  keep them, or don't push (the default). If the PR is already ready at
  the run-mode question, Claude offers two Auto-PR options instead, and
  the answer goes into the run-mode line.
- **Replacing the body replaces the title too.** Both come from the
  summary file, its H1 and its content; keeping leaves both.
- **An edited draft asks too.** If the draft PR's title or body differs
  from the last summary file, Claude asks before replacing them. A
  missing summary file counts as edited.
- **The base of an existing PR never changes.** If it differs from the
  recorded base, Claude leaves it and notes it in the report.
- **Fork setups hide the option.** When the upstream's remote is a fork
  but `gh` resolves the parent repo, the repo check fails.
- **Only open, same-repo PRs are updated.** Closed and merged PRs, and
  fork PRs with the same branch name, are ignored; a new draft PR is
  opened instead.
- **A failed PR step after the push is reported,** as "Pushed, no PR" or
  "Pushed, PR not updated" with the `gh` error. Claude never retries
  without `--draft`.
- **Undo does not reach the remote.** `git reset --soft` cannot undo
  pushed commits; closing the PR is the undo.

The full rules are in [`SKILL.md`](SKILL.md).
