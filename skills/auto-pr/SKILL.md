---
name: auto-pr
description: "Opt-in Auto-PR run mode: commit each change as Auto-commit does, then push the branch to its upstream and open or update a draft PR after a clean finish. Load when the user picks Auto-PR in the auto-commit run-mode question, when a plan's run-mode line says Auto-PR, or when the user says \"auto-PR\", \"open a PR when done\", or \"push and open a PR\". Depends on the auto-commit skill for the commit loop."
---

# Auto-PR v1.0.0

## What it adds to Auto-commit

Auto-PR is Auto-commit plus one step at the end. Everything in the
`auto-commit` skill still applies: the question, the baseline, staging by
path, checks before each commit, gaps, and the report. This skill adds only
the push and the draft PR, once, after a run that finishes cleanly. Without
`auto-commit` loaded, load it first; without it installed, Auto-PR is not
available. The push is outward-facing: it can trigger CI, deploys and
webhooks, even for a draft PR.

## Preconditions

Offer Auto-PR only when all of these pass. Otherwise hide the option and
say in one line which check failed.

- **Not the default branch.** The current branch is not the repo's default
  branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`,
  or `git symbolic-ref --short refs/remotes/origin/HEAD`).
- **Has an upstream.**
  `git rev-parse --abbrev-ref --symbolic-full-name @{u}` succeeds, and the
  upstream is not the default branch either. A topic branch tracking
  `origin/main` fails this check.
- **`gh` is signed in.** `gh auth status` succeeds.
- **Worktrees work the same.** A fresh `git worktree add -b <branch>`
  branch has no upstream. The hidden-option message then says to run
  `git push -u origin <branch>` first.

## Recording the choice

In a plan, write the choice under the title, below any stop line, with the
upstream from `@{u}`:

    > Run mode: Auto-PR (upstream: origin/<branch>). Commit each phase, then push and open or update a draft PR after a clean finish; stop on any gap. See the auto-pr skill.

- **The upstream is recorded** so a fresh session can check the branch
  before pushing.
- **Without a plan,** the choice lasts for this session only, as in
  Auto-commit.
- **Never save it to memory, never infer it.** Choosing Auto-PR is the
  explicit request to push and open the PR; nothing else is.

## What it authorizes

Everything Auto-commit authorizes, plus, once per clean finish:

- **Push `HEAD` to its recorded upstream,** with the remote and branch
  taken from `@{u}`: `git push <remote> HEAD:<branch>`.
- **Create a draft PR** with `gh pr create --draft`, or **update the open
  PR's body** for the branch with `gh pr edit --body-file`.
- **Write or update `drafts/PR_SUMMARY-<task>.md`,** per the PR rules in
  `CLAUDE.md`.

## What it never authorizes

- **Force:** `--force`, `--force-with-lease`, or any rewrite of pushed
  history.
- **Skipping hooks:** `--no-verify`.
- **Other branches:** pushing anything but `HEAD`, or to anything but the
  recorded upstream.
- **PR state changes:** marking ready, merging, closing (except the undo
  below), requesting reviewers, or adding labels.
- **Deleting the remote branch.**
- **A second PR** for a branch that already has an open one.

A rejected push is an unsafe gap: stop and report it.

## Finishing a run

1. **Clean-finish test.** Every phase or change is committed, checks
   passed, and no hard or unsafe gap is open. A run that stops pushes
   nothing; its commits stay local, as in Auto-commit.
2. **Re-check the upstream.** Run the preconditions again. If `@{u}`
   differs from the upstream in the run-mode line, that is a hard gap:
   stop before pushing.
3. **Write the PR body.** Make sure `drafts/` is ignored first (see
   `CLAUDE.md`), then write or update `drafts/PR_SUMMARY-<task>.md`: a
   title and a description covering every commit of the branch, ending
   with the PR attribution line.
4. **Push** `HEAD` to the upstream.
5. **Open or update.** If `gh pr view` finds an open PR for the branch,
   run `gh pr edit <n> --body-file drafts/PR_SUMMARY-<task>.md`.
   Otherwise run
   `gh pr create --draft --title "<title>" --body-file drafts/PR_SUMMARY-<task>.md`.

No second question at the end. The draft PR is the safety valve: nothing
is merged or sent for review until the user does it.

## Stop or finish report

Report everything Auto-commit reports, plus:

- **PR:** its URL, and whether it was opened or updated.
- **Undo:** close the PR with `gh pr close <n>`. Pushed commits stay
  pushed; `git reset --soft <base>` does not undo them, and rewriting the
  remote needs its own explicit request.
- **Nothing pushed,** when the run stopped, with the reason.

## Roadmaps

- **One PR per roadmap.** The roadmap keeps one topic branch for all
  phases. The first phase that finishes cleanly pushes and opens the
  draft PR. Later phases push and update `PR_SUMMARY-<roadmap>.md` and
  the PR body.
- **Exception:** a roadmap that says its phases merge on their own may use
  one branch and one PR per phase.
- **Each session still stops.** Finishing phase N under Auto-PR: commit,
  write the outcome, push and open or update the PR, then stop. Never plan
  or start the next phase.
