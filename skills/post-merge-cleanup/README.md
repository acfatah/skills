# post-merge-cleanup

An [agent skill](https://skills.sh) that cleans up after a merged PR. It
removes the PR's worktree, then its local branch, then its remote branch,
for one branch per run, together with that branch's fork sub-branches. It
checks first that nothing can be lost, shows one summary, and asks once.

## What it is

- **Resolves one branch** from a branch name, a PR number, a worktree path,
  or nothing (the current worktree's branch).
- **Includes fork sub-branches.** A topic branch brings its
  `<topic-branch>--<role>` sub-branches from `session-sync`, and their
  worktrees, into the same run. A sub-branch named on its own is cleaned
  up alone, even while the topic is still open.
- **Checks before asking:** the PR is merged, the local tip equals the
  merged PR head, the worktree is clean, it is not the default branch or
  the main worktree, and no symlinks point into the worktree. Any failure
  stops the run. A sub-branch has no PR, so it must instead be integrated
  into its topic branch: an ancestor of it, or adding nothing when merged
  (a squash).
- **Works after squash and rebase merges.** It compares the tip with the
  merged PR head instead of relying on `git branch -d`.
- **Shows one summary** (PR, worktree, local and remote branch, ignored
  files that will be deleted, warnings), with one row per branch, and asks
  once. Sub-branches are removed before the topic branch.
- **Runs in order:** `git worktree remove`, `git branch -D`,
  `git push origin --delete`, `git fetch --prune origin`. Parts that are
  already gone are reported and skipped.
- **Reports how to undo** each part, with the real SHA.

## What it is not

- **Not a sweep.** It never cleans up all merged branches; one run, one
  branch and its own `<b>--*` sub-branches.
- **Not a force tool.** It never uses `--force`, and never `rm -rf`s a
  worktree that `git worktree remove` refuses.
- **Not a standing approval.** Your "Clean up" covers one run; the next run
  asks again, even for the same branch.
- **Not for code cleanup.** Tidying code, files or imports is a different
  request.

## When not to use

- **The PR is not merged yet,** or there is no PR → not covered; the skill
  stops at its first check. Fork sub-branches are the exception: they
  need no PR.
- **The branch has commits after the merge** → not covered; the skill
  stops and shows both SHAs.
- **You want every merged branch gone at once** → not covered; run it once
  per branch.
- **`gh` is missing or not logged in** → the skill stops, because it cannot
  check the merge.

**Negative example:** "Clean up this function" does not load it; "cleanup"
and "housekeeping" load it only next to PR, branch, merged, or worktree
context.

## Install

```bash
bunx skills add acfatah/skills -s post-merge-cleanup -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/post-merge-cleanup" ~/.claude/skills/post-merge-cleanup
```

## Usage

### How it loads

- **By description match.** "PR merged", "clean up the branch", "remove
  the worktree", "delete the merged branch".
- **"cleanup" and "housekeeping" only in context.** Next to PR, branch,
  merged, or worktree they load it; alone they do not.
- **By name, always.** `/post-merge-cleanup …` or "use the
  post-merge-cleanup skill".
- **What Claude asks back:** one summary with **Clean up** or **Cancel**.
  For a detached worktree, it asks which branch is meant.

### Example prompts

- **Current worktree:** "PR merged, clean up." Run from inside the
  worktree; Claude leaves it with `ExitWorktree` before removing it.
- **By branch:** "Delete the merged branch `feat/login-form`."
- **Fork sub-branch:** "Clean up `feat/login--tests`, it's merged into
  `feat/login`."
- **By PR number:** "/post-merge-cleanup 42"
- **By worktree path:** "Remove the worktree at
  `~/code/app-login-form`, the PR is merged."
- **Housekeeping:** "Housekeeping for the merged `fix/typo` branch."

Gotchas:

- **Ignored files are deleted.** `git worktree remove` deletes ignored
  files such as `drafts/`, `.env` or `.claude/plans/` without a word. The
  summary lists them before you confirm.
- **Symlinks into the worktree stop the run.** A link in `~/.claude` or
  the main checkout that points into the worktree (for example a skill
  linked for testing) must be repointed or removed first.
- **The session leaves the worktree first.** Run from inside it, and
  Claude calls `ExitWorktree` with `keep`, then removes it with
  `git worktree remove`, never with `ExitWorktree remove`, which skips the
  merged-tip check. A session launched inside the worktree cannot leave
  it, so its directory is gone afterwards; restart from the main checkout.
- **Built-in branch names are fine.** A worktree from
  `EnterWorktree name=<n>` has the branch `worktree-<n>`; Claude resolves
  it like any other.
- **A branch checked out in the main checkout** is switched to the default
  branch first, and that checkout must be clean.
- **A `/fork` session can't run it.** The isolation guard refuses
  `git -C <main>`, so Claude stops before the checks and gives you a
  one-line request to run from a foreground session in the main checkout.
- **Squash-merged sub-branches need git 2.38+.** The check uses
  `git merge-tree --write-tree`; on an older git, or on a conflict, it
  fails and the run stops.
- **Undo restores branches, not ignored files.** The report gives
  `git branch <b> <sha>` and `git push origin <sha>:refs/heads/<b>`, but
  deleted ignored files do not come back.

The full rules are in [`SKILL.md`](SKILL.md).
